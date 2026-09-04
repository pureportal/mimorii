import { UnauthorizedException } from "@nestjs/common";
import type { JwtService } from "@nestjs/jwt";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { hashSecret } from "../common/crypto.js";
import type { AuthenticatedUser, UserRow } from "../common/rows.js";
import type { DatabaseService } from "../database/database.service.js";
import { SessionService } from "./session.service.js";

describe("user sessions", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-04T12:00:00.000Z"));
  });

  afterEach(() => vi.useRealTimers());

  it("issues a one-hour access token backed by a 30-day refresh session", async () => {
    const fixture = serviceFixture();

    const credentials = await fixture.service.create(authenticatedUser);

    expect(credentials).toMatchObject({
      accessToken: "signed-access-token",
      expiresAt: "2026-09-04T13:00:00.000Z",
      refreshToken: expect.stringMatching(/^mim_srt_/),
      refreshExpiresAt: "2026-10-04T12:00:00.000Z",
    });
    expect(fixture.jwt.signAsync).toHaveBeenCalledWith(
      { sub: authenticatedUser.id, v: authenticatedUser.tokenVersion, sid: expect.any(String) },
      { expiresIn: 3_600 }
    );
    expect(fixture.database.run).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO user_sessions"),
      expect.any(String),
      hashSecret(credentials.refreshToken),
      authenticatedUser.id,
      authenticatedUser.tokenVersion,
      "2026-10-04T12:00:00.000Z",
      "2026-09-04T12:00:00.000Z"
    );
  });

  it("renews the access token and slides the refresh-session lease", async () => {
    const fixture = serviceFixture(sessionRow());

    const refreshed = await fixture.service.refresh("mim_srt_existing");

    expect(refreshed).toMatchObject({
      user: authenticatedUser,
      credentials: {
        accessToken: "signed-access-token",
        refreshToken: "mim_srt_existing",
        expiresAt: "2026-09-04T13:00:00.000Z",
        refreshExpiresAt: "2026-10-04T12:00:00.000Z",
      },
    });
    expect(fixture.database.get).toHaveBeenCalledWith(
      expect.stringContaining("FROM user_sessions"),
      hashSecret("mim_srt_existing")
    );
    expect(fixture.database.run).toHaveBeenCalledWith(
      "UPDATE user_sessions SET expires_at = ?, last_refreshed_at = ? WHERE id = ?",
      "2026-10-04T12:00:00.000Z",
      "2026-09-04T12:00:00.000Z",
      "session-1"
    );
  });

  it.each([
    ["expired", sessionRow({ session_expires_at: "2026-09-04T11:59:59.000Z" })],
    ["revoked by token version", sessionRow({ token_version: 3 })],
    ["disabled", sessionRow({ disabled_at: "2026-09-04T11:00:00.000Z" })],
  ])("rejects a %s refresh session", async (_description, row) => {
    const fixture = serviceFixture(row);

    await expect(fixture.service.refresh("mim_srt_invalid")).rejects.toBeInstanceOf(
      UnauthorizedException
    );
    expect(fixture.jwt.signAsync).not.toHaveBeenCalled();
  });

  it("revokes the session identified by the refresh credential", async () => {
    const fixture = serviceFixture();

    await fixture.service.revoke("mim_srt_existing");

    expect(fixture.database.run).toHaveBeenCalledWith(
      "DELETE FROM user_sessions WHERE token_hash = ?",
      hashSecret("mim_srt_existing")
    );
  });
});

const authenticatedUser: AuthenticatedUser = {
  id: "user-1",
  email: "user@example.com",
  name: "User",
  tokenVersion: 2,
  isGlobalAdmin: false,
  authMethod: "session",
};

function sessionRow(overrides: Partial<UserRow & Record<string, unknown>> = {}) {
  return {
    id: authenticatedUser.id,
    email: authenticatedUser.email,
    name: authenticatedUser.name,
    password_hash: "password-hash",
    token_version: authenticatedUser.tokenVersion,
    is_global_admin: authenticatedUser.isGlobalAdmin,
    acknowledged_tour_ids: [],
    disabled_at: null,
    last_signed_in_at: null,
    created_at: "2026-08-01T00:00:00.000Z",
    updated_at: "2026-08-01T00:00:00.000Z",
    session_id: "session-1",
    session_token_version: authenticatedUser.tokenVersion,
    session_expires_at: "2026-09-20T00:00:00.000Z",
    ...overrides,
  };
}

function serviceFixture(row?: ReturnType<typeof sessionRow>) {
  const database = {
    get: vi.fn(async () => row),
    run: vi.fn(async () => ({ changes: 1 })),
    transaction: vi.fn(async (action: () => unknown) => action()),
  };
  const jwt = { signAsync: vi.fn(async () => "signed-access-token") };
  return {
    database,
    jwt,
    service: new SessionService(
      database as unknown as DatabaseService,
      jwt as unknown as JwtService
    ),
  };
}
