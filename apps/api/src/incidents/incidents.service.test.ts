import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MaintenanceService } from "../maintenance/maintenance.service.js";
import { IncidentsService } from "./incidents.service.js";

const initialSchedulerSetting = process.env.MIMORII_SCHEDULER_ENABLED;

const incident = {
  id: "incident-1",
  team_id: "team-1",
  source: "automatic" as const,
  check_id: "check-1",
  heartbeat_id: null,
  title: "Database: Host health",
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
  const maintenance = { suppressesAnyNotifications: vi.fn() };
  const notifications = { enqueue: vi.fn().mockResolvedValue([]) };

  beforeEach(() => {
    process.env.MIMORII_SCHEDULER_ENABLED = "true";
    vi.clearAllMocks();
    database.all
      .mockResolvedValueOnce([{ id: incident.id }])
      .mockResolvedValueOnce([{ id: "resource-1", name: "Database" }]);
    database.get.mockResolvedValueOnce(incident).mockResolvedValueOnce({ type: "host" });
    database.run.mockResolvedValue({ changes: 1 });
    database.transaction.mockImplementation(async (action: () => Promise<void>) => action());
    maintenance.suppressesAnyNotifications.mockResolvedValue(false);
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

  it("checks multi-resource maintenance with one database lookup", async () => {
    database.all
      .mockReset()
      .mockResolvedValueOnce([{ id: incident.id }])
      .mockResolvedValueOnce([
        { id: "resource-1", name: "Database" },
        { id: "resource-2", name: "API" },
        { id: "resource-3", name: "Worker" },
      ])
      .mockResolvedValueOnce([]);
    const maintenanceService = new MaintenanceService(
      database as never,
      {} as never,
      {} as never,
      {} as never
    );
    const service = new IncidentsService(
      database as never,
      {} as never,
      maintenanceService,
      notifications as never,
      {} as never
    );

    await service.releaseEndedMaintenanceSuppressions();

    expect(database.all).toHaveBeenCalledTimes(3);
    expect(database.all).toHaveBeenNthCalledWith(
      3,
      expect.stringContaining("mr.resource_id IN (?,?,?)"),
      "resource-1",
      "resource-2",
      "resource-3"
    );
  });

  it("keeps the incident suppressed while maintenance is active", async () => {
    maintenance.suppressesAnyNotifications.mockResolvedValue(true);
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

describe("incident updates", () => {
  const database = {
    all: vi.fn(),
    get: vi.fn(),
    run: vi.fn().mockResolvedValue({ changes: 1 }),
    transaction: vi.fn(async (action: () => Promise<void>) => action()),
  };
  const access = { require: vi.fn().mockResolvedValue(undefined) };
  const notifications = { enqueue: vi.fn().mockResolvedValue([]) };
  const audit = { record: vi.fn().mockResolvedValue(undefined) };

  beforeEach(() => {
    vi.clearAllMocks();
    database.run.mockResolvedValue({ changes: 1 });
    database.transaction.mockImplementation(async (action: () => Promise<void>) => action());
    access.require.mockResolvedValue(undefined);
    notifications.enqueue.mockResolvedValue([]);
    audit.record.mockResolvedValue(undefined);
  });

  it.each([
    { status: "monitoring" as const, message: "" },
    { status: "resolved" as const, message: "Recovery confirmed." },
  ])("saves a $status update with message '$message'", async ({ status, message }) => {
    const updatedIncident = {
      ...incident,
      status,
      acknowledged_at: "2026-08-13T12:05:00.000Z",
      resolved_at: status === "resolved" ? "2026-08-13T12:05:00.000Z" : null,
    };
    database.get.mockResolvedValueOnce(incident).mockResolvedValueOnce(updatedIncident);
    database.all
      .mockResolvedValueOnce([{ id: "resource-1", name: "Database" }])
      .mockResolvedValueOnce([{ id: "resource-1", name: "Database" }])
      .mockResolvedValueOnce([
        {
          id: "update-1",
          incident_id: incident.id,
          status,
          message,
          created_by_name: "Operator",
          created_at: "2026-08-13T12:05:00.000Z",
        },
      ]);
    const service = new IncidentsService(
      database as never,
      access as never,
      {} as never,
      notifications as never,
      audit as never
    );

    const result = await service.addUpdate("user-1", "team-1", incident.id, { status, message });

    expect(database.run).toHaveBeenCalledWith(
      expect.stringContaining("UPDATE incidents SET status = ?"),
      status,
      expect.any(String),
      status === "resolved" ? expect.any(String) : null,
      expect.any(String),
      incident.id,
      "team-1"
    );
    expect(database.run).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO incident_updates"),
      expect.any(String),
      incident.id,
      status,
      message,
      "user-1",
      expect.any(String)
    );
    expect(result).toMatchObject({
      status,
      updates: [expect.objectContaining({ status, message })],
    });
  });
});
