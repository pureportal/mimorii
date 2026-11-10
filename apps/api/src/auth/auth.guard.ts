import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { JwtService } from "@nestjs/jwt";
import type { ApiTokenAccess, TeamRole } from "@mimorii/contracts";
import type { Request } from "express";
import type { AuthenticatedUser, UserRow } from "../common/rows.js";
import { hashSecret } from "../common/crypto.js";
import { DatabaseService } from "../database/database.service.js";
import { apiTokenWithoutTeamKey } from "./api-token-scope.js";
import type { AuthenticatedRequest } from "./current-user.decorator.js";
import { readBearerToken } from "./bearer-token.js";

interface TokenPayload {
  sub: string;
  v: number;
  sid: string;
}

interface ApiTokenUserRow extends UserRow {
  api_token_id: string;
  access: ApiTokenAccess;
  team_roles: Record<string, TeamRole>;
  last_used_at: string | null;
}

const readOnlyMethods = new Set(["GET", "HEAD"]);

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly database: DatabaseService,
    private readonly reflector: Reflector
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const token = readBearerToken(request);
    if (!token) throw new UnauthorizedException("Sign in required");
    if (token.startsWith("mim_oat_")) {
      throw new UnauthorizedException("MCP OAuth tokens cannot access the REST API");
    }
    if (token.startsWith("mim_pat_")) return this.authenticateApiToken(context, request, token);

    let payload: TokenPayload;
    try {
      payload = await this.jwt.verifyAsync<TokenPayload>(token);
    } catch {
      throw new UnauthorizedException("Session expired");
    }

    if (
      typeof payload.sub !== "string" ||
      typeof payload.v !== "number" ||
      typeof payload.sid !== "string"
    ) {
      throw new UnauthorizedException("Session expired");
    }

    const user = await this.database.get<UserRow>(
      `SELECT u.* FROM users u
       JOIN user_sessions s ON s.user_id = u.id
       WHERE u.id = ? AND s.id = ? AND s.expires_at > ?
       AND s.user_token_version = u.token_version`,
      payload.sub,
      payload.sid,
      new Date().toISOString()
    );
    if (!user || user.disabled_at || user.token_version !== payload.v)
      throw new UnauthorizedException("Session expired");

    (request as AuthenticatedRequest).user = this.authenticatedUser(user, "session");
    return true;
  }

  private async authenticateApiToken(
    context: ExecutionContext,
    request: Request,
    token: string
  ): Promise<true> {
    const now = new Date().toISOString();
    const row = await this.database.get<ApiTokenUserRow>(
      `SELECT u.*, at.id AS api_token_id, at.access, at.last_used_at,
         COALESCE(
           json_object_agg(att.team_id, att.role) FILTER (WHERE att.team_id IS NOT NULL),
           '{}'::json
         ) AS team_roles
       FROM api_tokens at
       JOIN users u ON u.id = at.user_id
       LEFT JOIN api_token_teams att ON att.api_token_id = at.id
       WHERE at.token_hash = ?
       AND u.disabled_at IS NULL
       AND (at.expires_at IS NULL OR at.expires_at > ?)
       GROUP BY u.id, at.id`,
      hashSecret(token),
      now
    );
    if (!row) throw new UnauthorizedException("API token is expired or revoked");

    const teamRoles = new Map(Object.entries(row.team_roles));
    if (row.access === "read" && !readOnlyMethods.has(request.method)) {
      throw new ForbiddenException("API token is read-only");
    }
    const { teamId } = request.params;
    if (typeof teamId === "string") {
      if (!teamRoles.has(teamId)) throw new ForbiddenException("API token cannot access this team");
    } else if (
      !this.reflector.get<boolean | undefined>(apiTokenWithoutTeamKey, context.getHandler())
    ) {
      throw new ForbiddenException("API tokens cannot access this endpoint");
    }

    if (!row.last_used_at || new Date(row.last_used_at).getTime() < Date.now() - 5 * 60_000) {
      await this.database.run(
        "UPDATE api_tokens SET last_used_at = ? WHERE id = ?",
        now,
        row.api_token_id
      );
    }
    const authenticatedRequest = request as AuthenticatedRequest;
    authenticatedRequest.user = this.authenticatedUser(row, "apiToken");
    authenticatedRequest.authCredential = {
      type: "apiToken",
      id: row.api_token_id,
      access: row.access,
      teamRoles,
    };
    return true;
  }

  private authenticatedUser(
    user: UserRow,
    authMethod: AuthenticatedUser["authMethod"]
  ): AuthenticatedUser {
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      tokenVersion: user.token_version,
      isGlobalAdmin: user.is_global_admin,
      authMethod,
    };
  }
}
