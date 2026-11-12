import type { HeartbeatMonitorSummary } from "@mimorii/contracts";
import { describe, expect, it } from "vitest";
import {
  foxytailHighlights,
  heartbeatProblems,
  heartbeatState,
  timelineTone,
  timelineTotals,
} from "./heartbeat-state";

const now = Date.parse("2026-11-12T12:00:00.000Z");

function heartbeat(overrides: Partial<HeartbeatMonitorSummary> = {}): HeartbeatMonitorSummary {
  return {
    id: "heartbeat-1",
    teamId: "team-1",
    resourceId: "resource-1",
    resourceName: "Foxytail",
    name: "Foxytail",
    status: "down",
    enabled: true,
    intervalSeconds: 60,
    graceSeconds: 120,
    maxRuntimeSeconds: null,
    lastPingAt: "2026-11-12T11:59:40.000Z",
    lastStartedAt: null,
    runningSince: null,
    nextExpectedAt: "2026-11-12T12:00:40.000Z",
    nextDeadlineAt: "2026-11-12T12:02:40.000Z",
    lastDurationMs: null,
    lastMessage: "Failed jobs: 8; Unavailable media files: 164",
    lastEventType: "failed",
    lastSuccessAt: null,
    statusSince: "2026-11-06T08:00:00.000Z",
    latestMetadata: {},
    timeline: [],
    runs30d: 7_383,
    successfulRuns30d: 0,
    successRate30d: 0,
    averageDurationMs30d: null,
    createdAt: "2026-11-05T23:10:31.244Z",
    ...overrides,
  };
}

describe("heartbeat state", () => {
  it("separates reported failures from missed signals and says how long they lasted", () => {
    expect(heartbeatState(heartbeat(), now)).toEqual({
      badge: "down",
      label: "Failing",
      tone: "danger",
      headline: "Reporting problems for 6d 4h",
    });
    expect(
      heartbeatState(
        heartbeat({ lastEventType: "missed", statusSince: "2026-11-12T11:48:00.000Z" }),
        now
      ).headline
    ).toBe("No signal for 12m");
    expect(
      heartbeatState(
        heartbeat({
          status: "up",
          lastEventType: "succeeded",
          statusSince: "2026-11-12T09:00:00.000Z",
        }),
        now
      )
    ).toMatchObject({ label: "Up", headline: "Healthy for 3h 0m" });
    expect(heartbeatState(heartbeat({ enabled: false, status: "paused" }), now).label).toBe(
      "Paused"
    );
    expect(
      heartbeatState(heartbeat({ status: "pending", lastEventType: null }), now).headline
    ).toBe("Waiting for the first signal");
  });

  it("splits reported problems into labelled values", () => {
    expect(heartbeatProblems(heartbeat())).toEqual([
      { label: "Failed jobs", value: "8" },
      { label: "Unavailable media files", value: "164" },
    ]);
    expect(heartbeatProblems(heartbeat({ lastMessage: "Backup disk is full" }))).toEqual([
      { label: "Backup disk is full", value: null },
    ]);
    expect(heartbeatProblems(heartbeat({ lastEventType: "missed" }))).toEqual([]);
  });

  it("colours timeline hours by outcome and totals them", () => {
    const bucket = { start: "2026-11-12T11:00:00.000Z", succeeded: 0, failed: 0, missed: 0 };
    expect(timelineTone(bucket)).toBe("neutral");
    expect(timelineTone({ ...bucket, succeeded: 40 })).toBe("success");
    expect(timelineTone({ ...bucket, succeeded: 30, failed: 2 })).toBe("warning");
    expect(timelineTone({ ...bucket, failed: 48 })).toBe("danger");
    expect(timelineTone({ ...bucket, succeeded: 10, missed: 1 })).toBe("danger");
    expect(
      timelineTotals([
        { ...bucket, failed: 48 },
        { ...bucket, succeeded: 3, missed: 1 },
      ])
    ).toEqual({ succeeded: 3, failed: 48, missed: 1 });
  });

  it("summarises the latest Foxytail report", () => {
    expect(
      foxytailHighlights({
        database: true,
        redis: false,
        downloadsActive: 2,
        downloadsQueued: 5,
        downloadCompletions24h: 13,
        downloadFailures24h: 0,
        requestsPending: 6,
        mediaBytes: 29_654_907_926_686,
        version: "0.18.0",
      })
    ).toEqual([
      { label: "Services", value: "Redis down", tone: "danger" },
      { label: "Downloads", value: "2 active · 5 queued" },
      { label: "Last 24 hours", value: "13 completed · 0 failed", tone: undefined },
      { label: "Requests", value: "6 pending" },
      { label: "Library size", value: "27.0 TB" },
      { label: "Foxytail", value: "0.18.0" },
    ]);
    expect(foxytailHighlights({})).toEqual([]);
  });
});
