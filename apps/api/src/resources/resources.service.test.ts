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
  has_monitors: false,
  checks_up: 0,
  checks_total: 0,
  last_checked_at: null,
  image_updated_at: null,
  created_at: "2026-08-21T12:00:00.000Z",
} as const;

describe("ResourcesService", () => {
  it("reports a reachable host without configured monitors as up", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-25T12:00:00.000Z"));
    try {
      const database = {
        get: vi.fn(async () => ({
          ...row,
          name: "Homeserver",
          kind: "host",
          agent_id: "agent-1",
          agent_kind: "desktop",
          agent_platform: "linux",
          agent_version: "8.0.1",
          agent_last_seen_at: "2026-08-25T11:59:30.000Z",
          agent_collection_interval_seconds: 30,
        })),
      };

      await expect(service(database).get("user-1", "team-1", "resource-1")).resolves.toMatchObject({
        status: "up",
        checksTotal: 0,
        agent: { status: "online" },
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps a reachable host pending while a configured check is pending", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-25T12:00:00.000Z"));
    try {
      const database = {
        get: vi.fn(async () => ({
          ...row,
          kind: "host",
          agent_id: "agent-1",
          agent_kind: "desktop",
          agent_last_seen_at: "2026-08-25T11:59:30.000Z",
          agent_collection_interval_seconds: 30,
          has_monitors: true,
          checks_total: 1,
        })),
      };

      await expect(service(database).get("user-1", "team-1", "resource-1")).resolves.toMatchObject({
        status: "pending",
        checksTotal: 1,
        agent: { status: "online" },
      });
    } finally {
      vi.useRealTimers();
    }
  });

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
