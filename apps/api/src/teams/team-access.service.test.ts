import { ForbiddenException, NotFoundException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { apiTokenTeamRoles } from "../auth/api-token-scope.js";
import { TeamAccessService } from "./team-access.service.js";

const membership = {
  team_id: "team-1",
  user_id: "user-1",
  role: "member" as const,
  joined_at: "2026-09-04T10:00:00.000Z",
};

describe("TeamAccessService", () => {
  it("loads the team and membership in one query", async () => {
    const database = { get: vi.fn().mockResolvedValue(membership) };
    const service = new TeamAccessService(database as never);

    await expect(service.require("user-1", "team-1", "viewer")).resolves.toEqual(membership);

    expect(database.get).toHaveBeenCalledOnce();
    expect(database.get).toHaveBeenCalledWith(
      expect.stringContaining("LEFT JOIN team_members"),
      "user-1",
      "team-1"
    );
  });

  it("distinguishes a missing team from missing membership", async () => {
    const database = { get: vi.fn().mockResolvedValue(undefined) };
    const service = new TeamAccessService(database as never);

    await expect(service.require("user-1", "missing-team")).rejects.toBeInstanceOf(
      NotFoundException
    );
  });

  it("rejects a user who is not a team member", async () => {
    const database = {
      get: vi.fn().mockResolvedValue({
        team_id: null,
        user_id: null,
        role: null,
        joined_at: null,
      }),
    };
    const service = new TeamAccessService(database as never);

    await expect(service.require("user-1", "team-1")).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("enforces the minimum role", async () => {
    const database = { get: vi.fn().mockResolvedValue(membership) };
    const service = new TeamAccessService(database as never);

    await expect(service.require("user-1", "team-1", "admin")).rejects.toBeInstanceOf(
      ForbiddenException
    );
  });

  it("caps the membership role at the API token team role", async () => {
    const database = { get: vi.fn().mockResolvedValue({ ...membership, role: "owner" }) };
    const service = new TeamAccessService(database as never);
    const tokenRoles = new Map([["team-1", "member" as const]]);

    await apiTokenTeamRoles.run(tokenRoles, async () => {
      await expect(service.require("user-1", "team-1", "member")).resolves.toMatchObject({
        role: "member",
      });
      await expect(service.require("user-1", "team-1", "admin")).rejects.toBeInstanceOf(
        ForbiddenException
      );
    });
  });

  it("rejects teams outside the API token scope", async () => {
    const database = { get: vi.fn().mockResolvedValue(membership) };
    const service = new TeamAccessService(database as never);

    await apiTokenTeamRoles.run(new Map([["team-2", "owner"]]), async () => {
      await expect(service.require("user-1", "team-1")).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  it("limits listed teams to the API token scope", async () => {
    const service = new TeamAccessService({} as never);
    const teams = [
      { id: "team-1", name: "Operations", role: "admin" as const, createdAt: "2026-09-04" },
      { id: "team-2", name: "Platform", role: "viewer" as const, createdAt: "2026-09-04" },
    ];

    expect(service.limitToApiTokenScope(teams)).toEqual(teams);
    apiTokenTeamRoles.run(new Map([["team-1", "member"]]), () => {
      expect(service.limitToApiTokenScope(teams)).toEqual([{ ...teams[0], role: "member" }]);
    });
  });
});
