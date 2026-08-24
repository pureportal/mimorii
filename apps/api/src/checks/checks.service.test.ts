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
          uptime_24h: 100,
          uptime_30d: 99.9,
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
      uptime_24h: null,
      uptime_30d: null,
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
});
