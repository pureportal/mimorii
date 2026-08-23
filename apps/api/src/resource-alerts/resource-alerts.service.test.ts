import { BadRequestException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import type { AuditService } from "../common/audit.service.js";
import type { DatabaseService } from "../database/database.service.js";
import type { NotificationsService } from "../notifications/notifications.service.js";
import type { TeamAccessService } from "../teams/team-access.service.js";
import { ResourceAlertsService } from "./resource-alerts.service.js";

describe("ResourceAlertsService", () => {
  it("triggers and recovers only after the configured consecutive samples", async () => {
    const row = {
      id: "alert-1",
      team_id: "team-1",
      resource_id: "resource-1",
      resource_name: "Phone",
      name: "Battery temperature",
      metric: "batteryTemperatureCelsius",
      operator: "greaterThanOrEqual",
      threshold_json: 40,
      recovery_threshold_json: 36,
      required_samples: 2,
      enabled: true,
      active: false,
      consecutive_matches: 0,
      consecutive_recoveries: 0,
      last_evaluated_at: null as string | null,
      triggered_at: null as string | null,
      created_at: "2026-08-23T09:00:00.000Z",
    };
    const mutable = { ...row };
    const run = vi.fn(async (_sql: string, ...parameters: unknown[]) => {
      mutable.active = Boolean(parameters[0]);
      mutable.consecutive_matches = Number(parameters[1]);
      mutable.consecutive_recoveries = Number(parameters[2]);
      mutable.last_evaluated_at = String(parameters[3]);
      mutable.triggered_at = parameters[4] as string | null;
      return { changes: 1 };
    });
    const database = {
      all: vi.fn(async () => [{ ...mutable }]),
      run,
      transaction: async <T>(action: () => Promise<T>) => action(),
    } as unknown as DatabaseService;
    const enqueue = vi.fn(async () => undefined);
    const service = new ResourceAlertsService(
      database,
      {} as TeamAccessService,
      {} as AuditService,
      { enqueue } as unknown as NotificationsService
    );

    await service.evaluate(
      "team-1",
      "resource-1",
      { batteryTemperatureCelsius: 41 },
      "2026-08-23T10:00:00.000Z"
    );
    expect(enqueue).not.toHaveBeenCalled();
    await service.evaluate(
      "team-1",
      "resource-1",
      { batteryTemperatureCelsius: 42 },
      "2026-08-23T10:01:00.000Z"
    );
    expect(enqueue).toHaveBeenLastCalledWith(
      "team-1",
      "resource.alert.triggered",
      expect.objectContaining({ resourceId: "resource-1", value: 42 })
    );
    await service.evaluate(
      "team-1",
      "resource-1",
      { batteryTemperatureCelsius: 50 },
      "2026-08-23T10:00:30.000Z"
    );
    expect(enqueue).toHaveBeenCalledTimes(1);
    await service.evaluate(
      "team-1",
      "resource-1",
      { batteryTemperatureCelsius: 35 },
      "2026-08-23T10:02:00.000Z"
    );
    expect(enqueue).toHaveBeenCalledTimes(1);
    await service.evaluate(
      "team-1",
      "resource-1",
      { batteryTemperatureCelsius: 34 },
      "2026-08-23T10:03:00.000Z"
    );
    expect(enqueue).toHaveBeenLastCalledWith(
      "team-1",
      "resource.alert.recovered",
      expect.objectContaining({ resourceId: "resource-1", value: 34 })
    );
  });

  it("rejects numeric operators for boolean device conditions", async () => {
    const service = new ResourceAlertsService(
      {
        get: vi.fn(async () => ({ id: "resource-1" })),
      } as unknown as DatabaseService,
      { require: vi.fn(async () => ({})) } as unknown as TeamAccessService,
      {} as AuditService,
      {} as NotificationsService
    );

    await expect(
      service.create("user-1", "team-1", "resource-1", {
        name: "Internet",
        metric: "internetAvailable",
        operator: "greaterThan",
        threshold: true,
      })
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("rejects recovery thresholds on the triggering side of a numeric condition", async () => {
    const service = new ResourceAlertsService(
      {
        get: vi.fn(async () => ({ id: "resource-1", agent_kind: "desktop" })),
      } as unknown as DatabaseService,
      { require: vi.fn(async () => ({})) } as unknown as TeamAccessService,
      {} as AuditService,
      {} as NotificationsService
    );

    await expect(
      service.create("user-1", "team-1", "resource-1", {
        name: "CPU",
        metric: "cpuPercent",
        operator: "greaterThanOrEqual",
        threshold: 90,
        recoveryThreshold: 95,
      })
    ).rejects.toThrow("Recovery threshold must return the metric past the trigger");
    await expect(
      service.create("user-1", "team-1", "resource-1", {
        name: "Battery",
        metric: "storagePercent",
        operator: "lessThan",
        threshold: 20,
        recoveryThreshold: 10,
      })
    ).rejects.toThrow("Recovery threshold must return the metric past the trigger");
  });
});
