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
    agentId: mobileAgent.id,
    submissionId: "11111111-1111-4111-8111-111111111111",
    schemaVersion: 1,
    observedAt: new Date().toISOString(),
    device: {
      manufacturer: "Google",
      model: "Pixel",
      androidRelease: "16",
      apiLevel: 36,
      securityPatch: "2026-08-01",
    },
    agent: { appVersion: "0.1.0", buildNumber: 1 },
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
  const get = vi.fn();
  const database = {
    get,
    run,
    transaction: async <T>(action: () => Promise<T>) => action(),
  } as unknown as DatabaseService;
  return { get, run, service: new MobileDeviceStatusService(database) };
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
      "11111111-1111-4111-8111-111111111111",
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
    expect(run.mock.calls.some(([sql]) => sql.includes("host_snapshots"))).toBe(false);
  });

  it("accepts a retried submission once without inserting duplicate status", async () => {
    const { get, run, service } = createService();
    const input = deviceStatus({ observedAt: "2026-08-15T10:00:00.000Z" });
    await service.report(mobileAgent, input);
    const storedStatus = JSON.parse(String(run.mock.calls[0]?.[3]));
    run.mockReset();
    run.mockResolvedValueOnce({ changes: 0 }).mockResolvedValueOnce({ changes: 1 });
    get.mockResolvedValue({
      agent_id: mobileAgent.id,
      status_json: storedStatus,
      received_at: "2026-08-15T10:00:05.000Z",
    });

    const response = await service.report(mobileAgent, input);

    expect(response.acceptedAt).toBe("2026-08-15T10:00:05.000Z");
    expect(run).toHaveBeenCalledTimes(2);
    expect(String(run.mock.calls[0]?.[0])).toContain("ON CONFLICT (id) DO NOTHING");
    expect(get).toHaveBeenCalledWith(
      expect.stringContaining("FROM mobile_device_statuses WHERE id = ?"),
      input.submissionId
    );
  });

  it("rejects reuse of a submission ID with different status", async () => {
    const { get, run, service } = createService();
    const original = deviceStatus({ observedAt: "2026-08-15T10:00:00.000Z" });
    await service.report(mobileAgent, original);
    const storedStatus = JSON.parse(String(run.mock.calls[0]?.[3]));
    run.mockReset();
    run.mockResolvedValueOnce({ changes: 0 });
    get.mockResolvedValue({
      agent_id: mobileAgent.id,
      status_json: storedStatus,
      received_at: "2026-08-15T10:00:05.000Z",
    });

    await expect(
      service.report(
        mobileAgent,
        deviceStatus({
          observedAt: original.observedAt,
          device: {
            manufacturer: original.device.manufacturer,
            model: "Different phone",
            androidRelease: original.device.androidRelease,
            apiLevel: original.device.apiLevel,
            securityPatch: original.device.securityPatch,
          },
        })
      )
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(run).toHaveBeenCalledOnce();
  });

  it("rejects desktop agents", async () => {
    const { run, service } = createService();

    await expect(
      service.report({ ...mobileAgent, kind: "desktop" }, deviceStatus())
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(run).not.toHaveBeenCalled();
  });

  it("rejects a key for a different mobile agent", async () => {
    const { run, service } = createService();

    await expect(
      service.report(mobileAgent, deviceStatus({ agentId: "22222222-2222-4222-8222-222222222222" }))
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(run).not.toHaveBeenCalled();
  });

  it("uses server receipt order for the latest status", async () => {
    const { get, service } = createService();
    get.mockResolvedValue({
      agent_id: mobileAgent.id,
      status_json: deviceStatus(),
    });

    await service.latest(mobileAgent.id);

    expect(get).toHaveBeenCalledWith(
      expect.stringContaining("ORDER BY received_at DESC, id DESC"),
      mobileAgent.id
    );
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
