import { beforeEach, describe, expect, it, vi } from "vitest";
import { ResultsService } from "./results.service.js";

const checkedAt = "2026-08-13T12:00:00.000Z";
const result = {
  status: "degraded" as const,
  latencyMs: null,
  statusCode: null,
  message: "Disk usage reached 82%",
  metrics: { usedPercent: 82 },
  checkedAt,
};

function check(status: "up" | "degraded" | "down") {
  return {
    id: "check-1",
    team_id: "team-1",
    resource_id: "resource-1",
    resource_name: "Database",
    name: "Root disk",
    type: "disk" as const,
    config_json: "{}",
    interval_seconds: 60,
    timeout_ms: 5_000,
    failure_threshold: 1,
    recovery_threshold: 1,
    enabled: 1,
    current_status: status,
    consecutive_failures: 0,
    consecutive_successes: 0,
    last_latency_ms: null,
    last_checked_at: null,
    next_check_at: null,
    created_at: checkedAt,
    updated_at: checkedAt,
  };
}

describe("result notification transitions", () => {
  const database = {
    get: vi.fn(),
    run: vi.fn().mockResolvedValue({ changes: 1 }),
    transaction: vi.fn(async (action: () => Promise<void>) => action()),
  };
  const incidents = {
    openForCheck: vi.fn(),
    resolveForCheck: vi.fn().mockResolvedValue(false),
  };
  const maintenance = { suppressesNotifications: vi.fn().mockResolvedValue(false) };
  const notifications = { enqueue: vi.fn().mockResolvedValue([]) };
  const technologies = { observeHttp: vi.fn() };

  beforeEach(() => {
    vi.clearAllMocks();
    database.run.mockResolvedValue({ changes: 1 });
    database.transaction.mockImplementation(async (action: () => Promise<void>) => action());
    maintenance.suppressesNotifications.mockResolvedValue(false);
    incidents.resolveForCheck.mockResolvedValue(false);
  });

  it("sends one warning when a check enters degraded", async () => {
    database.get.mockResolvedValue(check("up"));
    const service = new ResultsService(
      database as never,
      incidents as never,
      maintenance as never,
      notifications as never,
      technologies as never
    );
    await service.record("check-1", result);
    expect(database.get).toHaveBeenCalledWith(expect.stringContaining("FOR UPDATE"), "check-1");
    expect(notifications.enqueue).toHaveBeenCalledOnce();
    expect(notifications.enqueue).toHaveBeenCalledWith(
      "team-1",
      "check.degraded",
      expect.objectContaining({ severity: "warning", metrics: { usedPercent: 82 } })
    );
  });

  it("does not repeat a warning while the check remains degraded", async () => {
    database.get.mockResolvedValue(check("degraded"));
    const service = new ResultsService(
      database as never,
      incidents as never,
      maintenance as never,
      notifications as never,
      technologies as never
    );
    await service.record("check-1", result);
    expect(notifications.enqueue).not.toHaveBeenCalled();
  });

  it("records a stale result without changing state or sending a notification", async () => {
    database.get.mockResolvedValue({
      ...check("up"),
      last_checked_at: "2026-08-13T12:01:00.000Z",
    });
    const service = new ResultsService(
      database as never,
      incidents as never,
      maintenance as never,
      notifications as never,
      technologies as never
    );
    await service.record("check-1", result);
    expect(database.run).toHaveBeenCalledOnce();
    expect(notifications.enqueue).not.toHaveBeenCalled();
    expect(technologies.observeHttp).not.toHaveBeenCalled();
  });

  it("sends an informational recovery after a degraded threshold clears", async () => {
    database.get.mockResolvedValue(check("degraded"));
    const service = new ResultsService(
      database as never,
      incidents as never,
      maintenance as never,
      notifications as never,
      technologies as never
    );
    await service.record("check-1", { ...result, status: "up", message: null, metrics: {} });
    expect(notifications.enqueue).toHaveBeenCalledWith(
      "team-1",
      "check.recovered",
      expect.objectContaining({ severity: "info", status: "up" })
    );
  });

  it("uses the incident recovery notification after an outage", async () => {
    database.get.mockResolvedValue(check("down"));
    incidents.resolveForCheck.mockResolvedValue(true);
    const service = new ResultsService(
      database as never,
      incidents as never,
      maintenance as never,
      notifications as never,
      technologies as never
    );
    await service.record("check-1", { ...result, status: "up", message: null, metrics: {} });
    expect(incidents.resolveForCheck).toHaveBeenCalledOnce();
    expect(notifications.enqueue).not.toHaveBeenCalled();
  });
});
