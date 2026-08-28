import { Logger } from "@nestjs/common";
import { afterEach, describe, expect, it, vi } from "vitest";
import { encryptConfiguration } from "../common/crypto.js";
import { CheckOrchestratorService } from "./check-orchestrator.service.js";

const originalJwtSecret = process.env.MIMORII_JWT_SECRET;

function scheduledCheck(encryptedSecret: string) {
  const timestamp = "2026-08-28T12:00:00.000Z";
  return {
    id: "check-1",
    team_id: "team-1",
    resource_id: "resource-1",
    name: "API",
    type: "http" as const,
    config_json: JSON.stringify({
      target: { url: "https://example.com", method: "GET" },
      expectedStatuses: [200],
      followRedirects: false,
      validateTls: true,
    }),
    interval_seconds: 60,
    timeout_ms: 5_000,
    failure_threshold: 1,
    recovery_threshold: 1,
    enabled: 1,
    current_status: "pending" as const,
    consecutive_failures: 0,
    consecutive_successes: 0,
    last_latency_ms: null,
    last_checked_at: null,
    next_check_at: timestamp,
    created_at: timestamp,
    updated_at: timestamp,
    agent_id: null,
    encrypted_secret: encryptedSecret,
    favicon_request_id: null,
    agent_kind: null,
    agent_capabilities_json: null,
  };
}

function restoreJwtSecret(): void {
  if (originalJwtSecret === undefined) delete process.env.MIMORII_JWT_SECRET;
  else process.env.MIMORII_JWT_SECRET = originalJwtSecret;
}

afterEach(() => {
  restoreJwtSecret();
  vi.restoreAllMocks();
});

describe("check orchestrator", () => {
  it("records an actionable failure when saved credentials cannot be decrypted", async () => {
    process.env.MIMORII_JWT_SECRET = "old-test-key-with-at-least-thirty-two-characters";
    const check = scheduledCheck(encryptConfiguration("Bearer monitor-token"));
    process.env.MIMORII_JWT_SECRET = "new-test-key-with-at-least-thirty-two-characters";

    const database = {
      get: vi.fn().mockResolvedValue(check),
      run: vi.fn().mockResolvedValue({ changes: 1 }),
    };
    const runner = { run: vi.fn() };
    const recordedResult = { id: "result-1" };
    const results = { record: vi.fn().mockResolvedValue(recordedResult) };
    const access = { require: vi.fn().mockResolvedValue(undefined) };
    const service = new CheckOrchestratorService(
      database as never,
      runner as never,
      results as never,
      access as never
    );

    await expect(service.runNow("user-1", "team-1", check.id)).resolves.toEqual({
      queued: false,
      result: recordedResult,
    });
    expect(runner.run).not.toHaveBeenCalled();
    expect(results.record).toHaveBeenCalledWith(
      check.id,
      expect.objectContaining({
        status: "down",
        message: "Saved check credentials are unavailable. Re-enter the secret.",
      })
    );
  });

  it("passes credentials to the runner when they use the active key", async () => {
    process.env.MIMORII_JWT_SECRET = "active-test-key-with-at-least-thirty-two-characters";
    const check = scheduledCheck(encryptConfiguration("Bearer monitor-token"));
    const execution = {
      status: "up" as const,
      latencyMs: 10,
      statusCode: 200,
      message: null,
      metrics: {},
      checkedAt: "2026-08-28T12:01:00.000Z",
    };
    const database = {
      get: vi.fn().mockResolvedValue(check),
      run: vi.fn().mockResolvedValue({ changes: 1 }),
    };
    const runner = { run: vi.fn().mockResolvedValue(execution) };
    const results = { record: vi.fn().mockResolvedValue({ id: "result-1" }) };
    const access = { require: vi.fn().mockResolvedValue(undefined) };
    const service = new CheckOrchestratorService(
      database as never,
      runner as never,
      results as never,
      access as never
    );

    await service.runNow("user-1", "team-1", check.id);

    expect(runner.run).toHaveBeenCalledWith(
      expect.objectContaining({ secret: "Bearer monitor-token" })
    );
    expect(results.record).toHaveBeenCalledWith(check.id, execution);
  });

  it("contains scheduled execution failures", async () => {
    process.env.MIMORII_JWT_SECRET = "active-test-key-with-at-least-thirty-two-characters";
    const check = scheduledCheck(encryptConfiguration("Bearer monitor-token"));
    const database = {
      all: vi
        .fn()
        .mockImplementation(async (sql: string) =>
          sql.includes("LEFT JOIN agents a") ? [check] : []
        ),
      run: vi.fn().mockResolvedValue({ changes: 1 }),
      transaction: vi.fn().mockImplementation(async (action: () => Promise<unknown>) => action()),
    };
    const runner = {
      run: vi.fn().mockResolvedValue({
        status: "up",
        latencyMs: 10,
        statusCode: 200,
        message: null,
        metrics: {},
        checkedAt: "2026-08-28T12:01:00.000Z",
      }),
    };
    const results = { record: vi.fn().mockRejectedValue(new Error("database unavailable")) };
    const access = { require: vi.fn() };
    const logError = vi.spyOn(Logger.prototype, "error").mockImplementation(() => undefined);
    const service = new CheckOrchestratorService(
      database as never,
      runner as never,
      results as never,
      access as never
    );

    await service.tick();

    await vi.waitFor(() => {
      expect(logError).toHaveBeenCalledWith(
        `Scheduled check ${check.id} failed`,
        expect.stringContaining("database unavailable")
      );
    });
  });
});
