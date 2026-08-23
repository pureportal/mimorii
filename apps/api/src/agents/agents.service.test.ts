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

const agent: AuthenticatedAgent = {
  id: "agent-1",
  teamId: "team-1",
  resourceId: "agent-1",
  resourceName: "Relay",
  kind: "desktop",
  capabilities: ["http", "tcp", "dns", "host", "disk"],
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
      alerts
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
      alerts
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
      alerts
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
        alerts
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
          type: "host",
          timeoutMs: 5_000,
          config: {},
          issuedAt: "2026-08-13T08:00:00.000Z",
        }),
        status: "pending",
        issued_at: "2026-08-13T08:00:00.000Z",
      },
    ]);
    const run = vi.fn(async (_sql: string, ..._parameters: unknown[]) => ({ changes: 1 }));
    const service = new AgentsService(
      { all, run } as unknown as DatabaseService,
      {} as TeamAccessService,
      {} as AuditService,
      {} as ResultsService,
      {} as TechnologiesService,
      mobileDeviceStatuses,
      telemetry,
      alerts
    );

    const response = await service.poll(agent);

    expect(response.collectionIntervalSeconds).toBe(45);
    expect(response.tasks).toHaveLength(1);
    expect(response.tasks[0]?.id).toBe("task-1");
    expect(run).toHaveBeenCalledWith(
      expect.stringContaining("UPDATE agents SET last_seen_at"),
      expect.any(String),
      "agent-1"
    );
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
      alerts
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
      alerts
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
      alerts
    );

    await expect(
      service.heartbeat(agent, {
        agentVersion: "2.1.0",
        snapshots: [snapshot(new Date().toISOString(), 10)],
        results: [],
        capabilities: ["http", "tcp", "dns"],
      })
    ).rejects.toThrow("Agent telemetry does not match its capabilities");
    await expect(
      service.heartbeat(agent, {
        agentVersion: "2.1.0",
        snapshots: [],
        results: [],
        capabilities: ["http", "tcp", "dns", "host", "disk"],
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
      alerts
    );

    await expect(service.snapshots("user-1", "team-1", "agent-1")).resolves.toEqual([]);
    expect(all).not.toHaveBeenCalled();
  });
});
