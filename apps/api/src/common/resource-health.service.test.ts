import { afterEach, describe, expect, it, vi } from "vitest";
import type { DatabaseService } from "../database/database.service.js";
import { ResourceHealthService } from "./resource-health.service.js";

const resourceRow = {
  resource_id: "resource-1",
  source: "resource",
  status: null,
  check_type: null,
  agent_kind: "desktop",
  agent_last_seen_at: "2026-08-25T11:59:30.000Z",
  agent_collection_interval_seconds: 30,
  latest_metrics_json: null,
} as const;

const checkRow = {
  resource_id: "resource-1",
  source: "check",
  status: "down",
  check_type: "disk",
  agent_kind: "desktop",
  agent_last_seen_at: "2026-08-25T11:59:30.000Z",
  agent_collection_interval_seconds: 30,
  latest_metrics_json: "{}",
} as const;

describe("ResourceHealthService", () => {
  afterEach(() => vi.useRealTimers());

  it("returns critical for a recently reported critical check", async () => {
    setNow();
    const health = service([resourceRow, checkRow]);

    await expect(health.forResources("team-1", ["resource-1"])).resolves.toEqual(
      new Map([["resource-1", "critical"]])
    );
  });

  it("returns down for an unavailable connectivity check", async () => {
    setNow();
    const health = service([resourceRow, { ...checkRow, check_type: "http" }]);

    await expect(health.forResources("team-1", ["resource-1"])).resolves.toEqual(
      new Map([["resource-1", "down"]])
    );
  });

  it("returns down when the check reporter is offline", async () => {
    setNow();
    const health = service([
      resourceRow,
      { ...checkRow, agent_last_seen_at: "2026-08-25T11:50:00.000Z" },
    ]);

    await expect(health.forResources("team-1", ["resource-1"])).resolves.toEqual(
      new Map([["resource-1", "down"]])
    );
  });

  it("returns down for a scheduler-recorded missed check report", async () => {
    setNow();
    const health = service([
      resourceRow,
      { ...checkRow, status: "degraded", latest_metrics_json: '{"agentTimeout":true}' },
    ]);

    await expect(health.forResources("team-1", ["resource-1"])).resolves.toEqual(
      new Map([["resource-1", "down"]])
    );
  });

  it("keeps a critical check critical while the host reporter is stale", async () => {
    setNow();
    const stale = "2026-08-25T11:57:00.000Z";
    const health = service([
      { ...resourceRow, agent_last_seen_at: stale },
      { ...checkRow, agent_last_seen_at: stale },
    ]);

    await expect(health.forResources("team-1", ["resource-1"])).resolves.toEqual(
      new Map([["resource-1", "critical"]])
    );
  });

  it("keeps an actually missed heartbeat down", async () => {
    setNow();
    const health = service([
      resourceRow,
      {
        ...checkRow,
        source: "heartbeat",
        check_type: null,
        agent_kind: null,
        agent_last_seen_at: null,
        agent_collection_interval_seconds: null,
        latest_metrics_json: null,
      },
    ]);

    await expect(health.forResources("team-1", ["resource-1"])).resolves.toEqual(
      new Map([["resource-1", "down"]])
    );
  });
});

function service(rows: object[]) {
  const database = { all: vi.fn(async () => rows) };
  return new ResourceHealthService(database as unknown as DatabaseService);
}

function setNow() {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-08-25T12:00:00.000Z"));
}
