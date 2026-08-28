import { describe, expect, it, vi } from "vitest";
import { AnalyticsService } from "./analytics.service.js";

describe("AnalyticsService overview", () => {
  it("counts a live critical disk check as critical without counting it as down", async () => {
    const database = {
      get: vi.fn(async (sql: string) => {
        if (sql.includes("COUNT(*) AS count FROM resources")) return { count: 1 };
        if (sql.includes("AS uptime_24h")) {
          expect(sql).toContain("category = 'availability'");
          return { uptime_24h: 100, uptime_30d: 100, latency: 42 };
        }
        if (sql.includes("COUNT(*) AS count FROM incidents")) return { count: 0 };
        throw new Error(`Unexpected query: ${sql}`);
      }),
      all: vi.fn(async (sql: string) => {
        if (sql.includes("FROM checks c LEFT JOIN agents")) {
          return [
            {
              source: "check",
              type: "http",
              status: "up",
              agent_kind: null,
              agent_last_seen_at: null,
              agent_collection_interval_seconds: null,
              latest_metrics_json: "{}",
            },
            {
              source: "check",
              type: "disk",
              status: "down",
              agent_kind: "desktop",
              agent_last_seen_at: new Date().toISOString(),
              agent_collection_interval_seconds: 30,
              latest_metrics_json: '{"usedPercent":97.3}',
            },
          ];
        }
        if (sql.includes("FROM observations")) {
          expect(sql).toContain("category = 'availability'");
          return [];
        }
        throw new Error(`Unexpected query: ${sql}`);
      }),
    };
    const service = new AnalyticsService(
      database as never,
      { require: vi.fn(async () => undefined) } as never,
      { list: vi.fn(async () => []) } as never,
      { list: vi.fn(async () => []) } as never,
      { list: vi.fn(async () => []) } as never
    );

    await expect(service.overview("user-1", "team-1")).resolves.toMatchObject({
      checks: 2,
      passing: 1,
      warning: 0,
      critical: 1,
      down: 0,
    });
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
          return { total: 1, availability: 100, degraded: 0 };
        }
        if (sql.includes("COUNT(DISTINCT i.id)")) return { count: 0, mttr: null };
        if (sql.includes("WITH failures AS")) return { mtbf: null };
        if (sql.includes(", ordered AS")) return { latency: 42 };
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
      {} as never,
      {} as never,
      {} as never
    );

    await expect(
      service.report("user-1", "team-1", {
        from: "2026-08-28T00:00:00.000Z",
        to: "2026-08-29T00:00:00.000Z",
      })
    ).resolves.toMatchObject({ daily: [daily] });
  });
});
