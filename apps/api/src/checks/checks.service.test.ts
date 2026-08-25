import { describe, expect, it, vi } from "vitest";
import { CheckConfigService } from "./check-config.service.js";
import { ChecksService } from "./checks.service.js";

describe("check summaries", () => {
  it("includes the latest arbitrary metric payload", async () => {
    const database = {
      all: vi.fn().mockResolvedValue([
        {
          id: "check-1",
          team_id: "team-1",
          resource_id: "resource-1",
          name: "Health",
          type: "host",
          config_json: JSON.stringify({
            cpuWarningPercent: 80,
            cpuCriticalPercent: 95,
            memoryWarningPercent: 80,
            memoryCriticalPercent: 95,
            loadWarning: 4,
            loadCritical: 8,
            swapWarningPercent: 80,
            swapCriticalPercent: 95,
          }),
          interval_seconds: 60,
          timeout_ms: 5_000,
          failure_threshold: 2,
          recovery_threshold: 1,
          enabled: 1,
          current_status: "up",
          consecutive_failures: 0,
          consecutive_successes: 2,
          last_latency_ms: null,
          last_checked_at: "2026-08-24T08:01:00.000Z",
          next_check_at: "2026-08-24T08:02:00.000Z",
          created_at: "2026-08-20T08:00:00.000Z",
          updated_at: "2026-08-24T08:01:00.000Z",
          agent_id: "agent-1",
          encrypted_secret: null,
          latest_metrics_json: JSON.stringify({ cpuPercent: 35, memoryPercent: 62 }),
          passing_24h: 100,
          passing_30d: 99.9,
        },
      ]),
    };
    const access = { require: vi.fn().mockResolvedValue(undefined) };
    const service = new ChecksService(
      database as never,
      access as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never
    );

    const checks = await service.list("user-1", "team-1");

    expect(database.all).toHaveBeenCalledWith(
      expect.stringContaining("latest.metrics_json"),
      "team-1"
    );
    expect(checks[0]?.latestMetrics).toEqual({ cpuPercent: 35, memoryPercent: 62 });
  });

  it("accepts unresolved agent targets without using Mimorii DNS", async () => {
    const summary = {
      id: "check-1",
      team_id: "team-1",
      resource_id: "resource-1",
      name: "Private HTTP",
      type: "http",
      config_json: JSON.stringify({
        target: { url: "http://private-service.internal/health", method: "GET" },
        expectedStatuses: [200],
        followRedirects: false,
        validateTls: true,
      }),
      interval_seconds: 60,
      timeout_ms: 5_000,
      failure_threshold: 2,
      recovery_threshold: 1,
      enabled: 1,
      current_status: "pending",
      consecutive_failures: 0,
      consecutive_successes: 0,
      last_latency_ms: null,
      last_checked_at: null,
      next_check_at: "2026-08-25T08:00:00.000Z",
      created_at: "2026-08-25T08:00:00.000Z",
      updated_at: "2026-08-25T08:00:00.000Z",
      agent_id: "agent-1",
      encrypted_secret: null,
      favicon_request_id: null,
      latest_metrics_json: null,
      passing_24h: null,
      passing_30d: null,
    };
    const database = {
      get: vi
        .fn()
        .mockResolvedValueOnce({ count: 0 })
        .mockResolvedValueOnce({ id: "resource-1" })
        .mockResolvedValueOnce({
          kind: "desktop",
          capabilities_json: '["http"]',
          resource_id: "agent-resource",
        })
        .mockResolvedValueOnce(summary),
      run: vi.fn(async () => ({ changes: 1 })),
    };
    const targets = {
      resolvePublicHost: vi.fn(async () => {
        throw new Error("Mimorii DNS should not be used");
      }),
    };
    const service = new ChecksService(
      database as never,
      { require: vi.fn(async () => undefined) } as never,
      new CheckConfigService(),
      targets as never,
      {} as never,
      { record: vi.fn(async () => undefined) } as never
    );

    const check = await service.create("user-1", "team-1", {
      resourceId: "resource-1",
      name: "Private HTTP",
      type: "http",
      config: { target: { url: "http://private-service.internal/health" } },
      execution: { kind: "agent", agentId: "agent-1" },
    });

    expect(check.config).toMatchObject({
      target: { url: "http://private-service.internal/health" },
    });
    expect(targets.resolvePublicHost).not.toHaveBeenCalled();
  });

  it("presents a recently reported critical disk evaluation without changing its metrics", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-25T12:00:00.000Z"));
    try {
      const database = {
        all: vi.fn().mockResolvedValue([
          summaryRow({
            type: "disk",
            config_json: JSON.stringify({
              mount: "C:",
              warningPercent: 85,
              criticalPercent: 95,
            }),
            current_status: "down",
            agent_kind: "desktop",
            agent_last_seen_at: "2026-08-25T11:59:40.000Z",
            agent_collection_interval_seconds: 30,
            latest_metrics_json: JSON.stringify({ mount: "C:", usedPercent: 97.3 }),
          }),
        ]),
      };
      const service = checkService(database);

      await expect(service.list("user-1", "team-1")).resolves.toMatchObject([
        {
          type: "disk",
          status: "critical",
          latestMetrics: { mount: "C:", usedPercent: 97.3 },
        },
      ]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps a reachable HTTP check availability-oriented", async () => {
    const database = {
      all: vi.fn().mockResolvedValue([
        summaryRow({
          type: "http",
          current_status: "up",
          agent_id: null,
          agent_kind: null,
          agent_last_seen_at: null,
          latest_metrics_json: JSON.stringify({ responseBytes: 128 }),
        }),
      ]),
    };

    await expect(checkService(database).list("user-1", "team-1")).resolves.toMatchObject([
      { type: "http", status: "up" },
    ]);
  });

  it("reports down only after the assigned reporter passes the stale threshold", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-25T12:00:00.000Z"));
    try {
      const database = {
        all: vi.fn().mockResolvedValue([
          summaryRow({
            id: "check-recent",
            current_status: "up",
            agent_kind: "desktop",
            agent_last_seen_at: "2026-08-25T11:55:00.000Z",
            agent_collection_interval_seconds: 30,
          }),
          summaryRow({
            id: "check-stale",
            current_status: "up",
            agent_kind: "desktop",
            agent_last_seen_at: "2026-08-25T11:54:59.999Z",
            agent_collection_interval_seconds: 30,
          }),
        ]),
      };
      const service = checkService(database);

      const checks = await service.list("user-1", "team-1");

      expect(checks.map(({ id, status }) => ({ id, status }))).toEqual([
        { id: "check-recent", status: "okay" },
        { id: "check-stale", status: "down" },
      ]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("reports down when the scheduler records a missed agent status", async () => {
    const database = {
      all: vi.fn().mockResolvedValue([
        summaryRow({
          current_status: "degraded",
          agent_kind: "desktop",
          agent_last_seen_at: new Date().toISOString(),
          agent_collection_interval_seconds: 30,
          latest_metrics_json: JSON.stringify({ agentTimeout: true }),
        }),
      ]),
    };

    await expect(checkService(database).list("user-1", "team-1")).resolves.toMatchObject([
      { status: "down" },
    ]);
  });
});

function checkService(database: object): ChecksService {
  return new ChecksService(
    database as never,
    { require: vi.fn().mockResolvedValue(undefined) } as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never
  );
}

function summaryRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "check-1",
    team_id: "team-1",
    resource_id: "resource-1",
    name: "Health",
    type: "host",
    config_json: JSON.stringify({}),
    interval_seconds: 60,
    timeout_ms: 5_000,
    failure_threshold: 2,
    recovery_threshold: 1,
    enabled: 1,
    current_status: "up",
    consecutive_failures: 0,
    consecutive_successes: 1,
    last_latency_ms: null,
    last_checked_at: "2026-08-25T11:59:40.000Z",
    next_check_at: "2026-08-25T12:00:40.000Z",
    created_at: "2026-08-20T08:00:00.000Z",
    updated_at: "2026-08-25T11:59:40.000Z",
    agent_id: "agent-1",
    encrypted_secret: null,
    favicon_request_id: null,
    agent_kind: "desktop",
    agent_last_seen_at: "2026-08-25T11:59:40.000Z",
    agent_collection_interval_seconds: 30,
    latest_metrics_json: JSON.stringify({ cpuPercent: 35, memoryPercent: 62 }),
    passing_24h: 100,
    passing_30d: 100,
    ...overrides,
  };
}
