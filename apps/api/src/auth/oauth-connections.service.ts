import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import type { OAuthConnectionSummary } from "@mimorii/contracts";
import { AuditService } from "../common/audit.service.js";
import type { AuthenticatedUser } from "../common/rows.js";
import { DatabaseService } from "../database/database.service.js";
import { clientPublisherHost } from "./oauth-client-metadata.service.js";
import { mcpScopes } from "./oauth-config.js";
import { revokeOAuthGrant } from "./oauth-grants.js";

interface GrantRow {
  id: string;
  client_id: string;
  client_name: string;
  scopes: string;
  created_at: string;
  last_used_at: string | null;
}

@Injectable()
export class OAuthConnectionsService {
  constructor(
    private readonly database: DatabaseService,
    private readonly audit: AuditService
  ) {}

  async list(user: AuthenticatedUser): Promise<OAuthConnectionSummary[]> {
    requireBrowserSession(user);
    const now = new Date().toISOString();
    const rows = await this.database.all<GrantRow>(
      `SELECT g.id, g.client_id, g.client_name, g.scopes, g.created_at, g.last_used_at
       FROM oauth_grants g JOIN users u ON u.id = g.user_id
       WHERE g.user_id = ? AND g.revoked_at IS NULL AND (
         EXISTS (
           SELECT 1 FROM oauth_refresh_tokens r
           WHERE r.family_id = g.id AND r.revoked_at IS NULL AND r.consumed_at IS NULL
             AND r.expires_at > ? AND r.user_token_version = u.token_version
         ) OR EXISTS (
           SELECT 1 FROM oauth_access_tokens a
           WHERE a.refresh_family_id = g.id AND a.revoked_at IS NULL
             AND a.expires_at > ? AND a.user_token_version = u.token_version
         )
       )
       ORDER BY COALESCE(g.last_used_at, g.created_at) DESC, g.id`,
      user.id,
      now,
      now
    );
    return rows.map((row) => ({
      id: row.id,
      clientName: row.client_name,
      clientHost: clientPublisherHost(row.client_id),
      scopes: mcpScopes.filter((scope) => row.scopes.split(" ").includes(scope)),
      connectedAt: new Date(row.created_at).toISOString(),
      lastUsedAt: row.last_used_at ? new Date(row.last_used_at).toISOString() : null,
    }));
  }

  async disconnect(user: AuthenticatedUser, id: string): Promise<void> {
    requireBrowserSession(user);
    const grant = await this.database.get<{ client_id: string }>(
      "SELECT client_id FROM oauth_grants WHERE id = ? AND user_id = ? AND revoked_at IS NULL",
      id,
      user.id
    );
    if (!grant) throw new NotFoundException("Connected app not found");
    await this.database.transaction(() =>
      revokeOAuthGrant(this.database, id, new Date().toISOString())
    );
    await this.audit.record({
      userId: user.id,
      action: "oauth.client_disconnected",
      subjectType: "oauth_client",
      subjectId: id,
      metadata: { clientId: grant.client_id },
    });
  }
}

function requireBrowserSession(user: AuthenticatedUser): void {
  if (user.authMethod !== "session") throw new ForbiddenException("Browser sign-in is required");
}
