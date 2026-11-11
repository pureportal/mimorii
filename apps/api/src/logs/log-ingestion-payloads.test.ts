import { BadRequestException } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import {
  parseLokiLogPayload,
  parseNativeLogPayload,
  parseNdjsonLogPayload,
  parseOtlpLogPayload,
} from "./log-ingestion-payloads.js";
import { detectLogLevel } from "./log-levels.js";
import { microsToIso } from "./log-timestamps.js";
import { decodeLokiProtobuf, decodeOtlpProtobuf } from "./wire/log-protobuf.js";
import { WirePayloadError } from "./wire/protobuf-reader.js";
import { decompressSnappy } from "./wire/snappy.js";

const encoder = new TextEncoder();

function varint(value: bigint | number): number[] {
  let remaining = BigInt(value);
  const bytes: number[] = [];
  do {
    let byte = Number(remaining & 0x7fn);
    remaining >>= 7n;
    if (remaining) byte |= 0x80;
    bytes.push(byte);
  } while (remaining);
  return bytes;
}

const bytes = (...parts: Array<number[] | Uint8Array>) =>
  Uint8Array.from(parts.flatMap((part) => [...part]));
const message = (field: number, ...content: Array<number[] | Uint8Array>) => {
  const body = bytes(...content);
  return bytes(varint(field * 8 + 2), varint(body.length), body);
};
const text = (field: number, value: string) => message(field, encoder.encode(value));
const integer = (field: number, value: bigint | number) => bytes(varint(field * 8), varint(value));
const fixed64 = (field: number, value: bigint) => {
  const buffer = new Uint8Array(8);
  new DataView(buffer.buffer).setBigUint64(0, value, true);
  return bytes(varint(field * 8 + 1), buffer);
};

function snappyLiteral(data: Uint8Array): Uint8Array {
  const chunks: number[][] = [];
  for (let offset = 0; offset < data.length; offset += 60) {
    const chunk = data.subarray(offset, offset + 60);
    chunks.push([(chunk.length - 1) << 2, ...chunk]);
  }
  return bytes(varint(data.length), ...chunks);
}

describe("log ingestion payloads", () => {
  it("accepts single entries, arrays, batches, and plain text", () => {
    expect(parseNativeLogPayload({ message: "Error 404 - Failed to load" })).toEqual({
      entries: [
        {
          index: 0,
          labels: {},
          timestamp: null,
          level: "error",
          message: "Error 404 - Failed to load",
          attributes: {},
        },
      ],
      rejected: [],
    });

    const batch = parseNativeLogPayload({
      labels: { service: "web" },
      entries: [
        {
          timestamp: "2026-11-11T10:00:00.123456Z",
          level: "WARNING",
          message: "Slow request",
          labels: { route: "checkout" },
          attributes: { durationMs: 2300 },
        },
        { message: "missing timestamp", timestamp: "yesterday" },
        "plain line",
      ],
    });
    expect(batch.entries.map((entry) => [entry.index, entry.level, entry.labels])).toEqual([
      [0, "warn", { service: "web", route: "checkout" }],
      [2, "unknown", { service: "web" }],
    ]);
    expect(microsToIso(batch.entries[0]!.timestamp!)).toBe("2026-11-11T10:00:00.123456Z");
    expect(batch.rejected).toEqual([
      { index: 1, reason: "The timestamp must be ISO 8601 or a Unix epoch number" },
    ]);

    expect(parseNativeLogPayload([{ message: "a" }, "b"]).entries).toHaveLength(2);
    expect(
      parseNativeLogPayload("first line\n\nDEBUG second line\r\n").entries.map((line) => line.level)
    ).toEqual(["unknown", "debug"]);
  });

  it("reads NDJSON with JSON entries and raw lines", () => {
    const payload = parseNdjsonLogPayload(
      '{"message":"from json","level":"error"}\nnot json\n{"msg":"pino style","level":30}\n'
    );
    expect(payload.entries.map((entry) => [entry.message, entry.level])).toEqual([
      ["from json", "error"],
      ["not json", "unknown"],
      ['{"msg":"pino style","level":30}', "unknown"],
    ]);
  });

  it("rejects structurally invalid requests as a whole", () => {
    expect(() => parseNativeLogPayload({ entries: [] })).toThrow(BadRequestException);
    expect(() => parseLokiLogPayload({ streams: [] })).toThrow(BadRequestException);
  });

  it("reads Loki push requests with structured metadata and per-entry errors", () => {
    const payload = parseLokiLogPayload({
      streams: [
        {
          stream: { job: "nginx", level: "error" },
          values: [
            ["1762855200123456789", "upstream timed out"],
            ["1762855200200000000", "GET /health 200", { trace_id: "abc" }],
            ["soon", "line"],
          ],
        },
      ],
    });
    expect(payload.entries.map((entry) => microsToIso(entry.timestamp!))).toEqual([
      "2025-11-11T10:00:00.123456Z",
      "2025-11-11T10:00:00.200000Z",
    ]);
    expect(payload.entries[1]!.attributes).toEqual({ trace_id: "abc" });
    expect(payload.rejected).toEqual([
      { index: 2, reason: "The timestamp must be Unix epoch nanoseconds" },
    ]);
  });

  it("maps OTLP resources to labels and records to entries", () => {
    const [entry] = parseOtlpLogPayload({
      resourceLogs: [
        {
          resource: {
            attributes: [
              { key: "service.name", value: { stringValue: "checkout" } },
              { key: "process.pid", value: { intValue: "4242" } },
            ],
          },
          scopeLogs: [
            {
              scope: { name: "app" },
              logRecords: [
                {
                  timeUnixNano: "1762855200000000000",
                  severityNumber: 17,
                  body: {
                    kvlistValue: { values: [{ key: "msg", value: { stringValue: "boom" } }] },
                  },
                  attributes: [{ key: "http.status_code", value: { intValue: 500 } }],
                  traceId: "trace-1",
                },
              ],
            },
          ],
        },
      ],
    }).entries;

    expect(entry).toMatchObject({
      labels: { service_name: "checkout" },
      level: "error",
      message: '{"msg":"boom"}',
      attributes: { "process.pid": 4242, "http.status_code": 500, trace_id: "trace-1" },
    });
  });

  it("decodes snappy blocks with literals and back references", () => {
    const literal = encoder.encode("abc");
    const compressed = bytes(
      varint(9),
      [(literal.length - 1) << 2, ...literal],
      [((6 - 4) << 2) | 1, 3]
    );
    expect(new TextDecoder().decode(decompressSnappy(compressed))).toBe("abcabcabc");
    expect(() => decompressSnappy(bytes(varint(9), [((6 - 4) << 2) | 1, 3]))).toThrow(
      WirePayloadError
    );
  });

  it("decodes Loki protobuf push requests", () => {
    const timestamp = message(1, integer(1, 1_762_855_200n), integer(2, 123_456_789));
    const entry = message(
      2,
      timestamp,
      text(2, "upstream timed out"),
      message(3, text(1, "trace_id"), text(2, "abc"))
    );
    const stream = message(1, text(1, '{job="nginx", level="error"}'), entry);
    const decoded = decodeLokiProtobuf(snappyLiteral(stream));

    expect(decoded).toEqual({
      streams: [
        {
          stream: { job: "nginx", level: "error" },
          values: [["1762855200123456789", "upstream timed out", { trace_id: "abc" }]],
        },
      ],
    });
    expect(parseLokiLogPayload(decoded).entries[0]).toMatchObject({
      level: "error",
      message: "upstream timed out",
    });
  });

  it("decodes OTLP protobuf export requests", () => {
    const anyString = (value: string) => text(1, value);
    const keyValue = (key: string, value: Uint8Array) => bytes(text(1, key), message(2, value));
    const record = bytes(
      fixed64(1, 1_762_855_200_000_000_123n),
      integer(2, 13),
      message(5, anyString("disk almost full")),
      message(6, keyValue("disk.free_percent", integer(3, 4))),
      message(9, Uint8Array.from([0xab, 0xcd]))
    );
    const resource = message(1, message(1, keyValue("service.name", anyString("storage"))));
    const scope = message(2, message(2, record));
    const decoded = decodeOtlpProtobuf(message(1, resource, scope));
    const [entry] = parseOtlpLogPayload(decoded).entries;

    expect(entry).toMatchObject({
      labels: { service_name: "storage" },
      level: "warn",
      message: "disk almost full",
      attributes: { "disk.free_percent": 4, trace_id: "abcd" },
    });
    expect(microsToIso(entry!.timestamp!)).toBe("2025-11-11T10:00:00.000000Z");
    expect(() => decodeOtlpProtobuf(Uint8Array.from([0x0a, 0x05, 0x01]))).toThrow(WirePayloadError);
  });

  it("detects levels from hints, structured lines, and keywords", () => {
    expect(detectLogLevel("anything", undefined, "CRIT")).toBe("fatal");
    expect(detectLogLevel('{"level":"warn","msg":"disk"}')).toBe("warn");
    expect(detectLogLevel("ts=1 level=debug msg=ok")).toBe("debug");
    expect(detectLogLevel("[INFO] started")).toBe("info");
    expect(detectLogLevel("no level here")).toBe("unknown");
  });
});
