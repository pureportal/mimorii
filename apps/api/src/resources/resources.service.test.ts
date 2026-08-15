import { BadRequestException, ForbiddenException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import type { AuditService } from "../common/audit.service.js";
import type { DatabaseService } from "../database/database.service.js";
import type { MaintenanceService } from "../maintenance/maintenance.service.js";
import type { TeamAccessService } from "../teams/team-access.service.js";
import { ResourcesService } from "./resources.service.js";

function service(database: object, requireAccess: ReturnType<typeof vi.fn>) {
  return new ResourcesService(
    database as DatabaseService,
    { require: requireAccess } as unknown as TeamAccessService,
    {} as MaintenanceService,
    {} as AuditService
  );
}

describe("ResourcesService agent assignment", () => {
  it("requires an administrator when creating an agent-routed resource", async () => {
    const requireAccess = vi.fn(async (_userId: string, _teamId: string, role: string) => {
      if (role === "admin") throw new ForbiddenException();
      return {};
    });
    const databaseGet = vi.fn();
    const resources = service({ get: databaseGet }, requireAccess);

    await expect(
      resources.create("member-1", "team-1", {
        name: "Internal database",
        kind: "server",
        target: "database.internal",
        agentId: "6f649580-e075-4e1c-8f31-fc5a0c0a14b7",
      })
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(requireAccess).toHaveBeenNthCalledWith(1, "member-1", "team-1", "member");
    expect(requireAccess).toHaveBeenNthCalledWith(2, "member-1", "team-1", "admin");
    expect(databaseGet).not.toHaveBeenCalled();
  });

  it("requires an administrator only when an update changes the assigned agent", async () => {
    const requireAccess = vi.fn(async (_userId: string, _teamId: string, role: string) => {
      if (role === "admin") throw new ForbiddenException();
      return {};
    });
    const database = {
      get: vi.fn(async () => ({
        name: "Database",
        kind: "server",
        target: "database.internal",
        description: null,
        tags_json: "[]",
        agent_id: null,
      })),
    };
    const resources = service(database, requireAccess);

    await expect(
      resources.update("member-1", "team-1", "resource-1", {
        agentId: "6f649580-e075-4e1c-8f31-fc5a0c0a14b7",
      })
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(requireAccess).toHaveBeenNthCalledWith(1, "member-1", "team-1", "member");
    expect(requireAccess).toHaveBeenNthCalledWith(2, "member-1", "team-1", "admin");
  });

  it("does not assign mobile collectors to resources", async () => {
    const requireAccess = vi.fn(async () => ({}));
    const database = {
      get: vi
        .fn()
        .mockResolvedValueOnce({ count: 0 })
        .mockResolvedValueOnce({ kind: "mobile", capabilities_json: '["device-status"]' }),
      run: vi.fn(),
    };
    const resources = service(database, requireAccess);

    await expect(
      resources.create("admin-1", "team-1", {
        name: "Phone",
        kind: "server",
        target: "android",
        agentId: "mobile-1",
      })
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(database.run).not.toHaveBeenCalled();
  });
});
