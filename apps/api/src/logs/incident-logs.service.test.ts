import type { LogPattern } from "@mimorii/contracts";
import { describe, expect, it } from "vitest";
import { incidentLogWindow, prioritizedPatterns } from "./incident-logs.service.js";

function pattern(name: string, count: number, levels: LogPattern["levels"]): LogPattern {
  return {
    pattern: name,
    count,
    levels,
    firstSeen: "2026-11-10T10:00:00.000Z",
    lastSeen: "2026-11-10T10:05:00.000Z",
    sample: name,
    trend: [],
  };
}

describe("incident logs", () => {
  const now = Date.parse("2026-11-10T12:00:00.000Z");

  it("covers the incident with a lead and trail capped at the present", () => {
    expect(
      incidentLogWindow(
        { started_at: "2026-11-10T10:00:00.000Z", resolved_at: "2026-11-10T10:30:00.000Z" },
        now
      )
    ).toEqual({
      from: new Date("2026-11-10T09:45:00.000Z"),
      to: new Date("2026-11-10T10:45:00.000Z"),
    });
    expect(
      incidentLogWindow({ started_at: "2026-11-10T11:58:00.000Z", resolved_at: null }, now)
    ).toEqual({
      from: new Date("2026-11-10T11:43:00.000Z"),
      to: new Date(now),
    });
    expect(
      incidentLogWindow({ started_at: "2026-10-01T00:00:00.000Z", resolved_at: null }, now).from
    ).toEqual(new Date(now - 7 * 86_400_000));
  });

  it("ranks error patterns ahead of frequent informational ones", () => {
    const ranked = prioritizedPatterns([
      pattern("info", 900, { info: 900 }),
      pattern("warn", 40, { warn: 40 }),
      pattern("error", 3, { error: 3 }),
      pattern("fatal", 1, { fatal: 1, error: 4 }),
    ]);
    expect(ranked.map((item) => item.pattern)).toEqual(["fatal", "error", "warn", "info"]);
  });
});
