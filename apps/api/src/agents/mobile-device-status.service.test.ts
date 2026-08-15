import { BadRequestException, ForbiddenException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import type { DatabaseService } from "../database/database.service.js";
import type { AuthenticatedAgent } from "./agent-auth.js";
import type { MobileDeviceStatusDto } from "./mobile-device-status.dto.js";
import { MobileDeviceStatusService } from "./mobile-device-status.service.js";

const mobileAgent: AuthenticatedAgent = {
  id: "mobile-1",
  teamId: "team-1",
  name: "Phone",
  kind: "mobile",
  capabilities: ["device-status"],
  collectionIntervalSeconds: 900,
};

function deviceStatus(overrides: Partial<MobileDeviceStatusDto> = {}): MobileDeviceStatusDto {
  return {
    schemaVersion: 1,
    observedAt: new Date().toISOString(),
    device: {
      manufacturer: "Google",
      model: "Pixel",
      androidRelease: "16",
      apiLevel: 36,
      securityPatch: "2026-08-01",
    },
    collector: { appVersion: "0.1.0", buildNumber: 1 },
    uptimeSeconds: 600,
    battery: {
      percent: 75,
      charging: false,
      powerSource: "none",
      health: "good",
      temperatureCelsius: 30,
    },
    memory: { totalBytes: 8_000, availableBytes: 3_000, lowMemory: false },
    storage: { totalBytes: 100_000, availableBytes: 40_000 },
    connectivity: {
      connected: true,
      internetValidated: true,
      metered: false,
      roaming: false,
      vpn: false,
      transport: "wifi",
    },
    power: { batterySaver: false, deviceIdle: false, backgroundRestricted: false },
    thermalStatus: "none",
    ...overrides,
  };
}

function createService() {
  const run = vi.fn(async (_sql: string, ..._parameters: unknown[]) => ({ changes: 1 }));
  const database = {
    run,
    transaction: async <T>(action: () => Promise<T>) => action(),
  } as unknown as DatabaseService;
  return { run, service: new MobileDeviceStatusService(database) };
}

describe("MobileDeviceStatusService", () => {
  it("stores typed mobile status separately from host snapshots", async () => {
    const { run, service } = createService();

    const response = await service.report(mobileAgent, deviceStatus());

    expect(response).toEqual({
      acceptedAt: expect.any(String),
      collectionIntervalSeconds: 900,
    });
    expect(run).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining("INSERT INTO mobile_device_statuses"),
      expect.any(String),
      "mobile-1",
      expect.any(String),
      expect.any(String),
      expect.any(String)
    );
    expect(JSON.parse(String(run.mock.calls[0]?.[3]))).toMatchObject({
      schemaVersion: 1,
      device: { model: "Pixel" },
      connectivity: { transport: "wifi" },
    });
    expect(run.mock.calls.some(([sql]) => String(sql).includes("host_snapshots"))).toBe(false);
  });

  it("rejects desktop collectors", async () => {
    const { run, service } = createService();

    await expect(
      service.report({ ...mobileAgent, kind: "desktop" }, deviceStatus())
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(run).not.toHaveBeenCalled();
  });

  it("rejects impossible totals and future observations", async () => {
    const { service } = createService();

    await expect(
      service.report(
        mobileAgent,
        deviceStatus({ memory: { totalBytes: 8_000, availableBytes: 9_000, lowMemory: false } })
      )
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.report(
        mobileAgent,
        deviceStatus({ observedAt: new Date(Date.now() + 11 * 60_000).toISOString() })
      )
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
