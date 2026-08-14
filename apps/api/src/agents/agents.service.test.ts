import { describe, expect, it, vi } from "vitest";
import type { AuditService } from "../common/audit.service.js";
import type { DatabaseService } from "../database/database.service.js";
import type { TeamAccessService } from "../teams/team-access.service.js";
import type { ResultsService } from "../checks/results.service.js";
import type { TechnologiesService } from "../technologies/technologies.service.js";
import type { AuthenticatedAgent } from "./agent-auth.js";
import type { AgentHeartbeatDto, HostSnapshotDto } from "./agents.dto.js";
import { AgentsService } from "./agents.service.js";

const agent: AuthenticatedAgent = {
  id: "agent-1",
  teamId: "team-1",
  name: "Relay",
  collectionIntervalSeconds: 45,
};

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
      {} as TechnologiesService
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
      { observeAgent } as unknown as TechnologiesService
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
