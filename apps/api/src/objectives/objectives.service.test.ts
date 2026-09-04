import { describe, expect, it, vi } from "vitest";
import { ObjectivesService } from "./objectives.service.js";

const objectiveRow = {
  id: "objective-1",
  team_id: "team-1",
  resource_id: "resource-1",
  check_id: null,
  name: "API availability",
  target_percent: 99,
  window_days: 7 as const,
  latency_target_ms: 250,
  breach_state: "no-data" as const,
  created_at: "2026-09-01T00:00:00.000Z",
  resource_name: "API",
  check_name: null,
};

describe("ObjectivesService list", () => {
  it("calculates every objective with one grouped observation query", async () => {
    const database = {
      all: vi.fn().mockResolvedValue([
        {
          ...objectiveRow,
          observation_total: 100,
          availability: 98,
          latency_p95: 200,
        },
        {
          id: "objective-2",
          team_id: "team-1",
          resource_id: "resource-2",
          check_id: "check-2",
          name: "Worker availability",
          target_percent: 99.9,
          window_days: 30,
          latency_target_ms: null,
          breach_state: "no-data",
          created_at: "2026-09-01T00:00:00.000Z",
          resource_name: "Worker",
          check_name: "Worker check",
          observation_total: 0,
          availability: null,
          latency_p95: null,
        },
      ]),
    };
    const service = new ObjectivesService(
      database as never,
      { require: vi.fn().mockResolvedValue(undefined) } as never,
      {} as never,
      {} as never
    );

    const result = await service.list("user-1", "team-1");

    expect(database.all).toHaveBeenCalledOnce();
    expect(database.all).toHaveBeenCalledWith(
      expect.stringContaining("PERCENTILE_DISC(0.95)"),
      expect.any(String),
      "team-1"
    );
    expect(result).toEqual([
      expect.objectContaining({
        id: "objective-1",
        availabilityPercent: 98,
        latencyP95Ms: 200,
        status: "breached",
      }),
      expect.objectContaining({
        id: "objective-2",
        availabilityPercent: null,
        latencyP95Ms: null,
        status: "no-data",
      }),
    ]);
  });

  it("evaluates availability and latency in one observation query", async () => {
    const previousSchedulerSetting = process.env.MIMORII_SCHEDULER_ENABLED;
    process.env.MIMORII_SCHEDULER_ENABLED = "true";
    const database = {
      all: vi.fn().mockResolvedValue([objectiveRow]),
      get: vi.fn(async (sql: string) => {
        if (sql.includes("FOR UPDATE OF slo")) return objectiveRow;
        if (sql.includes("COUNT(*) AS observation_total")) {
          return { observation_total: 100, availability: 100, latency_p95: 200 };
        }
        throw new Error(`Unexpected query: ${sql}`);
      }),
      run: vi.fn().mockResolvedValue({ changes: 1 }),
      transaction: vi.fn(async (action: () => Promise<void>) => action()),
    };
    const service = new ObjectivesService(
      database as never,
      {} as never,
      { enqueue: vi.fn() } as never,
      {} as never
    );

    try {
      await service.evaluate();
    } finally {
      if (previousSchedulerSetting === undefined) delete process.env.MIMORII_SCHEDULER_ENABLED;
      else process.env.MIMORII_SCHEDULER_ENABLED = previousSchedulerSetting;
    }

    expect(database.get).toHaveBeenCalledTimes(2);
    expect(database.get).toHaveBeenLastCalledWith(
      expect.stringContaining("PERCENTILE_DISC(0.95)"),
      "resource-1",
      expect.any(String)
    );
    expect(database.run).toHaveBeenCalledOnce();
  });
});
