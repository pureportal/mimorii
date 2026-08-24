import { describe, expect, it, vi } from "vitest";
import type { AuditService } from "../common/audit.service.js";
import type { DatabaseService } from "../database/database.service.js";
import type { TeamAccessService } from "../teams/team-access.service.js";
import type { ResultsService } from "../checks/results.service.js";
import type { TechnologiesService } from "../technologies/technologies.service.js";
import type { AuthenticatedAgent } from "./agent-auth.js";
import type { AgentHeartbeatDto, HostSnapshotDto } from "./agents.dto.js";
import { AgentsService } from "./agents.service.js";
import type { MobileDeviceStatusService } from "./mobile-device-status.service.js";
import type { ResourceTelemetryService } from "../common/resource-telemetry.service.js";
import type { ResourceAlertsService } from "../resource-alerts/resource-alerts.service.js";
import type { ResourceImagesService } from "../resources/resource-images.service.js";

const agent: AuthenticatedAgent = {
  id: "agent-1",
  teamId: "team-1",
  resourceId: "agent-1",
  resourceName: "Relay",
  kind: "desktop",
  capabilities: ["http", "tcp", "dns", "host"],
  collectionIntervalSeconds: 45,
};

const mobileDeviceStatuses = {
  latestByAgentIds: vi.fn(async () => new Map()),
  latest: vi.fn(async () => null),
} as unknown as MobileDeviceStatusService;

const telemetry = {
  values: vi.fn(() => ({})),
} as unknown as ResourceTelemetryService;

const alerts = {
  evaluate: vi.fn(async () => undefined),
} as unknown as ResourceAlertsService;

const images = {
  acceptAgentFavicon: vi.fn(async () => true),
} as unknown as ResourceImagesService;

function snapshot(observedAt: string, cpuPercent: number): HostSnapshotDto {
  return {
    snapshotId: "00000000-0000-4000-8000-000000000001",
    hostname: "relay-01",
    platform: "linux",
    version: "0.1.0",
    uptimeSeconds: 600,
    cpuPercent,
    loadAverage: 0.4,
    memoryUsedBytes: 4_000,
    memoryTotalBytes: 8_000,
    swapUsedBytes: 100,
    swapTotalBytes: 1_000,
    processCount: 42,
    networkReceivedBytes: 10_000,
    networkTransmittedBytes: 5_000,
    disks: [{ mount: "/", usedBytes: 20_000, totalBytes: 100_000 }],
    technologies: [{ name: "postgres", category: "database", version: "16" }],
    containerRuntime: null,
    observedAt,
  };
}

describe("AgentsService", () => {
  it.each([
    ["linux", "/", true],
    ["windows", "C:", false],
  ] as const)("creates a default %s Host health check", async (platform, mount, monitorsLoad) => {
    const run = vi.fn(async (_sql: string, ..._parameters: unknown[]) => ({ changes: 1 }));
    const service = new AgentsService(
      {
        run,
        get: vi.fn(async () => ({
          id: "agent-1",
          team_id: "team-1",
          resource_id: "agent-1",
          resource_name: "Server",
          kind: "desktop",
          collection_interval_seconds: 30,
          platform,
          version: null,
          capabilities_json: JSON.stringify([
            "http",
            "tcp",
            "dns",
            "icmp",
            "wan",
            "host",
            "docker",
            "database",
          ]),
          last_seen_at: null,
          revoked_at: null,
          created_at: new Date().toISOString(),
        })),
        transaction: async <T>(action: () => Promise<T>) => action(),
      } as unknown as DatabaseService,
      { require: vi.fn(async () => ({})) } as unknown as TeamAccessService,
      { record: vi.fn(async () => undefined) } as unknown as AuditService,
      {} as ResultsService,
      {} as TechnologiesService,
      mobileDeviceStatuses,
      telemetry,
      alerts,
      images
    );

    await service.create("user-1", "team-1", {
      name: "Server",
      kind: "desktop",
      platform,
    });

    const checkInsert = run.mock.calls.find(([sql]) => String(sql).includes("INSERT INTO checks"));
    expect(checkInsert).toBeDefined();
    const config = JSON.parse(String(checkInsert![5]));
    expect(config.storage).toEqual([{ mount, warningPercent: 85, criticalPercent: 95 }]);
    expect(Object.hasOwn(config, "loadWarning")).toBe(monitorsLoad);
  });

  it("does not create a Host health check for a mobile agent", async () => {
    const run = vi.fn(async (_sql: string, ..._parameters: unknown[]) => ({ changes: 1 }));
    const service = new AgentsService(
      {
        run,
        get: vi.fn(async () => ({
          id: "mobile-1",
          team_id: "team-1",
          resource_id: "mobile-1",
          resource_name: "Phone",
          kind: "mobile",
          collection_interval_seconds: 900,
          platform: null,
          version: null,
          capabilities_json: '["device-status"]',
          last_seen_at: null,
          revoked_at: null,
          created_at: new Date().toISOString(),
        })),
        transaction: async <T>(action: () => Promise<T>) => action(),
      } as unknown as DatabaseService,
      { require: vi.fn(async () => ({})) } as unknown as TeamAccessService,
      { record: vi.fn(async () => undefined) } as unknown as AuditService,
      {} as ResultsService,
      {} as TechnologiesService,
      mobileDeviceStatuses,
      telemetry,
      alerts,
      images
    );

    await service.create("user-1", "team-1", { name: "Phone", kind: "mobile" });

    expect(run.mock.calls.some(([sql]) => String(sql).includes("INSERT INTO checks"))).toBe(false);
  });
  it("renames an agent without changing its collection interval", async () => {
    const currentAgent = {
      id: "agent-1",
      team_id: "team-1",
      resource_id: "agent-1",
      resource_name: "Relay",
      kind: "desktop",
      collection_interval_seconds: 45,
      platform: "linux",
      version: "2.1.0",
      capabilities_json: '["http","tcp","dns"]',
      last_seen_at: "2026-08-13T08:00:00.000Z",
      revoked_at: null,
      created_at: "2026-08-13T07:00:00.000Z",
    } as const;
    const get = vi
      .fn()
      .mockResolvedValueOnce(currentAgent)
      .mockResolvedValueOnce({ ...currentAgent, resource_name: "Production relay" });
    const run = vi.fn(async () => ({ changes: 1 }));
    const requireAccess = vi.fn(async () => ({}));
    const record = vi.fn(async () => undefined);
    const service = new AgentsService(
      {
        get,
        run,
        transaction: async <T>(action: () => Promise<T>) => action(),
      } as unknown as DatabaseService,
      { require: requireAccess } as unknown as TeamAccessService,
      { record } as unknown as AuditService,
      {} as ResultsService,
      {} as TechnologiesService,
      mobileDeviceStatuses,
      telemetry,
      alerts,
      images
    );

    const response = await service.update("user-1", "team-1", "agent-1", {
      name: "  Production relay  ",
    });

    expect(requireAccess).toHaveBeenCalledWith("user-1", "team-1", "admin");
    expect(run).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining("UPDATE resources SET name = ?"),
      "Production relay",
      expect.any(String),
      "agent-1",
      "team-1"
    );
    expect(record).toHaveBeenCalledWith({
      teamId: "team-1",
      userId: "user-1",
      action: "agent.updated",
      subjectType: "agent",
      subjectId: "agent-1",
      metadata: { name: "Production relay", collectionIntervalSeconds: 45 },
    });
    expect(response.resourceName).toBe("Production relay");
    expect(response.collectionIntervalSeconds).toBe(45);
  });

  it("rejects active-check polling from mobile agents", async () => {
    const service = new AgentsService(
      {} as DatabaseService,
      {} as TeamAccessService,
      {} as AuditService,
      {} as ResultsService,
      {} as TechnologiesService,
      mobileDeviceStatuses,
      telemetry,
      alerts,
      images
    );

    await expect(
      service.poll({ ...agent, kind: "mobile", capabilities: ["device-status"] })
    ).rejects.toThrow("Agent does not support active checks");
  });

  it("rejects desktop heartbeats from mobile agents", async () => {
    const service = new AgentsService(
      {} as DatabaseService,
      {} as TeamAccessService,
      {} as AuditService,
      {} as ResultsService,
      {} as TechnologiesService,
      mobileDeviceStatuses,
      telemetry,
      alerts,
      images
    );

    await expect(
      service.heartbeat(
        { ...agent, kind: "mobile", capabilities: ["device-status"] },
        {
          agentVersion: "2.1.0",
          snapshots: [snapshot(new Date().toISOString(), 10)],
          results: [],
          capabilities: ["device-status"],
        }
      )
    ).rejects.toThrow("Agent does not support desktop heartbeats");
  });

  it("uses the mobile collection cadence when calculating freshness", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-15T12:00:00.000Z"));
    try {
      const service = new AgentsService(
        {
          all: vi.fn(async () => [
            {
              id: "mobile-1",
              team_id: "team-1",
              name: "Phone",
              kind: "mobile",
              collection_interval_seconds: 3_600,
              platform: "Android 16",
              version: "0.1.0",
              capabilities_json: '["device-status"]',
              last_seen_at: "2026-08-15T10:30:00.000Z",
              revoked_at: null,
              created_at: "2026-08-15T09:00:00.000Z",
            },
          ]),
        } as unknown as DatabaseService,
        { require: vi.fn(async () => ({})) } as unknown as TeamAccessService,
        {} as AuditService,
        {} as ResultsService,
        {} as TechnologiesService,
        mobileDeviceStatuses,
        telemetry,
        alerts,
        images
      );

      const response = await service.list("user-1", "team-1");

      expect(response[0]?.status).toBe("online");
    } finally {
      vi.useRealTimers();
    }
  });

  it("returns the Mimorii collection interval with queued triggers", async () => {
    const all = vi.fn(async () => [
      {
        id: "task-1",
        check_id: "check-1",
        payload_json: JSON.stringify({
          id: "task-1",
          checkId: "check-1",
          type: "http",
          timeoutMs: 5_000,
          config: { target: { url: "http://private.internal/", method: "GET" } },
          faviconRequestId: null,
          issuedAt: "2026-08-13T08:00:00.000Z",
        }),
        status: "pending",
        issued_at: "2026-08-13T08:00:00.000Z",
        check_enabled: 1,
        favicon_request_id: "b6e4cb23-3b08-49c7-8163-45e4cce6040f",
      },
    ]);
    const run = vi.fn(async (_sql: string, ..._parameters: unknown[]) => ({ changes: 1 }));
    const service = new AgentsService(
      { all, run, get: vi.fn(async () => ({ enabled: true })) } as unknown as DatabaseService,
      {} as TeamAccessService,
      {} as AuditService,
      {} as ResultsService,
      {} as TechnologiesService,
      mobileDeviceStatuses,
      telemetry,
      alerts,
      images
    );

    const response = await service.poll(agent);

    expect(response.collectionIntervalSeconds).toBe(45);
    expect(response.collectHostTelemetry).toBe(true);
    expect(response.tasks).toHaveLength(1);
    expect(response.tasks[0]?.id).toBe("task-1");
    expect(response.tasks[0]?.faviconRequestId).toBe("b6e4cb23-3b08-49c7-8163-45e4cce6040f");
    expect(run).toHaveBeenCalledWith(
      expect.stringContaining("UPDATE agents SET last_seen_at"),
      expect.any(String),
      "agent-1"
    );
  });

  it("expires queued tasks when their checks are disabled", async () => {
    const all = vi.fn(async () => [
      {
        id: "task-1",
        check_id: "check-1",
        payload_json: JSON.stringify({
          id: "task-1",
          checkId: "check-1",
          type: "host",
          timeoutMs: 5_000,
          config: {},
          issuedAt: "2026-08-13T08:00:00.000Z",
        }),
        status: "claimed",
        issued_at: "2026-08-13T08:00:00.000Z",
        check_enabled: 0,
        favicon_request_id: null,
      },
    ]);
    const run = vi.fn(async (_sql: string, ..._parameters: unknown[]) => ({ changes: 1 }));
    const service = new AgentsService(
      { all, run, get: vi.fn(async () => ({ enabled: false })) } as unknown as DatabaseService,
      {} as TeamAccessService,
      {} as AuditService,
      {} as ResultsService,
      {} as TechnologiesService,
      mobileDeviceStatuses,
      telemetry,
      alerts,
      images
    );

    const response = await service.poll(agent);

    expect(response.collectHostTelemetry).toBe(false);
    expect(response.tasks).toEqual([]);
    expect(run).toHaveBeenCalledWith(
      expect.stringContaining("UPDATE agent_tasks SET status = 'expired'"),
      "task-1"
    );
  });

  it("records agent DNS resolution failures as check errors", async () => {
    const requestId = "b6e4cb23-3b08-49c7-8163-45e4cce6040f";
    const record = vi.fn(async () => ({}));
    const database = {
      get: vi.fn(async () => ({
        id: "task-1",
        check_id: "check-1",
        payload_json: "{}",
        status: "claimed",
        issued_at: new Date().toISOString(),
        encrypted_secret: null,
        check_enabled: 1,
        favicon_request_id: requestId,
        type: "http",
        resource_id: "resource-1",
      })),
      run: vi.fn(async () => ({ changes: 1 })),
      transaction: async <T>(action: () => Promise<T>) => action(),
    } as unknown as DatabaseService;
    const service = new AgentsService(
      database,
      {} as TeamAccessService,
      {} as AuditService,
      { record } as unknown as ResultsService,
      {} as TechnologiesService,
      mobileDeviceStatuses,
      telemetry,
      alerts,
      images
    );

    await service.heartbeat(agent, {
      agentVersion: "2.1.0",
      snapshots: [],
      results: [
        {
          taskId: "task-1",
          status: "down",
          latencyMs: null,
          statusCode: null,
          message: "DNS lookup failed for private-service.internal",
          metrics: {},
          checkedAt: new Date().toISOString(),
        },
      ],
      capabilities: ["http"],
    });

    expect(record).toHaveBeenCalledWith(
      "check-1",
      expect.objectContaining({
        status: "down",
        message: "DNS lookup failed for private-service.internal",
      })
    );
  });

  it("accepts a favicon returned with its requested HTTP check result", async () => {
    const requestId = "b6e4cb23-3b08-49c7-8163-45e4cce6040f";
    const acceptAgentFavicon = vi.fn(async () => true);
    const database = {
      get: vi.fn(async () => ({
        id: "task-1",
        check_id: "check-1",
        payload_json: "{}",
        status: "claimed",
        issued_at: new Date().toISOString(),
        encrypted_secret: null,
        check_enabled: 1,
        favicon_request_id: requestId,
        type: "http",
        resource_id: "resource-1",
      })),
      run: vi.fn(async () => ({ changes: 1 })),
      transaction: async <T>(action: () => Promise<T>) => action(),
    } as unknown as DatabaseService;
    const service = new AgentsService(
      database,
      {} as TeamAccessService,
      {} as AuditService,
      { record: vi.fn(async () => ({})) } as unknown as ResultsService,
      {} as TechnologiesService,
      mobileDeviceStatuses,
      telemetry,
      alerts,
      { acceptAgentFavicon } as unknown as ResourceImagesService
    );
    const favicon = Buffer.from("agent favicon");

    await service.heartbeat(agent, {
      agentVersion: "2.1.0",
      snapshots: [],
      results: [
        {
          taskId: "task-1",
          status: "up",
          latencyMs: 4.2,
          statusCode: 200,
          message: null,
          metrics: {},
          checkedAt: new Date().toISOString(),
          favicon: {
            requestId,
            status: "retrieved",
            dataBase64: favicon.toString("base64"),
          },
        },
      ],
      capabilities: ["http"],
    });

    expect(acceptAgentFavicon).toHaveBeenCalledWith("resource-1", "check-1", requestId, favicon);
  });

  it("persists every snapshot in a triggered transfer", async () => {
    const run = vi.fn(async (_sql: string, ..._parameters: unknown[]) => ({ changes: 1 }));
    const database = {
      run,
      transaction: async <T>(action: () => Promise<T>) => action(),
    } as unknown as DatabaseService;
    const observeAgent = vi.fn(async () => undefined);
    const service = new AgentsService(
      database,
      {} as TeamAccessService,
      {} as AuditService,
      {} as ResultsService,
      { observeAgent } as unknown as TechnologiesService,
      mobileDeviceStatuses,
      telemetry,
      alerts,
      images
    );
    const input: AgentHeartbeatDto = {
      agentVersion: "2.1.0",
      snapshots: [
        snapshot("2026-08-13T08:00:00.000Z", 10),
        snapshot("2026-08-13T08:00:15.000Z", 20),
      ],
      results: [],
      capabilities: ["host"],
    };

    const response = await service.heartbeat(agent, input);

    expect(response).toEqual({
      acceptedAt: expect.any(String),
      acceptedSnapshots: 2,
      acceptedResults: 0,
    });
    const inserts = run.mock.calls.filter(([sql]) =>
      String(sql).includes("INSERT INTO host_snapshots")
    );
    expect(inserts).toHaveLength(2);
    expect(inserts.map((call) => JSON.parse(String(call[3])).cpuPercent)).toEqual([10, 20]);
    expect(observeAgent).toHaveBeenCalledTimes(2);
  });

  it("registers check-only capabilities without storing host telemetry", async () => {
    const run = vi.fn(async (_sql: string, ..._parameters: unknown[]) => ({ changes: 1 }));
    const database = {
      run,
      transaction: async <T>(action: () => Promise<T>) => action(),
    } as unknown as DatabaseService;
    const observeAgent = vi.fn(async () => undefined);
    const service = new AgentsService(
      database,
      {} as TeamAccessService,
      {} as AuditService,
      {} as ResultsService,
      { observeAgent } as unknown as TechnologiesService,
      mobileDeviceStatuses,
      telemetry,
      alerts,
      images
    );

    const response = await service.heartbeat(agent, {
      agentVersion: "2.1.0",
      snapshots: [],
      results: [],
      capabilities: ["http", "tcp", "dns"],
    });

    expect(response).toEqual({
      acceptedAt: expect.any(String),
      acceptedSnapshots: 0,
      acceptedResults: 0,
    });
    expect(run).toHaveBeenCalledWith(
      expect.stringContaining("UPDATE agents SET platform"),
      null,
      "2.1.0",
      '["http","tcp","dns"]',
      expect.any(String),
      expect.any(String),
      "agent-1"
    );
    expect(run.mock.calls.some(([sql]) => String(sql).includes("host_snapshots"))).toBe(false);
    expect(observeAgent).not.toHaveBeenCalled();
  });

  it("rejects telemetry that conflicts with reported capabilities", async () => {
    const service = new AgentsService(
      {} as DatabaseService,
      {} as TeamAccessService,
      {} as AuditService,
      {} as ResultsService,
      {} as TechnologiesService,
      mobileDeviceStatuses,
      telemetry,
      alerts,
      images
    );

    await expect(
      service.heartbeat(agent, {
        agentVersion: "2.1.0",
        snapshots: [snapshot(new Date().toISOString(), 10)],
        results: [],
        capabilities: ["http", "tcp", "dns"],
      })
    ).rejects.toThrow("Agent telemetry does not match its capabilities");
  });

  it("does not return historical snapshots for a check-only agent", async () => {
    const all = vi.fn(async () => [{ snapshot_json: JSON.stringify(snapshot("now", 10)) }]);
    const service = new AgentsService(
      {
        get: vi.fn(async () => ({
          id: "agent-1",
          team_id: "team-1",
          name: "Runner",
          kind: "desktop",
          collection_interval_seconds: 30,
          platform: null,
          version: "2.1.0",
          capabilities_json: '["http","tcp","dns"]',
          last_seen_at: new Date().toISOString(),
          revoked_at: null,
          created_at: new Date().toISOString(),
        })),
        all,
      } as unknown as DatabaseService,
      { require: vi.fn(async () => ({})) } as unknown as TeamAccessService,
      {} as AuditService,
      {} as ResultsService,
      {} as TechnologiesService,
      mobileDeviceStatuses,
      telemetry,
      alerts,
      images
    );

    await expect(service.snapshots("user-1", "team-1", "agent-1")).resolves.toEqual([]);
    expect(all).not.toHaveBeenCalled();
  });
});
