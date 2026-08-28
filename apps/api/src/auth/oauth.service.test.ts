import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AuditService } from "../common/audit.service.js";
import { hashSecret } from "../common/crypto.js";
import type { AuthenticatedUser } from "../common/rows.js";
import type { DatabaseService } from "../database/database.service.js";
import type {
  OAuthClientMetadata,
  OAuthClientMetadataService,
} from "./oauth-client-metadata.service.js";
import { OAuthService } from "./oauth.service.js";

const clientId = "https://client.example/oauth/mimorii.json";
const redirectUri = "http://127.0.0.1:9211/callback";
const resource = "https://mimorii.example/api/mcp";
const interoperableResource = "HTTPS://MIMORII.EXAMPLE/api/mcp";
const verifier = "a".repeat(64);
const challenge = createHash("sha256").update(verifier).digest("base64url");

const authorizationRequest = {
  response_type: "code" as const,
  client_id: clientId,
  redirect_uri: redirectUri,
  scope: "mcp:write mcp:read",
  state: "client-state",
  code_challenge: challenge,
  code_challenge_method: "S256" as const,
  resource,
};

beforeEach(() => vi.stubEnv("MIMORII_PUBLIC_URL", "https://mimorii.example"));
afterEach(() => vi.unstubAllEnvs());

describe("OAuth service", () => {
  it("validates the resource, redirect URI, and least-privilege scope set", async () => {
    const fixture = serviceFixture();

    await expect(fixture.service.authorizationRequest(authorizationRequest)).resolves.toEqual({
      clientName: "Operations assistant",
      clientHost: "client.example",
      redirectHost: "127.0.0.1:9211",
      redirectIsLoopback: true,
      refreshAccess: true,
      scopes: ["mcp:read", "mcp:write"],
    });
    expect(fixture.clients.resolve).toHaveBeenCalledWith(clientId);

    await expect(
      fixture.service.authorizationRequest({
        ...authorizationRequest,
        redirect_uri: "http://127.0.0.1:9212/callback",
      })
    ).rejects.toMatchObject({ code: "invalid_request" });
    await expect(
      fixture.service.authorizationRequest({
        ...authorizationRequest,
        resource: interoperableResource,
      })
    ).resolves.toMatchObject({ clientName: "Operations assistant" });
    await expect(
      fixture.service.authorizationRequest({
        ...authorizationRequest,
        resource: `${resource}?tenant=other`,
      })
    ).rejects.toMatchObject({ code: "invalid_request" });
    await expect(
      fixture.service.authorizationRequest({
        ...authorizationRequest,
        scope: "mcp:write",
      })
    ).rejects.toMatchObject({ code: "invalid_scope" });
  });

  it("reports unsupported token grants with the OAuth-specific error", async () => {
    const fixture = serviceFixture();
    await expect(
      fixture.service.exchange({
        grant_type: "client_credentials",
        client_id: clientId,
        resource,
      })
    ).rejects.toMatchObject({ code: "unsupported_grant_type" });
  });

  it("requires a browser session for consent", async () => {
    const fixture = serviceFixture();

    await expect(
      fixture.service.decideAuthorization(
        { ...sessionUser, authMethod: "apiToken" },
        { ...authorizationRequest, decision: "approve" }
      )
    ).rejects.toMatchObject({ code: "access_denied" });
    expect(fixture.clients.resolve).not.toHaveBeenCalled();
    expect(fixture.database.run).not.toHaveBeenCalled();
  });

  it("returns issuer-bound denial responses without creating a code", async () => {
    const fixture = serviceFixture();
    const result = await fixture.service.decideAuthorization(sessionUser, {
      ...authorizationRequest,
      decision: "deny",
    });
    const redirect = new URL(result.redirectUri);

    expect(`${redirect.origin}${redirect.pathname}`).toBe(redirectUri);
    expect(redirect.searchParams.get("error")).toBe("access_denied");
    expect(redirect.searchParams.get("state")).toBe("client-state");
    expect(redirect.searchParams.get("iss")).toBe("https://mimorii.example");
    expect(fixture.database.run).not.toHaveBeenCalled();
  });

  it("stores a short-lived code bound to the user, client, resource, and PKCE challenge", async () => {
    const fixture = serviceFixture();
    const result = await fixture.service.decideAuthorization(sessionUser, {
      ...authorizationRequest,
      decision: "approve",
    });
    const redirect = new URL(result.redirectUri);
    const insertion = fixture.database.run.mock.calls.find(([sql]) =>
      String(sql).includes("INSERT INTO oauth_authorization_codes")
    );

    expect(redirect.searchParams.get("code")).toMatch(/^mim_oac_/);
    expect(redirect.searchParams.get("state")).toBe("client-state");
    expect(redirect.searchParams.get("iss")).toBe("https://mimorii.example");
    expect(insertion).toEqual([
      expect.stringContaining("INSERT INTO oauth_authorization_codes"),
      expect.any(String),
      expect.any(String),
      sessionUser.id,
      sessionUser.tokenVersion,
      clientId,
      redirectUri,
      "mcp:read mcp:write",
      resource,
      challenge,
      true,
      expect.any(String),
      expect.any(String),
    ]);
    expect(fixture.audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: sessionUser.id,
        action: "oauth.client_authorized",
        metadata: { clientId, scopes: ["mcp:read", "mcp:write"] },
      })
    );
  });

  it("exchanges a code once with exact redirect and PKCE validation", async () => {
    const fixture = serviceFixture();
    fixture.database.get.mockResolvedValue(authorizationCodeRow(true));

    const tokens = await fixture.service.exchange({
      grant_type: "authorization_code",
      client_id: clientId,
      resource: interoperableResource,
      code: "mim_oac_code",
      code_verifier: verifier,
      redirect_uri: redirectUri,
    });

    expect(tokens).toMatchObject({
      access_token: expect.stringMatching(/^mim_oat_/),
      refresh_token: expect.stringMatching(/^mim_ort_/),
      token_type: "Bearer",
      expires_in: 3_600,
      scope: "mcp:read mcp:write",
    });
    expect(
      fixture.database.run.mock.calls.some(([sql]) =>
        String(sql).includes("INSERT INTO oauth_access_tokens")
      )
    ).toBe(true);
    expect(
      fixture.database.run.mock.calls.some(([sql]) =>
        String(sql).includes("INSERT INTO oauth_refresh_tokens")
      )
    ).toBe(true);
  });

  it("does not issue a refresh token unless the client declared that grant", async () => {
    const fixture = serviceFixture({ allowRefresh: false });
    fixture.database.get.mockResolvedValue(authorizationCodeRow(false));

    const tokens = await fixture.service.exchange({
      grant_type: "authorization_code",
      client_id: clientId,
      resource,
      code: "mim_oac_code",
      code_verifier: verifier,
      redirect_uri: redirectUri,
    });

    expect(tokens.refresh_token).toBeUndefined();
    expect(
      fixture.database.run.mock.calls.some(([sql]) =>
        String(sql).includes("INSERT INTO oauth_refresh_tokens")
      )
    ).toBe(false);
  });

  it("rejects reused codes, wrong verifiers, and omitted redirect URIs", async () => {
    const reused = serviceFixture();
    reused.database.get.mockResolvedValue({
      ...authorizationCodeRow(true),
      used_at: new Date().toISOString(),
    });
    await expect(
      reused.service.exchange({
        grant_type: "authorization_code",
        client_id: clientId,
        resource,
        code: "mim_oac_code",
        code_verifier: verifier,
        redirect_uri: redirectUri,
      })
    ).rejects.toMatchObject({ code: "invalid_grant" });

    const replay = serviceFixture();
    replay.database.get.mockResolvedValue({
      ...authorizationCodeRow(true),
      used_at: new Date().toISOString(),
      token_family_id: "family-1",
    });
    await expect(
      replay.service.exchange({
        grant_type: "authorization_code",
        client_id: clientId,
        resource,
        code: "mim_oac_code",
        code_verifier: verifier,
        redirect_uri: redirectUri,
      })
    ).rejects.toMatchObject({ code: "invalid_grant" });
    expect(replay.database.run).toHaveBeenCalledWith(
      expect.stringContaining("UPDATE oauth_access_tokens SET revoked_at"),
      expect.any(String),
      "family-1"
    );

    const wrongVerifier = serviceFixture();
    wrongVerifier.database.get.mockResolvedValue(authorizationCodeRow(true));
    await expect(
      wrongVerifier.service.exchange({
        grant_type: "authorization_code",
        client_id: clientId,
        resource,
        code: "mim_oac_code",
        code_verifier: "b".repeat(64),
        redirect_uri: redirectUri,
      })
    ).rejects.toMatchObject({ code: "invalid_grant" });

    const omittedRedirect = serviceFixture();
    await expect(
      omittedRedirect.service.exchange({
        grant_type: "authorization_code",
        client_id: clientId,
        resource,
        code: "mim_oac_code",
        code_verifier: verifier,
      })
    ).rejects.toMatchObject({ code: "invalid_request" });
  });

  it("rotates refresh tokens and revokes the entire family on replay", async () => {
    const rotation = serviceFixture();
    rotation.database.get.mockResolvedValue(refreshTokenRow(null));
    const rotated = await rotation.service.exchange({
      grant_type: "refresh_token",
      client_id: clientId,
      resource,
      refresh_token: "mim_ort_current",
    });
    expect(rotated).toMatchObject({
      access_token: expect.stringMatching(/^mim_oat_/),
      refresh_token: expect.stringMatching(/^mim_ort_/),
    });
    expect(rotation.database.run).toHaveBeenCalledWith(
      "UPDATE oauth_refresh_tokens SET consumed_at = ? WHERE id = ?",
      expect.any(String),
      "refresh-1"
    );

    const replay = serviceFixture();
    replay.database.get.mockResolvedValue(refreshTokenRow(new Date().toISOString()));
    await expect(
      replay.service.exchange({
        grant_type: "refresh_token",
        client_id: clientId,
        resource,
        refresh_token: "mim_ort_replayed",
      })
    ).rejects.toMatchObject({ code: "invalid_grant" });
    expect(replay.database.run).toHaveBeenCalledWith(
      expect.stringContaining("UPDATE oauth_refresh_tokens SET revoked_at"),
      expect.any(String),
      "family-1"
    );
    expect(replay.database.run).toHaveBeenCalledWith(
      expect.stringContaining("UPDATE oauth_access_tokens SET revoked_at"),
      expect.any(String),
      "family-1"
    );
  });

  it("rejects refresh grants after the user's token version changes", async () => {
    const fixture = serviceFixture();
    fixture.database.get.mockResolvedValue({
      ...refreshTokenRow(null),
      current_token_version: sessionUser.tokenVersion + 1,
    });

    await expect(
      fixture.service.exchange({
        grant_type: "refresh_token",
        client_id: clientId,
        resource,
        refresh_token: "mim_ort_invalidated",
      })
    ).rejects.toMatchObject({ code: "invalid_grant" });
    expect(
      fixture.database.run.mock.calls.some(([sql]) =>
        String(sql).includes("INSERT INTO oauth_access_tokens")
      )
    ).toBe(false);
  });

  it("authenticates only active tokens for the canonical MCP audience", async () => {
    const fixture = serviceFixture();
    fixture.database.get.mockResolvedValue({
      id: sessionUser.id,
      email: sessionUser.email,
      name: sessionUser.name,
      password_hash: "hash",
      token_version: sessionUser.tokenVersion,
      is_global_admin: true,
      acknowledged_tour_ids: [],
      disabled_at: null,
      last_signed_in_at: null,
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
      oauth_access_token_id: "access-1",
      client_id: clientId,
      scopes: "mcp:read",
      resource,
      expires_at: new Date(Date.now() + 60_000).toISOString(),
      last_used_at: null,
    });

    await expect(fixture.service.authenticateAccessToken("mim_oat_valid")).resolves.toEqual({
      user: { ...sessionUser, authMethod: "oauth" },
      credential: {
        type: "oauth",
        id: "access-1",
        clientId,
        scopes: ["mcp:read"],
        resource,
        expiresAt: expect.any(String),
      },
    });
    expect(fixture.database.get).toHaveBeenCalledWith(
      expect.stringMatching(
        /oat\.resource = \?.*oat\.user_token_version = u\.token_version.*u\.disabled_at IS NULL/s
      ),
      hashSecret("mim_oat_valid"),
      resource,
      expect.any(String)
    );
    await expect(fixture.service.authenticateAccessToken("mim_pat_wrong-kind")).resolves.toBeNull();
  });

  it("revokes the grant family when presented with one of its access tokens", async () => {
    const fixture = serviceFixture();
    fixture.database.get.mockResolvedValue({ refresh_family_id: "family-1" });

    await fixture.service.revoke({
      token: "mim_oat_valid",
      client_id: clientId,
      token_type_hint: "access_token",
    });

    expect(fixture.database.get).toHaveBeenCalledWith(
      expect.stringContaining("SELECT refresh_family_id"),
      hashSecret("mim_oat_valid"),
      clientId
    );
    expect(fixture.database.run).toHaveBeenCalledTimes(2);
    expect(fixture.database.transaction).toHaveBeenCalledTimes(1);
  });
});

const sessionUser: AuthenticatedUser = {
  id: "user-1",
  email: "user@example.com",
  name: "User",
  tokenVersion: 4,
  isGlobalAdmin: true,
  authMethod: "session",
};

function serviceFixture(metadataOverrides: Partial<OAuthClientMetadata> = {}) {
  const database = {
    get: vi.fn(),
    run: vi.fn(async (..._parameters: unknown[]) => ({ changes: 1 })),
    transaction: vi.fn(async (action: () => unknown) => action()),
  };
  const metadata: OAuthClientMetadata = {
    clientId,
    clientName: "Operations assistant",
    redirectUris: [redirectUri],
    allowRefresh: true,
    ...metadataOverrides,
  };
  const clients = { resolve: vi.fn(async () => metadata) };
  const audit = { record: vi.fn(async () => undefined) };
  return {
    service: new OAuthService(
      database as unknown as DatabaseService,
      clients as unknown as OAuthClientMetadataService,
      audit as unknown as AuditService
    ),
    database,
    clients,
    audit,
  };
}

function authorizationCodeRow(allowRefresh: boolean) {
  return {
    id: "code-1",
    user_id: sessionUser.id,
    user_token_version: sessionUser.tokenVersion,
    current_token_version: sessionUser.tokenVersion,
    disabled_at: null,
    client_id: clientId,
    redirect_uri: redirectUri,
    scopes: "mcp:read mcp:write",
    resource,
    code_challenge: challenge,
    allow_refresh: allowRefresh,
    expires_at: new Date(Date.now() + 60_000).toISOString(),
    used_at: null,
    token_family_id: null,
  };
}

function refreshTokenRow(consumedAt: string | null) {
  return {
    id: "refresh-1",
    family_id: "family-1",
    user_id: sessionUser.id,
    user_token_version: sessionUser.tokenVersion,
    current_token_version: sessionUser.tokenVersion,
    disabled_at: null,
    client_id: clientId,
    scopes: "mcp:read mcp:write",
    resource,
    expires_at: new Date(Date.now() + 60_000).toISOString(),
    consumed_at: consumedAt,
    revoked_at: null,
  };
}
