import { BadRequestException, ForbiddenException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import type { AuditService } from "../common/audit.service.js";
import type { DatabaseService } from "../database/database.service.js";
import type { MaintenanceService } from "../maintenance/maintenance.service.js";
import type { TeamAccessService } from "../teams/team-access.service.js";
import { ResourcesService } from "./resources.service.js";
import type { ResourceImagesService } from "./resource-images.service.js";

function service(database: object, requireAccess: ReturnType<typeof vi.fn>) {
  return new ResourcesService(
    database as DatabaseService,
    { require: requireAccess } as unknown as TeamAccessService,
    {} as MaintenanceService,
    {} as AuditService,
    { tryAssignFavicon: vi.fn() } as unknown as ResourceImagesService
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

  it("does not assign mobile agents to resources", async () => {
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

describe("ResourcesService image assignment", () => {
  it("returns a created website when automatic favicon assignment is unavailable", async () => {
    const database = {
      get: vi.fn().mockResolvedValueOnce({ count: 0 }).mockResolvedValueOnce({
        id: "resource-1",
        team_id: "team-1",
        name: "Website",
        kind: "endpoint",
        target: "https://example.com/",
        description: null,
        tags_json: "[]",
        agent_id: null,
        status: "pending",
        checks_up: 0,
        checks_total: 0,
        last_checked_at: null,
        image_updated_at: null,
        created_at: "2026-08-21T12:00:00.000Z",
      }),
      run: vi.fn().mockResolvedValue({ changes: 1 }),
    };
    const access = { require: vi.fn(async () => ({})) };
    const maintenance = { isResourceActive: vi.fn().mockResolvedValue(false) };
    const audit = { record: vi.fn().mockResolvedValue(undefined) };
    const images = { tryAssignFavicon: vi.fn().mockResolvedValue(false) };
    const resources = new ResourcesService(
      database as unknown as DatabaseService,
      access as unknown as TeamAccessService,
      maintenance as unknown as MaintenanceService,
      audit as unknown as AuditService,
      images as unknown as ResourceImagesService
    );

    await expect(
      resources.create("user-1", "team-1", {
        name: "Website",
        kind: "endpoint",
        target: "https://example.com/",
      })
    ).resolves.toMatchObject({ name: "Website", imageUpdatedAt: null });
    expect(database.run).toHaveBeenCalledOnce();
    expect(images.tryAssignFavicon).toHaveBeenCalledWith(
      "user-1",
      "team-1",
      expect.any(String),
      "endpoint",
      "https://example.com/"
    );
  });
});
