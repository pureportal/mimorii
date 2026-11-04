import { afterEach, describe, expect, it, vi } from "vitest";
import { AnalyticsService } from "./analytics.service.js";

describe("AnalyticsService overview", () => {
  afterEach(() => vi.useRealTimers());

  it("aggregates hour-aligned windows from hourly results and current monitor states", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-28T12:34:56.000Z"));
    const database = {
      get: vi.fn(async (sql: string) => {
        if (sql.includes("AS open_incidents")) {
          expect(sql).toContain("breach_state = 'breached'");
          return { resources: 1, open_incidents: 0, breached_objectives: 2 };
        }
        if (sql.includes("AS uptime_24h")) {
          expect(sql).toContain("FROM check_result_hourly");
          expect(sql).not.toContain("FROM check_results");
          return { uptime_24h: 100, uptime_30d: 99.5, latency: 42 };
        }
        throw new Error(`Unexpected query: ${sql}`);
      }),
      all: vi.fn(async (sql: string) => {
        if (sql.includes("FROM checks c LEFT JOIN agents")) {
          expect(sql).toContain(`@> '{"agentTimeout": true}'`);
          return [
            {
              source: "check",
              type: "http",
              status: "up",
              agent_kind: null,
              agent_last_seen_at: null,
              agent_collection_interval_seconds: null,
              agent_timed_out: false,
            },
            {
              source: "check",
              type: "disk",
              status: "down",
              agent_kind: "desktop",
              agent_last_seen_at: new Date().toISOString(),
              agent_collection_interval_seconds: 30,
              agent_timed_out: false,
            },
            {
              source: "check",
              type: "tcp",
              status: "up",
              agent_kind: "desktop",
              agent_last_seen_at: new Date().toISOString(),
              agent_collection_interval_seconds: 30,
              agent_timed_out: true,
            },
          ];
        }
        if (sql.includes("FROM hourly_observations")) {
          expect(sql).toContain("category = 'availability'");
          expect(sql).toContain('AS "latencyMs"');
          return [
            {
              bucket: "2026-08-28T12:00:00.000Z",
              up: 1,
              degraded: 0,
              down: 0,
              latencyMs: 42,
            },
          ];
        }
        throw new Error(`Unexpected query: ${sql}`);
      }),
    };
    const maintenance = { countActive: vi.fn(async () => 1) };
    const service = new AnalyticsService(
      database as never,
      { require: vi.fn(async () => undefined) } as never,
      maintenance as never
    );

    const overview = await service.overview("user-1", "team-1");

    expect(overview).toMatchObject({
      checks: 3,
      passing: 1,
      warning: 0,
      critical: 1,
      down: 1,
      uptime24h: 100,
      uptime30d: 99.5,
      averageLatencyMs: 42,
      activeMaintenance: 1,
      breachedObjectives: 2,
      statusTimeline: [
        {
          bucket: "2026-08-28T12:00:00.000Z",
          up: 1,
          degraded: 0,
          down: 0,
        },
      ],
      latencyTimeline: [{ bucket: "2026-08-28T12:00:00.000Z", latencyMs: 42 }],
    });
    expect(overview).not.toHaveProperty("incidents");
    expect(database.get).toHaveBeenCalledWith(
      expect.stringContaining("AS uptime_24h"),
      "2026-08-27T13:00:00.000Z",
      "team-1",
      "2026-07-29T13:00:00.000Z"
    );
    expect(database.all).toHaveBeenCalledWith(
      expect.stringContaining("FROM hourly_observations"),
      "team-1",
      "2026-08-27T13:00:00.000Z"
    );
    expect(maintenance.countActive).toHaveBeenCalledWith("team-1");
    expect(database.get).toHaveBeenCalledTimes(2);
    expect(database.all).toHaveBeenCalledTimes(2);
  });
});

describe("AnalyticsService reports", () => {
  it("preserves the daily report field names returned to clients", async () => {
    const daily = {
      date: "2026-08-28",
      up: 1,
      degraded: 0,
      down: 0,
      availabilityPercent: 100,
      averageLatencyMs: 42,
    };
    const database = {
      get: vi.fn(async (sql: string) => {
        if (sql.includes("COUNT(*) AS total")) {
          expect(sql).toContain("PERCENTILE_DISC(ARRAY[0.5, 0.95, 0.99])");
          return {
            total: 1,
            availability: 100,
            degraded: 0,
            latency_percentiles: [42, 52, 62],
          };
        }
        if (sql.includes("WITH matching_incidents AS")) {
          return { count: 0, mttr: null, mtbf: null };
        }
        throw new Error(`Unexpected query: ${sql}`);
      }),
      all: vi.fn(async (sql: string) => {
        expect(sql).toContain('AS "availabilityPercent"');
        expect(sql).toContain('AS "averageLatencyMs"');
        return [daily];
      }),
    };
    const service = new AnalyticsService(
      database as never,
      { require: vi.fn(async () => undefined) } as never,
      {} as never
    );

    await expect(
      service.report("user-1", "team-1", {
        from: "2026-08-28T00:00:00.000Z",
        to: "2026-08-29T00:00:00.000Z",
      })
    ).resolves.toMatchObject({
      daily: [daily],
      latencyP50Ms: 42,
      latencyP95Ms: 52,
      latencyP99Ms: 62,
    });
    expect(database.get).toHaveBeenCalledTimes(2);
    expect(database.all).toHaveBeenCalledOnce();
  });
});
