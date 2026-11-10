import { ForbiddenException, UnauthorizedException, type ExecutionContext } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { JwtService } from "@nestjs/jwt";
import { describe, expect, it, vi } from "vitest";
import type { DatabaseService } from "../database/database.service.js";
import { AllowApiTokenWithoutTeam } from "./api-token-scope.js";
import { AuthGuard } from "./auth.guard.js";
import type { AuthenticatedRequest } from "./current-user.decorator.js";

describe("REST authentication guard", () => {
  it("does not treat an MCP OAuth access token as a REST credential", async () => {
    const verifyAsync = vi.fn(async () => {
      throw new Error("Not a web session JWT");
    });
    const database = { get: vi.fn(), run: vi.fn() };
    const guard = createGuard(database, verifyAsync);

    await expect(
      guard.canActivate(context("Bearer mim_oat_resource_token"))
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(verifyAsync).not.toHaveBeenCalled();
    expect(database.get).not.toHaveBeenCalled();
  });

  it("accepts a JWT only while its backing session remains active", async () => {
    const verifyAsync = vi.fn(async () => ({ sub: "user-1", v: 2, sid: "session-1" }));
    const database = {
      get: vi.fn(async () => userRow),
      run: vi.fn(),
    };
    const guard = createGuard(database, verifyAsync);

    await expect(guard.canActivate(context("Bearer session-jwt"))).resolves.toBe(true);
    expect(database.get).toHaveBeenCalledWith(
      expect.stringContaining("JOIN user_sessions"),
      "user-1",
      "session-1",
      expect.any(String)
    );
  });

  it("rejects a JWT without a session identifier", async () => {
    const verifyAsync = vi.fn(async () => ({ sub: "user-1", v: 2 }));
    const database = { get: vi.fn(), run: vi.fn() };
    const guard = createGuard(database, verifyAsync);

    await expect(guard.canActivate(context("Bearer session-jwt"))).rejects.toBeInstanceOf(
      UnauthorizedException
    );
    expect(database.get).not.toHaveBeenCalled();
  });

  it("authenticates an API token for a granted team with its team roles", async () => {
    const database = { get: vi.fn(async () => apiTokenRow("write")), run: vi.fn() };
    const guard = createGuard(database);
    const executionContext = context("Bearer mim_pat_token", {
      method: "PATCH",
      params: { teamId: "team-1" },
    });

    await expect(guard.canActivate(executionContext)).resolves.toBe(true);
    const request = executionContext.switchToHttp().getRequest<AuthenticatedRequest>();
    expect(request.user).toMatchObject({ id: "user-1", authMethod: "apiToken" });
    expect(request.authCredential).toEqual({
      type: "apiToken",
      id: "token-1",
      access: "write",
      teamRoles: new Map([["team-1", "member"]]),
    });
  });

  it("rejects API tokens for teams they were not granted", async () => {
    const database = { get: vi.fn(async () => apiTokenRow("write")), run: vi.fn() };
    const guard = createGuard(database);

    await expect(
      guard.canActivate(context("Bearer mim_pat_token", { params: { teamId: "team-2" } }))
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(database.run).not.toHaveBeenCalled();
  });

  it("rejects writes with a read-only API token", async () => {
    const database = { get: vi.fn(async () => apiTokenRow("read")), run: vi.fn() };
    const guard = createGuard(database);

    await expect(
      guard.canActivate(
        context("Bearer mim_pat_token", { method: "DELETE", params: { teamId: "team-1" } })
      )
    ).rejects.toThrow("API token is read-only");
  });

  it("limits API tokens to team routes and explicitly allowed routes", async () => {
    const database = { get: vi.fn(async () => apiTokenRow("write")), run: vi.fn() };
    const guard = createGuard(database);

    await expect(
      guard.canActivate(context("Bearer mim_pat_token", { method: "POST" }))
    ).rejects.toThrow("API tokens cannot access this endpoint");
    await expect(
      guard.canActivate(context("Bearer mim_pat_token", { handler: TeamDirectory.prototype.list }))
    ).resolves.toBe(true);
  });
});

class TeamDirectory {
  @AllowApiTokenWithoutTeam()
  list(this: void) {}
}

const userRow = {
  id: "user-1",
  email: "user@example.com",
  name: "User",
  password_hash: "password-hash",
  token_version: 2,
  is_global_admin: false,
  acknowledged_tour_ids: [],
  disabled_at: null,
  last_signed_in_at: null,
  created_at: "2026-08-01T00:00:00.000Z",
  updated_at: "2026-08-01T00:00:00.000Z",
};

function apiTokenRow(access: "read" | "write") {
  return {
    ...userRow,
    api_token_id: "token-1",
    access,
    team_roles: { "team-1": "member" },
    last_used_at: new Date().toISOString(),
  };
}

function createGuard(
  database: { get: ReturnType<typeof vi.fn>; run: ReturnType<typeof vi.fn> },
  verifyAsync = vi.fn()
): AuthGuard {
  return new AuthGuard(
    { verifyAsync } as unknown as JwtService,
    database as unknown as DatabaseService,
    new Reflector()
  );
}

function context(
  authorization: string,
  options: { method?: string; params?: Record<string, string>; handler?: () => void } = {}
): ExecutionContext {
  const request = {
    headers: { authorization },
    method: options.method ?? "GET",
    params: options.params ?? {},
  };
  return {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => options.handler ?? (() => undefined),
  } as unknown as ExecutionContext;
}
