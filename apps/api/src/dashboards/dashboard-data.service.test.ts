import { describe, expect, it, vi } from "vitest";
import type { ResourceHealthService } from "../common/resource-health.service.js";
import type { ResourceTelemetryService } from "../common/resource-telemetry.service.js";
import type { DatabaseService } from "../database/database.service.js";
import { DashboardDataService } from "./dashboard-data.service.js";

describe("DashboardDataService", () => {
  it("uses resource health for status panels", async () => {
    const database = {
      all: vi.fn(async () => [{ id: "resource-1", name: "Host" }]),
    };
    const health = {
      forResources: vi.fn(async () => new Map([["resource-1", "critical"]])),
    };
    const service = new DashboardDataService(
      database as unknown as DatabaseService,
      {} as ResourceTelemetryService,
      health as unknown as ResourceHealthService
    );

    const view = await service.render(
      "team-1",
      { name: "Operations", slug: "operations", updatedAt: "2026-08-25T12:00:00.000Z" },
      [{ id: "status-1", type: "status", title: "Host status", width: 1, resourceId: "resource-1" }]
    );

    expect(view.items[0]).toMatchObject({
      type: "status",
      resourceName: "Host",
      status: "critical",
    });
    expect(health.forResources).toHaveBeenCalledWith("team-1", ["resource-1"]);
  });
});
