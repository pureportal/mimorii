import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { IncidentsService } from "./incidents.service.js";

const initialSchedulerSetting = process.env.MIMORII_SCHEDULER_ENABLED;

const incident = {
  id: "incident-1",
  team_id: "team-1",
  source: "automatic" as const,
  check_id: "check-1",
  heartbeat_id: null,
  title: "Database: Root disk",
  impact: "major" as const,
  status: "investigating" as const,
  started_at: "2026-08-13T12:00:00.000Z",
  acknowledged_at: null,
  resolved_at: null,
  created_at: "2026-08-13T12:00:00.000Z",
  notifications_suppressed: 1,
};

describe("incident maintenance suppression", () => {
  const database = {
    all: vi.fn(),
    get: vi.fn(),
    run: vi.fn().mockResolvedValue({ changes: 1 }),
    transaction: vi.fn(async (action: () => Promise<void>) => action()),
  };
  const maintenance = { suppressesNotifications: vi.fn() };
  const notifications = { enqueue: vi.fn().mockResolvedValue([]) };

  beforeEach(() => {
    process.env.MIMORII_SCHEDULER_ENABLED = "true";
    vi.clearAllMocks();
    database.all
      .mockResolvedValueOnce([{ id: incident.id }])
      .mockResolvedValueOnce([{ id: "resource-1", name: "Database" }]);
    database.get.mockResolvedValueOnce(incident).mockResolvedValueOnce({ type: "disk" });
    database.run.mockResolvedValue({ changes: 1 });
    database.transaction.mockImplementation(async (action: () => Promise<void>) => action());
    maintenance.suppressesNotifications.mockResolvedValue(false);
    notifications.enqueue.mockResolvedValue([]);
  });

  afterEach(() => {
    if (initialSchedulerSetting === undefined) {
      delete process.env.MIMORII_SCHEDULER_ENABLED;
    } else {
      process.env.MIMORII_SCHEDULER_ENABLED = initialSchedulerSetting;
    }
  });

  it("sends one warning when maintenance ends and the incident remains active", async () => {
    const service = new IncidentsService(
      database as never,
      {} as never,
      maintenance as never,
      notifications as never,
      {} as never
    );

    await service.releaseEndedMaintenanceSuppressions();

    expect(database.get).toHaveBeenCalledWith(expect.stringContaining("FOR UPDATE"), incident.id);
    expect(database.run).toHaveBeenCalledWith(
      expect.stringContaining("notifications_suppressed = 0"),
      expect.any(String),
      incident.id
    );
    expect(notifications.enqueue).toHaveBeenCalledWith(
      incident.team_id,
      "incident.opened",
      expect.objectContaining({
        severity: "warning",
        suppressionEnded: true,
        dedupeKey: "check:check-1",
      })
    );
  });

  it("keeps the incident suppressed while maintenance is active", async () => {
    maintenance.suppressesNotifications.mockResolvedValue(true);
    const service = new IncidentsService(
      database as never,
      {} as never,
      maintenance as never,
      notifications as never,
      {} as never
    );

    await service.releaseEndedMaintenanceSuppressions();

    expect(database.run).not.toHaveBeenCalled();
    expect(notifications.enqueue).not.toHaveBeenCalled();
  });
});
