import { describe, expect, it, vi } from "vitest";
import { MaintenanceService } from "./maintenance.service.js";

describe("MaintenanceService list", () => {
  it("hydrates resources for every window in one batch query", async () => {
    const now = Date.now();
    const window = {
      team_id: "team-1",
      starts_at: new Date(now - 60_000).toISOString(),
      ends_at: new Date(now + 60_000).toISOString(),
      recurrence: "none" as const,
      recurrence_until: null,
      suppress_notifications: 1,
      cancelled_at: null,
      created_at: new Date(now - 120_000).toISOString(),
    };
    const windows = [
      { ...window, id: "maintenance-1", name: "Database maintenance" },
      { ...window, id: "maintenance-2", name: "API maintenance" },
    ];
    const database = {
      all: vi.fn(async (sql: string) => {
        if (sql.includes("FROM maintenance_windows WHERE team_id")) return windows;
        if (sql.includes("mr.maintenance_id IN")) {
          return [
            { maintenance_id: "maintenance-1", id: "resource-1", name: "Database" },
            { maintenance_id: "maintenance-2", id: "resource-2", name: "API" },
          ];
        }
        throw new Error(`Unexpected query: ${sql}`);
      }),
    };
    const service = new MaintenanceService(
      database as never,
      { require: vi.fn().mockResolvedValue(undefined) } as never,
      {} as never,
      {} as never
    );

    const result = await service.list("user-1", "team-1");

    expect(database.all).toHaveBeenCalledTimes(2);
    expect(database.all).toHaveBeenLastCalledWith(
      expect.stringContaining("mr.maintenance_id IN (?,?)"),
      "maintenance-1",
      "maintenance-2"
    );
    expect(result).toEqual([
      expect.objectContaining({
        id: "maintenance-1",
        status: "active",
        resources: [{ id: "resource-1", name: "Database" }],
      }),
      expect.objectContaining({
        id: "maintenance-2",
        status: "active",
        resources: [{ id: "resource-2", name: "API" }],
      }),
    ]);
  });
});

describe("MaintenanceService countActive", () => {
  it("counts current occurrences without loading resources", async () => {
    const at = new Date("2026-08-28T12:00:00.000Z");
    const window = {
      team_id: "team-1",
      recurrence_until: null,
      suppress_notifications: 1,
      cancelled_at: null,
      created_at: "2026-08-01T00:00:00.000Z",
    };
    const database = {
      all: vi.fn(async () => [
        {
          ...window,
          id: "once",
          name: "Database upgrade",
          starts_at: "2026-08-28T11:00:00.000Z",
          ends_at: "2026-08-28T13:00:00.000Z",
          recurrence: "none" as const,
        },
        {
          ...window,
          id: "daily-current",
          name: "Midday rotation",
          starts_at: "2026-08-01T11:30:00.000Z",
          ends_at: "2026-08-01T12:30:00.000Z",
          recurrence: "daily" as const,
        },
        {
          ...window,
          id: "daily-later",
          name: "Evening backup",
          starts_at: "2026-08-01T18:00:00.000Z",
          ends_at: "2026-08-01T19:00:00.000Z",
          recurrence: "daily" as const,
        },
      ]),
    };
    const service = new MaintenanceService(
      database as never,
      {} as never,
      {} as never,
      {} as never
    );

    await expect(service.countActive("team-1", at)).resolves.toBe(2);
    expect(database.all).toHaveBeenCalledOnce();
    expect(database.all).toHaveBeenCalledWith(
      expect.stringContaining("cancelled_at IS NULL"),
      "team-1",
      at.toISOString(),
      at.toISOString()
    );
  });
});
