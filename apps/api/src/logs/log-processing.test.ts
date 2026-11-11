import { logPatternRegex } from "@mimorii/contracts";
import { describe, expect, it } from "vitest";
import { detectLogFields } from "./log-enrichment.js";
import { prepareLogBatch } from "./log-entry-preparation.js";
import { extractLogPatterns, maskLogLine } from "./log-patterns.js";
import { epochNumberToMicros, isoToMicros, microsToIso } from "./log-timestamps.js";

const receivedAt = new Date("2026-11-11T12:00:00.000Z");

describe("log timestamps", () => {
  it("keeps microseconds and guesses epoch units", () => {
    expect(microsToIso(isoToMicros("2026-11-11T10:00:00.123456789Z")!)).toBe(
      "2026-11-11T10:00:00.123456Z"
    );
    expect(microsToIso(isoToMicros("2026-11-11 10:00:00,5")!)).toBe("2026-11-11T10:00:00.500000Z");
    expect(epochNumberToMicros(1_762_855_200)).toBe(1_762_855_200_000_000);
    expect(epochNumberToMicros(1_762_855_200_123)).toBe(1_762_855_200_123_000);
    expect(epochNumberToMicros(1_762_855_200_123_456)).toBe(1_762_855_200_123_456);
    expect(isoToMicros("yesterday")).toBeNull();
  });
});

describe("detected log fields", () => {
  it("extracts JSON and logfmt fields and timestamps", () => {
    expect(
      detectLogFields(
        '{"time":"2026-11-11T11:59:00Z","level":"error","msg":"boom","status":500,"http":{"route":"/a"}}'
      )
    ).toEqual({
      fields: { status: 500, "http.route": "/a" },
      timestamp: isoToMicros("2026-11-11T11:59:00Z"),
    });
    expect(detectLogFields('ts=1762862340 level=info user="ada lovelace" took=12')).toEqual({
      fields: { user: "ada lovelace", took: 12 },
      timestamp: 1_762_862_340_000_000,
    });
    expect(detectLogFields("Error 404 - Failed to load")).toEqual({ fields: {}, timestamp: null });
  });
});

describe("log entry preparation", () => {
  it("rejects bad entries individually and truncates oversized content", () => {
    const batch = prepareLogBatch(
      [
        {
          index: 0,
          labels: { service: "spoofed", level: "error" },
          timestamp: null,
          level: "error",
          message: '{"time":"2026-11-11T11:59:30Z","status":503,"msg":"upstream"}',
          attributes: { "bad key": 1, note: "x".repeat(5_000) },
        },
        {
          index: 1,
          labels: {},
          timestamp: receivedAt.getTime() * 1_000 + 3_600_000_000,
          level: "info",
          message: "from the future",
          attributes: {},
        },
        {
          index: 2,
          labels: { "1bad": "x" },
          timestamp: null,
          level: "info",
          message: "bad label",
          attributes: {},
        },
        {
          index: 3,
          labels: {},
          timestamp: null,
          level: "info",
          message: "y".repeat(70_000),
          attributes: {},
        },
      ],
      { sourceLabels: { service: "web" }, retentionDays: 14, receivedAt }
    );

    expect(batch.rejected.map((item) => item.index)).toEqual([1, 2]);
    expect(batch.rejected[0]!.reason).toBe("The timestamp is too far in the future");
    expect(batch.truncated).toBe(2);
    const [first, last] = batch.entries;
    expect(first!.timestamp).toBe("2026-11-11T11:59:30.000000Z");
    expect(JSON.parse(first!.attributes)).toEqual({
      status: 503,
      note: `${"x".repeat(4_095)}…`,
      truncated: true,
    });
    expect([...batch.streams.values()].map((stream) => stream.labels)).toEqual([
      { service: "web" },
    ]);
    expect(last!.message).toHaveLength(65_536);
    expect(last!.timestamp).toBe("2026-11-11T12:00:00.000000Z");
  });
});

describe("log patterns", () => {
  it("masks variable tokens and merges similar lines", () => {
    expect(
      maskLogLine(
        "GET /users/42 took 12ms from 10.0.0.7:5432 id=3f2a9c1e-1111-4a2b-9c3d-0123456789ab"
      ).join(" ")
    ).toBe("GET /users/<_> took <_> from <_> id=<_>");
    const now = Date.parse("2026-11-11T12:00:00Z");
    const samples = [
      ...Array.from({ length: 5 }, (_, index) => ({
        message: `Payment ${index} failed for order A${index}9 after 3 retries`,
        level: "error" as const,
        timestamp: now - index * 60_000,
      })),
      { message: "Cache warmed", level: "info" as const, timestamp: now },
    ];
    const patterns = extractLogPatterns(
      samples,
      { from: now - 3_600_000, to: now },
      { limit: 10, trendBuckets: 6 }
    );
    expect(patterns.map((pattern) => [pattern.pattern, pattern.count])).toEqual([
      ["Payment <_> failed for order <_> after <_> retries", 5],
      ["Cache warmed", 1],
    ]);
    expect(patterns[0]!.levels).toEqual({ error: 5 });
    expect(patterns[0]!.trend.reduce((total, count) => total + count, 0)).toBe(5);
    expect(
      new RegExp(logPatternRegex(patterns[0]!.pattern)).test(
        "Payment 7 failed for order B7 after 1 retries"
      )
    ).toBe(true);
  });
});

describe("JSON log patterns", () => {
  it("keeps message-like keys readable and masks other values", () => {
    expect(
      maskLogLine(
        '{"level":"error","msg":"Payment provider timed out","status":500,"order_id":"A-1"}'
      ).join(" ")
    ).toBe('{"level":"error","msg":"Payment provider timed out","status":<_>,"order_id":<_>}');
  });
});
