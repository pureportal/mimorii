import { describe, expect, it, vi } from "vitest";
import type { AuditService } from "../common/audit.service.js";
import type { ResourceHealthService } from "../common/resource-health.service.js";
import type { DatabaseService } from "../database/database.service.js";
import type { IncidentsService } from "../incidents/incidents.service.js";
import type { MaintenanceService } from "../maintenance/maintenance.service.js";
import type { NotificationsService } from "../notifications/notifications.service.js";
import type { TeamAccessService } from "../teams/team-access.service.js";
import { StatusPagesService } from "./status-pages.service.js";

describe("StatusPagesService", () => {
  it("publishes a critical resource as critical without declaring an outage", async () => {
    const database = {
      get: vi
        .fn()
        .mockResolvedValueOnce({
          id: "page-1",
          team_id: "team-1",
          name: "Status",
          slug: "status",
          published: 1,
          show_uptime: 1,
          created_at: "2026-08-25T11:00:00.000Z",
          updated_at: "2026-08-25T11:00:00.000Z",
          subscriber_count: 0,
        })
        .mockResolvedValueOnce({ updated_at: "2026-08-25T12:00:00.000Z" }),
      all: vi.fn(async (sql: string) => {
        if (sql.includes("SELECT resource_id FROM status_page_resources")) {
          return [{ resource_id: "resource-1" }];
        }
        if (sql.includes("status_page_resources spr JOIN resources")) {
          return [{ id: "resource-1", name: "Host", uptime_30d: 98.5 }];
        }
        if (sql.includes("FROM observations WHERE resource_id")) return [];
        throw new Error(`Unexpected query: ${sql}`);
      }),
    };
    const health = {
      forResources: vi.fn(async () => new Map([["resource-1", "critical"]])),
    };
    const service = new StatusPagesService(
      database as unknown as DatabaseService,
      {} as TeamAccessService,
      { forResources: vi.fn(async () => []) } as unknown as IncidentsService,
      { visibleForResources: vi.fn(async () => []) } as unknown as MaintenanceService,
      { emailAvailable: vi.fn(() => false) } as unknown as NotificationsService,
      {} as AuditService,
      health as unknown as ResourceHealthService
    );

    const page = await service.publicPage("status");

    expect(page.state).toBe("degraded");
    expect(page.components).toEqual([
      expect.objectContaining({ name: "Host", status: "critical" }),
    ]);
    expect(health.forResources).toHaveBeenCalledWith("team-1", ["resource-1"]);
  });
});
