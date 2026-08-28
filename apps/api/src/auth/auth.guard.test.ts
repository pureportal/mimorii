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
});

function context(authorization: string): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ headers: { authorization } }) }),
  } as unknown as ExecutionContext;
}
