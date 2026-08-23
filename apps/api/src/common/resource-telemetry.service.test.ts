import { describe, expect, it, vi } from "vitest";
import type { HostSnapshot, MobileDeviceStatus } from "@mimorii/contracts";
import type { DatabaseService } from "../database/database.service.js";
import { ResourceTelemetryService } from "./resource-telemetry.service.js";

describe("ResourceTelemetryService", () => {
  it("normalizes desktop and mobile resource metrics", () => {
    const service = new ResourceTelemetryService({} as DatabaseService);
    const desktop = {
      cpuPercent: 25,
      loadAverage: 1.5,
      memoryUsedBytes: 50,
      memoryTotalBytes: 100,
      disks: [{ mount: "/", usedBytes: 75, totalBytes: 100 }],
      containerRuntime: {
        engineVersion: "27",
        containers: [
          { state: "running", health: "healthy" },
          { state: "exited", health: "none" },
        ],
      },
    } as HostSnapshot;
    const mobile = {
      schemaVersion: 1,
      battery: { percent: 42, temperatureCelsius: 31 },
      memory: { totalBytes: 100, availableBytes: 25, lowMemory: true },
      storage: { totalBytes: 200, availableBytes: 50 },
      connectivity: { internetValidated: false },
      power: { backgroundRestricted: true },
    } as MobileDeviceStatus;

    expect(service.values(desktop)).toMatchObject({
      cpuPercent: 25,
      memoryPercent: 50,
      storagePercent: 75,
      containerCount: 2,
      unhealthyContainerCount: 1,
    });
    expect(service.values(mobile)).toMatchObject({
      batteryPercent: 42,
      memoryPercent: 75,
      storagePercent: 75,
      internetAvailable: false,
      lowMemory: true,
      backgroundRestricted: true,
    });
  });

  it("returns numeric history while excluding unavailable and boolean values", async () => {
    const all = vi.fn(async () => [
      {
        payload: JSON.stringify({
          schemaVersion: 1,
          battery: { percent: 64, temperatureCelsius: null },
          memory: { totalBytes: 100, availableBytes: 60, lowMemory: false },
          storage: { totalBytes: 100, availableBytes: 50 },
          connectivity: { internetValidated: true },
          power: { backgroundRestricted: false },
        }),
        observed_at: "2026-08-23T10:00:00.000Z",
      },
    ]);
    const service = new ResourceTelemetryService({ all } as unknown as DatabaseService);

    await expect(
      service.series("resource-1", "2026-08-22T00:00:00.000Z", "2026-08-24T00:00:00.000Z", [
        "batteryPercent",
        "cpuPercent",
      ])
    ).resolves.toEqual([
      {
        metric: "batteryPercent",
        points: [{ observedAt: "2026-08-23T10:00:00.000Z", value: 64 }],
      },
      { metric: "cpuPercent", points: [] },
    ]);
  });
});
