import { Injectable } from "@nestjs/common";
import type {
  OAuthAuthorizationDecisionResult,
  OAuthAuthorizationRequestSummary,
} from "@mimorii/contracts";
import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import { AuditService } from "../common/audit.service.js";
import { createSecret, hashSecret } from "../common/crypto.js";
import type { AuthenticatedUser, UserRow } from "../common/rows.js";
import { DatabaseService } from "../database/database.service.js";
import {
  isLoopbackHostname,
  OAuthClientMetadataService,
  redirectUriMatches,
} from "./oauth-client-metadata.service.js";
import { mcpResourceUrl, mcpScopes, oauthIssuer, type McpScope } from "./oauth-config.js";
import { OAuthException } from "./oauth-error.js";
import type {
  OAuthAuthorizationDecision,
  OAuthAuthorizationRequest,
  OAuthRevocationRequest,
  OAuthTokenRequest,
} from "./oauth-input.js";

const authorizationCodeLifetimeMs = 5 * 60_000;
const accessTokenLifetimeMs = 60 * 60_000;
const refreshTokenLifetimeMs = 30 * 86_400_000;
const mcpScopeSet: ReadonlySet<string> = new Set(mcpScopes);

interface AuthorizationCodeRow {
  id: string;
  user_id: string;
  user_token_version: number;
  current_token_version: number;
  disabled_at: string | null;
  client_id: string;
  redirect_uri: string;
  scopes: string;
  resource: string;
  code_challenge: string;
  allow_refresh: boolean;
  expires_at: string;
  used_at: string | null;
  token_family_id: string | null;
}

interface RefreshTokenRow {
  id: string;
  family_id: string;
  user_id: string;
  user_token_version: number;
  current_token_version: number;
  disabled_at: string | null;
  client_id: string;
  scopes: string;
  resource: string;
  expires_at: string;
  consumed_at: string | null;
  revoked_at: string | null;
}

interface AccessTokenUserRow extends UserRow {
  oauth_access_token_id: string;
  client_id: string;
  scopes: string;
  resource: string;
  expires_at: string;
  last_used_at: string | null;
}

interface ValidatedAuthorizationRequest {
  clientName: string;
  clientHost: string;
  redirectHost: string;
  redirectIsLoopback: boolean;
  scopes: McpScope[];
  allowRefresh: boolean;
}

export interface OAuthAccessTokenAuthentication {
  user: AuthenticatedUser;
  credential: {
    type: "oauth";
    id: string;
    clientId: string;
    scopes: McpScope[];
    resource: string;
    expiresAt: string;
  };
}

export interface OAuthTokenResponse {
  access_token: string;
  token_type: "Bearer";
  expires_in: number;
  refresh_token?: string;
  scope: string;
}

@Injectable()
export class OAuthService {
  constructor(
    private readonly database: DatabaseService,
    private readonly clients: OAuthClientMetadataService,
    private readonly audit: AuditService
  ) {}

  async authorizationRequest(
    input: OAuthAuthorizationRequest
  ): Promise<OAuthAuthorizationRequestSummary> {
    const validated = await this.validateAuthorizationRequest(input);
    return {
      clientName: validated.clientName,
      clientHost: validated.clientHost,
      redirectHost: validated.redirectHost,
      redirectIsLoopback: validated.redirectIsLoopback,
      refreshAccess: validated.allowRefresh,
      scopes: validated.scopes,
    };
  }

  async decideAuthorization(
    user: AuthenticatedUser,
    decision: OAuthAuthorizationDecision
  ): Promise<OAuthAuthorizationDecisionResult> {
    if (user.authMethod !== "session") {
      throw new OAuthException("access_denied", "Browser sign-in is required", 403);
    }
    const validated = await this.validateAuthorizationRequest(decision);
    if (decision.decision === "deny") {
      return {
        redirectUri: authorizationRedirect(decision.redirect_uri, {
          error: "access_denied",
          state: decision.state,
          iss: oauthIssuer(),
        }),
      };
    }

    const code = createSecret("mim_oac");
    const id = randomUUID();
    const createdAt = new Date().toISOString();
    await this.database.transaction(async () => {
      await this.removeExpiredTokens(createdAt);
      await this.database.run(
        `INSERT INTO oauth_authorization_codes
         (id, code_hash, user_id, user_token_version, client_id, redirect_uri, scopes,
          resource, code_challenge, allow_refresh, expires_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        id,
        hashSecret(code),
        user.id,
        user.tokenVersion,
        decision.client_id,
        decision.redirect_uri,
        validated.scopes.join(" "),
        mcpResourceUrl().href,
        decision.code_challenge,
        validated.allowRefresh,
        new Date(new Date(createdAt).getTime() + authorizationCodeLifetimeMs).toISOString(),
        createdAt
      );
    });
    await this.audit.record({
      userId: user.id,
      action: "oauth.client_authorized",
      subjectType: "oauth_client",
      subjectId: id,
      metadata: { clientId: decision.client_id, scopes: validated.scopes },
    });
    return {
      redirectUri: authorizationRedirect(decision.redirect_uri, {
        code,
        state: decision.state,
        iss: oauthIssuer(),
      }),
    };
  }

  async exchange(input: OAuthTokenRequest): Promise<OAuthTokenResponse> {
    if (input.grant_type === "authorization_code") return this.exchangeCode(input);
    if (input.grant_type === "refresh_token") return this.exchangeRefreshToken(input);
    throw new OAuthException("unsupported_grant_type", "OAuth grant type is not supported");
  }

  async revoke(input: OAuthRevocationRequest): Promise<void> {
    await this.database.transaction(() => this.revokeToken(input));
  }

  private async revokeToken(input: OAuthRevocationRequest): Promise<void> {
    const tokenHash = hashSecret(input.token);
    if (input.token_type_hint !== "refresh_token") {
      const revoked = await this.revokeAccessToken(tokenHash, input.client_id);
      if (revoked) return;
    }
    const refresh = await this.database.get<{ family_id: string }>(
      `SELECT family_id FROM oauth_refresh_tokens
       WHERE token_hash = ? AND client_id = ?`,
      tokenHash,
      input.client_id
    );
    if (refresh) {
      await this.revokeFamily(refresh.family_id, new Date().toISOString());
      return;
    }
    if (input.token_type_hint === "refresh_token") {
      await this.revokeAccessToken(tokenHash, input.client_id);
    }
  }

  async authenticateAccessToken(token: string): Promise<OAuthAccessTokenAuthentication | null> {
    if (!token.startsWith("mim_oat_")) return null;
    const now = new Date().toISOString();
    const row = await this.database.get<AccessTokenUserRow>(
      `SELECT u.*, oat.id AS oauth_access_token_id, oat.client_id, oat.scopes, oat.resource,
       oat.expires_at, oat.last_used_at
       FROM oauth_access_tokens oat JOIN users u ON u.id = oat.user_id
       WHERE oat.token_hash = ? AND oat.resource = ? AND oat.expires_at > ?
       AND oat.revoked_at IS NULL AND oat.user_token_version = u.token_version
       AND u.disabled_at IS NULL`,
      hashSecret(token),
      mcpResourceUrl().href,
      now
    );
    if (!row) return null;
    if (!row.last_used_at || new Date(row.last_used_at).getTime() < Date.now() - 5 * 60_000) {
      await this.database.run(
        "UPDATE oauth_access_tokens SET last_used_at = ? WHERE id = ?",
        now,
        row.oauth_access_token_id
      );
    }
    return {
      user: {
        id: row.id,
        email: row.email,
        name: row.name,
        tokenVersion: row.token_version,
        isGlobalAdmin: row.is_global_admin,
        authMethod: "oauth",
      },
      credential: {
        type: "oauth",
        id: row.oauth_access_token_id,
        clientId: row.client_id,
        scopes: storedScopes(row.scopes),
        resource: row.resource,
        expiresAt: row.expires_at,
      },
    };
  }

  private async validateAuthorizationRequest(
    input: OAuthAuthorizationRequest
  ): Promise<ValidatedAuthorizationRequest> {
    canonicalMcpResource(input.resource);
    const scopes = requestedScopes(input.scope);
    const client = await this.clients.resolve(input.client_id);
    if (
      !client.redirectUris.some((redirectUri) =>
        redirectUriMatches(redirectUri, input.redirect_uri)
      )
    ) {
      throw new OAuthException("invalid_request", "OAuth redirect URI is not registered");
    }
    const redirect = new URL(input.redirect_uri);
    return {
      clientName: client.clientName,
      clientHost: new URL(client.clientId).hostname,
      redirectHost: redirect.host,
      redirectIsLoopback: isLoopbackHostname(redirect.hostname),
      scopes,
      allowRefresh: client.allowRefresh,
    };
  }

  private async exchangeCode(input: OAuthTokenRequest): Promise<OAuthTokenResponse> {
    const code = input.code;
    const verifier = input.code_verifier;
    if (!code || !verifier || !input.redirect_uri || input.refresh_token) {
      throw new OAuthException("invalid_request", "Authorization code request is incomplete");
    }
    const resource = canonicalMcpResource(input.resource);
    const now = new Date().toISOString();
    const outcome = await this.database.transaction(async () => {
      const row = await this.database.get<AuthorizationCodeRow>(
        `SELECT code.*, u.token_version AS current_token_version, u.disabled_at
         FROM oauth_authorization_codes code JOIN users u ON u.id = code.user_id
         WHERE code.code_hash = ? FOR UPDATE`,
        hashSecret(code)
      );
      if (
        !row ||
        row.disabled_at ||
        row.user_token_version !== row.current_token_version ||
        new Date(row.expires_at).getTime() <= Date.now() ||
        row.client_id !== input.client_id ||
        row.resource !== resource ||
        input.redirect_uri !== row.redirect_uri ||
        !pkceMatches(verifier, row.code_challenge)
      ) {
        throw new OAuthException("invalid_grant", "Authorization code is invalid or expired");
      }
      if (row.used_at) {
        if (row.token_family_id) await this.revokeFamily(row.token_family_id, now);
        return { error: "replayed" as const };
      }
      const familyId = randomUUID();
      await this.database.run(
        `UPDATE oauth_authorization_codes SET used_at = ?, token_family_id = ?
         WHERE id = ?`,
        now,
        familyId,
        row.id
      );
      return {
        tokens: await this.issueTokenSet({
          userId: row.user_id,
          userTokenVersion: row.user_token_version,
          clientId: row.client_id,
          scopes: storedScopes(row.scopes),
          resource: row.resource,
          familyId,
          includeRefreshToken: row.allow_refresh,
          now,
        }),
      };
    });
    if ("tokens" in outcome && outcome.tokens) return outcome.tokens;
    throw new OAuthException("invalid_grant", "Authorization code is invalid or expired");
  }

  private async exchangeRefreshToken(input: OAuthTokenRequest): Promise<OAuthTokenResponse> {
    const refreshToken = input.refresh_token;
    if (!refreshToken || input.code || input.code_verifier || input.redirect_uri) {
      throw new OAuthException("invalid_request", "Refresh token request is incomplete");
    }
    const resource = canonicalMcpResource(input.resource);
    const now = new Date().toISOString();
    const outcome = await this.database.transaction(async () => {
      const row = await this.database.get<RefreshTokenRow>(
        `SELECT refresh.*, u.token_version AS current_token_version, u.disabled_at
         FROM oauth_refresh_tokens refresh JOIN users u ON u.id = refresh.user_id
         WHERE refresh.token_hash = ? FOR UPDATE`,
        hashSecret(refreshToken)
      );
      if (!row) return { error: "invalid" as const };
      if (row.consumed_at) {
        await this.revokeFamily(row.family_id, now);
        return { error: "replayed" as const };
      }
      if (
        row.revoked_at ||
        row.disabled_at ||
        row.user_token_version !== row.current_token_version ||
        new Date(row.expires_at).getTime() <= Date.now() ||
        row.client_id !== input.client_id ||
        row.resource !== resource
      ) {
        return { error: "invalid" as const };
      }
      const grantedScopes = storedScopes(row.scopes);
      const scopes = input.scope ? requestedScopes(input.scope) : grantedScopes;
      if (!scopes.every((scope) => grantedScopes.includes(scope))) {
        return { error: "scope" as const };
      }
      await this.database.run(
        "UPDATE oauth_refresh_tokens SET consumed_at = ? WHERE id = ?",
        now,
        row.id
      );
      return {
        tokens: await this.issueTokenSet({
          userId: row.user_id,
          userTokenVersion: row.user_token_version,
          clientId: row.client_id,
          scopes,
          resource: row.resource,
          familyId: row.family_id,
          includeRefreshToken: true,
          now,
        }),
      };
    });
    if ("tokens" in outcome && outcome.tokens) return outcome.tokens;
    if (outcome.error === "scope") {
      throw new OAuthException("invalid_scope", "Requested scope exceeds the original grant");
    }
    throw new OAuthException("invalid_grant", "Refresh token is invalid or expired");
  }

  private async issueTokenSet(input: {
    userId: string;
    userTokenVersion: number;
    clientId: string;
    scopes: McpScope[];
    resource: string;
    familyId: string;
    includeRefreshToken: boolean;
    now: string;
  }): Promise<OAuthTokenResponse> {
    await this.removeExpiredTokens(input.now);
    const accessToken = createSecret("mim_oat");
    const accessTokenId = randomUUID();
    await this.database.run(
      `INSERT INTO oauth_access_tokens
       (id, token_hash, user_id, user_token_version, client_id, scopes, resource,
        refresh_family_id, expires_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      accessTokenId,
      hashSecret(accessToken),
      input.userId,
      input.userTokenVersion,
      input.clientId,
      input.scopes.join(" "),
      input.resource,
      input.familyId,
      new Date(new Date(input.now).getTime() + accessTokenLifetimeMs).toISOString(),
      input.now
    );
    const response: OAuthTokenResponse = {
      access_token: accessToken,
      token_type: "Bearer",
      expires_in: accessTokenLifetimeMs / 1_000,
      scope: input.scopes.join(" "),
    };
    if (!input.includeRefreshToken) return response;

    const refreshToken = createSecret("mim_ort");
    await this.database.run(
      `INSERT INTO oauth_refresh_tokens
       (id, family_id, token_hash, user_id, user_token_version, client_id, scopes,
        resource, expires_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      randomUUID(),
      input.familyId,
      hashSecret(refreshToken),
      input.userId,
      input.userTokenVersion,
      input.clientId,
      input.scopes.join(" "),
      input.resource,
      new Date(new Date(input.now).getTime() + refreshTokenLifetimeMs).toISOString(),
      input.now
    );
    return { ...response, refresh_token: refreshToken };
  }

  private async revokeAccessToken(tokenHash: string, clientId: string): Promise<boolean> {
    const token = await this.database.get<{ refresh_family_id: string }>(
      `SELECT refresh_family_id FROM oauth_access_tokens
       WHERE token_hash = ? AND client_id = ?`,
      tokenHash,
      clientId
    );
    if (!token) return false;
    await this.revokeFamily(token.refresh_family_id, new Date().toISOString());
    return true;
  }

  private async revokeFamily(familyId: string, revokedAt: string): Promise<void> {
    await this.database.run(
      `UPDATE oauth_refresh_tokens SET revoked_at = ?
       WHERE family_id = ? AND revoked_at IS NULL`,
      revokedAt,
      familyId
    );
    await this.database.run(
      `UPDATE oauth_access_tokens SET revoked_at = ?
       WHERE refresh_family_id = ? AND revoked_at IS NULL`,
      revokedAt,
      familyId
    );
  }

  private async removeExpiredTokens(now: string): Promise<void> {
    await this.database.run("DELETE FROM oauth_authorization_codes WHERE expires_at <= ?", now);
    await this.database.run("DELETE FROM oauth_access_tokens WHERE expires_at <= ?", now);
    await this.database.run("DELETE FROM oauth_refresh_tokens WHERE expires_at <= ?", now);
  }
}

function canonicalMcpResource(value: string): string {
  const canonicalResource = mcpResourceUrl().href;
  let requested: URL;
  try {
    requested = new URL(value);
  } catch {
    throw new OAuthException("invalid_request", "OAuth resource is invalid");
  }
  if (
    requested.username ||
    requested.password ||
    requested.search ||
    requested.hash ||
    requested.href !== canonicalResource
  ) {
    throw new OAuthException("invalid_request", "OAuth resource is invalid");
  }
  return canonicalResource;
}

function requestedScopes(value: string | undefined): McpScope[] {
  const scopes = [...new Set((value ?? "mcp:read").split(" "))];
  if (!scopes.includes("mcp:read") || scopes.some((scope) => !mcpScopeSet.has(scope))) {
    throw new OAuthException("invalid_scope", "OAuth scope is invalid");
  }
  return mcpScopes.filter((scope) => scopes.includes(scope));
}

function storedScopes(value: string): McpScope[] {
  const scopes = value.split(" ");
  if (!scopes.includes("mcp:read") || scopes.some((scope) => !mcpScopeSet.has(scope))) {
    throw new Error("Stored OAuth scopes are invalid");
  }
  return mcpScopes.filter((scope) => scopes.includes(scope));
}

function pkceChallenge(verifier: string): string {
  return createHash("sha256").update(verifier).digest("base64url");
}

function pkceMatches(verifier: string, expectedChallenge: string): boolean {
  const actual = Buffer.from(pkceChallenge(verifier));
  const expected = Buffer.from(expectedChallenge);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function authorizationRedirect(
  redirectUri: string,
  parameters: Record<string, string | undefined>
): string {
  const query = new URLSearchParams();
  for (const [name, value] of Object.entries(parameters)) {
    if (value !== undefined) query.set(name, value);
  }
  return `${redirectUri}${redirectUri.includes("?") ? "&" : "?"}${query}`;
}
