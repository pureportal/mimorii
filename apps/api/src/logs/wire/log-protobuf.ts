import { LogQueryError, parseLogQuery } from "@mimorii/contracts";
import type {
  LokiPushPayload,
  OtlpAnyValue,
  OtlpKeyValue,
  OtlpLogsPayload,
} from "../log-ingestion-payloads.js";
import { ProtobufReader, WirePayloadError, wireTypes } from "./protobuf-reader.js";
import { decompressSnappy } from "./snappy.js";

const maximumAnyValueDepth = 16;

export function decodeLokiProtobuf(body: Uint8Array): LokiPushPayload {
  const reader = new ProtobufReader(decompressSnappy(body));
  const streams: LokiPushPayload["streams"] = [];
  while (!reader.done) {
    const { field, wireType } = reader.tag();
    if (field === 1 && wireType === wireTypes.lengthDelimited)
      streams.push(lokiStream(reader.message()));
    else reader.skip(wireType);
  }
  return { streams };
}

export function decodeOtlpProtobuf(body: Uint8Array): OtlpLogsPayload {
  const reader = new ProtobufReader(body);
  const resourceLogs: OtlpLogsPayload["resourceLogs"] = [];
  while (!reader.done) {
    const { field, wireType } = reader.tag();
    if (field === 1 && wireType === wireTypes.lengthDelimited) {
      resourceLogs.push(resourceLog(reader.message()));
    } else {
      reader.skip(wireType);
    }
  }
  return { resourceLogs };
}

function lokiStream(reader: ProtobufReader): LokiPushPayload["streams"][number] {
  let labels = "{}";
  const values: unknown[] = [];
  while (!reader.done) {
    const { field, wireType } = reader.tag();
    if (field === 1 && wireType === wireTypes.lengthDelimited) labels = reader.string();
    else if (field === 2 && wireType === wireTypes.lengthDelimited)
      values.push(lokiEntry(reader.message()));
    else reader.skip(wireType);
  }
  return { stream: lokiLabels(labels), values };
}

function lokiEntry(
  reader: ProtobufReader
): [string, string] | [string, string, Record<string, string>] {
  let seconds = 0n;
  let nanos = 0n;
  let line = "";
  const metadata: Record<string, string> = {};
  while (!reader.done) {
    const { field, wireType } = reader.tag();
    if (field === 1 && wireType === wireTypes.lengthDelimited) {
      const timestamp = reader.message();
      while (!timestamp.done) {
        const part = timestamp.tag();
        if (part.field === 1 && part.wireType === wireTypes.varint) seconds = timestamp.int64();
        else if (part.field === 2 && part.wireType === wireTypes.varint) nanos = timestamp.int64();
        else timestamp.skip(part.wireType);
      }
    } else if (field === 2 && wireType === wireTypes.lengthDelimited) {
      line = reader.string();
    } else if (field === 3 && wireType === wireTypes.lengthDelimited) {
      const pair = reader.message();
      let name = "";
      let value = "";
      while (!pair.done) {
        const part = pair.tag();
        if (part.field === 1 && part.wireType === wireTypes.lengthDelimited) name = pair.string();
        else if (part.field === 2 && part.wireType === wireTypes.lengthDelimited)
          value = pair.string();
        else pair.skip(part.wireType);
      }
      if (name) metadata[name] = value;
    } else {
      reader.skip(wireType);
    }
  }
  const timestamp = (seconds * 1_000_000_000n + nanos).toString();
  return Object.keys(metadata).length ? [timestamp, line, metadata] : [timestamp, line];
}

function lokiLabels(selector: string): Record<string, string> {
  try {
    const query = parseLogQuery(selector);
    return Object.fromEntries(
      query.matchers
        .filter((matcher) => matcher.operator === "=")
        .map((matcher) => [matcher.label, matcher.value])
    );
  } catch (error) {
    if (error instanceof LogQueryError)
      throw new WirePayloadError("Loki stream labels are invalid");
    throw error;
  }
}

function resourceLog(reader: ProtobufReader): OtlpLogsPayload["resourceLogs"][number] {
  let attributes: OtlpKeyValue[] = [];
  const scopeLogs: NonNullable<OtlpLogsPayload["resourceLogs"][number]["scopeLogs"]> = [];
  while (!reader.done) {
    const { field, wireType } = reader.tag();
    if (field === 1 && wireType === wireTypes.lengthDelimited) {
      attributes = keyValues(reader.message(), 1, 0);
    } else if (field === 2 && wireType === wireTypes.lengthDelimited) {
      const scope = reader.message();
      const logRecords: NonNullable<(typeof scopeLogs)[number]["logRecords"]> = [];
      while (!scope.done) {
        const part = scope.tag();
        if (part.field === 2 && part.wireType === wireTypes.lengthDelimited)
          logRecords.push(logRecord(scope.message()));
        else scope.skip(part.wireType);
      }
      scopeLogs.push({ logRecords });
    } else {
      reader.skip(wireType);
    }
  }
  return { resource: { attributes }, scopeLogs };
}

function logRecord(reader: ProtobufReader) {
  const record: {
    timeUnixNano?: string;
    observedTimeUnixNano?: string;
    severityNumber?: number;
    severityText?: string;
    body?: OtlpAnyValue;
    attributes: OtlpKeyValue[];
    traceId?: string;
    spanId?: string;
  } = { attributes: [] };
  while (!reader.done) {
    const { field, wireType } = reader.tag();
    if (field === 1 && wireType === wireTypes.fixed64)
      record.timeUnixNano = reader.fixed64().toString();
    else if (field === 2 && wireType === wireTypes.varint) record.severityNumber = reader.uint32();
    else if (field === 3 && wireType === wireTypes.lengthDelimited)
      record.severityText = reader.string();
    else if (field === 5 && wireType === wireTypes.lengthDelimited)
      record.body = anyValue(reader.message(), 0);
    else if (field === 6 && wireType === wireTypes.lengthDelimited)
      record.attributes.push(keyValue(reader.message(), 0));
    else if (field === 9 && wireType === wireTypes.lengthDelimited)
      record.traceId = hex(reader.bytes());
    else if (field === 10 && wireType === wireTypes.lengthDelimited)
      record.spanId = hex(reader.bytes());
    else if (field === 11 && wireType === wireTypes.fixed64)
      record.observedTimeUnixNano = reader.fixed64().toString();
    else reader.skip(wireType);
  }
  if (record.traceId === "") delete record.traceId;
  if (record.spanId === "") delete record.spanId;
  return record;
}

function keyValues(reader: ProtobufReader, field: number, depth: number): OtlpKeyValue[] {
  const values: OtlpKeyValue[] = [];
  while (!reader.done) {
    const tag = reader.tag();
    if (tag.field === field && tag.wireType === wireTypes.lengthDelimited)
      values.push(keyValue(reader.message(), depth));
    else reader.skip(tag.wireType);
  }
  return values;
}

function keyValue(reader: ProtobufReader, depth: number): OtlpKeyValue {
  const result: OtlpKeyValue = { key: "" };
  while (!reader.done) {
    const { field, wireType } = reader.tag();
    if (field === 1 && wireType === wireTypes.lengthDelimited) result.key = reader.string();
    else if (field === 2 && wireType === wireTypes.lengthDelimited)
      result.value = anyValue(reader.message(), depth + 1);
    else reader.skip(wireType);
  }
  return result;
}

function anyValue(reader: ProtobufReader, depth: number): OtlpAnyValue {
  if (depth > maximumAnyValueDepth) throw new WirePayloadError("OTLP values are nested too deeply");
  const value: OtlpAnyValue = {};
  while (!reader.done) {
    const { field, wireType } = reader.tag();
    if (field === 1 && wireType === wireTypes.lengthDelimited) value.stringValue = reader.string();
    else if (field === 2 && wireType === wireTypes.varint) value.boolValue = reader.bool();
    else if (field === 3 && wireType === wireTypes.varint)
      value.intValue = reader.int64().toString();
    else if (field === 4 && wireType === wireTypes.fixed64) value.doubleValue = reader.double();
    else if (field === 5 && wireType === wireTypes.lengthDelimited) {
      const array = reader.message();
      const values: OtlpAnyValue[] = [];
      while (!array.done) {
        const tag = array.tag();
        if (tag.field === 1 && tag.wireType === wireTypes.lengthDelimited)
          values.push(anyValue(array.message(), depth + 1));
        else array.skip(tag.wireType);
      }
      value.arrayValue = { values };
    } else if (field === 6 && wireType === wireTypes.lengthDelimited) {
      value.kvlistValue = { values: keyValues(reader.message(), 1, depth + 1) };
    } else if (field === 7 && wireType === wireTypes.lengthDelimited) {
      value.bytesValue = Buffer.from(reader.bytes()).toString("base64");
    } else {
      reader.skip(wireType);
    }
  }
  return value;
}

function hex(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("hex");
}
