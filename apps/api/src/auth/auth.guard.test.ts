import { UnauthorizedException, type ExecutionContext } from "@nestjs/common";
import type { JwtService } from "@nestjs/jwt";
import { describe, expect, it, vi } from "vitest";
import type { DatabaseService } from "../database/database.service.js";
import { AuthGuard } from "./auth.guard.js";

describe("REST authentication guard", () => {
  it("does not treat an MCP OAuth access token as a REST credential", async () => {
    const verifyAsync = vi.fn(async () => {
      throw new Error("Not a web session JWT");
    });
    const database = { get: vi.fn(), run: vi.fn() };
    const guard = new AuthGuard(
      { verifyAsync } as unknown as JwtService,
      database as unknown as DatabaseService
    );

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
    const guard = new AuthGuard(
      { verifyAsync } as unknown as JwtService,
      database as unknown as DatabaseService
    );

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
    const guard = new AuthGuard(
      { verifyAsync } as unknown as JwtService,
      database as unknown as DatabaseService
    );

    await expect(guard.canActivate(context("Bearer session-jwt"))).rejects.toBeInstanceOf(
      UnauthorizedException
    );
    expect(database.get).not.toHaveBeenCalled();
  });
});

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

function context(authorization: string): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ headers: { authorization } }) }),
  } as unknown as ExecutionContext;
}
