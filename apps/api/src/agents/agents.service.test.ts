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

const agent: AuthenticatedAgent = {
  id: "agent-1",
  teamId: "team-1",
  name: "Relay",
  kind: "desktop",
  capabilities: ["http", "tcp", "dns", "host", "disk"],
  collectionIntervalSeconds: 45,
};

const mobileDeviceStatuses = {
  latestByAgentIds: vi.fn(async () => new Map()),
  latest: vi.fn(async () => null),
} as unknown as MobileDeviceStatusService;

function snapshot(observedAt: string, cpuPercent: number): HostSnapshotDto {
  return {
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
    observedAt,
  };
}

describe("AgentsService transport", () => {
  it("rejects active-check polling from mobile collectors", async () => {
    const service = new AgentsService(
      {} as DatabaseService,
      {} as TeamAccessService,
      {} as AuditService,
      {} as ResultsService,
      {} as TechnologiesService,
      mobileDeviceStatuses
    );

    await expect(
      service.poll({ ...agent, kind: "mobile", capabilities: ["device-status"] })
    ).rejects.toThrow("Collector does not support active checks");
  });

  it("rejects desktop heartbeats from mobile collectors", async () => {
    const service = new AgentsService(
      {} as DatabaseService,
      {} as TeamAccessService,
      {} as AuditService,
      {} as ResultsService,
      {} as TechnologiesService,
      mobileDeviceStatuses
    );

    await expect(
      service.heartbeat(
        { ...agent, kind: "mobile", capabilities: ["device-status"] },
        {
          snapshots: [snapshot(new Date().toISOString(), 10)],
          results: [],
          capabilities: ["device-status"],
        }
      )
    ).rejects.toThrow("Collector does not support desktop heartbeats");
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
        mobileDeviceStatuses
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
      mobileDeviceStatuses
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
      mobileDeviceStatuses
    );
    const input: AgentHeartbeatDto = {
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
});
