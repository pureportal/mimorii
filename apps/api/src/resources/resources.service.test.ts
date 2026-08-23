import { BadRequestException, ForbiddenException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import type { AuditService } from "../common/audit.service.js";
import type { DatabaseService } from "../database/database.service.js";
import type { MaintenanceService } from "../maintenance/maintenance.service.js";
import type { TeamAccessService } from "../teams/team-access.service.js";
import { ResourcesService } from "./resources.service.js";

function service(
  database: object,
  requireAccess: (userId: string, teamId: string, role: string) => Promise<unknown> = vi.fn(
    async () => ({})
  )
) {
  return new ResourcesService(
    database as DatabaseService,
    { require: requireAccess } as unknown as TeamAccessService,
    { isResourceActive: vi.fn(async () => false) } as unknown as MaintenanceService,
    { record: vi.fn(async () => undefined) } as unknown as AuditService
  );
}

const row = {
  id: "resource-1",
  team_id: "team-1",
  name: "Website",
  kind: "service",
  description: null,
  tags_json: "[]",
  agent_id: null,
  agent_kind: null,
  agent_platform: null,
  agent_version: null,
  agent_last_seen_at: null,
  agent_collection_interval_seconds: null,
  status: "pending",
  checks_up: 0,
  checks_total: 0,
  last_checked_at: null,
  image_updated_at: null,
  created_at: "2026-08-21T12:00:00.000Z",
} as const;

describe("ResourcesService", () => {
  it("creates a canonical resource without a target or execution route", async () => {
    const database = {
      get: vi.fn().mockResolvedValueOnce({ count: 0 }).mockResolvedValueOnce(row),
      run: vi.fn(async () => ({ changes: 1 })),
    };
    const resources = service(database);

    await expect(
      resources.create("user-1", "team-1", { name: "Website", kind: "service" })
    ).resolves.toMatchObject({ name: "Website", kind: "service", agent: null });
    expect(database.run).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO resources"),
      expect.any(String),
      "team-1",
      "Website",
      "service",
      null,
      "[]",
      expect.any(String),
      expect.any(String)
    );
  });

  it("enforces the resource limit", async () => {
    const resources = service({ get: vi.fn(async () => ({ count: 1_000 })) });
    await expect(
      resources.create("user-1", "team-1", { name: "Website", kind: "service" })
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("requires an administrator to delete an agent resource", async () => {
    const requireAccess = vi.fn(async (_userId: string, _teamId: string, role: string) => {
      if (role === "admin") throw new ForbiddenException();
      return {};
    });
    const resources = service({ get: vi.fn(async () => ({ agent_id: "agent-1" })) }, requireAccess);

    await expect(resources.remove("member-1", "team-1", "agent-1")).rejects.toBeInstanceOf(
      ForbiddenException
    );
    expect(requireAccess).toHaveBeenCalledWith("member-1", "team-1", "admin");
  });
});
