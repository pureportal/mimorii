import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import type { Request } from "express";
import type { AuthenticatedUser, UserRow } from "../common/rows.js";
import { hashSecret } from "../common/crypto.js";
import { DatabaseService } from "../database/database.service.js";
import type { AuthenticatedRequest } from "./current-user.decorator.js";

interface TokenPayload {
  sub: string;
  v: number;
}

interface ApiTokenUserRow extends UserRow {
  api_token_id: string;
  last_used_at: string | null;
}

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly database: DatabaseService
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const token = this.readToken(request);
    if (!token) throw new UnauthorizedException("Sign in required");

    if (token.startsWith("mim_pat_")) {
      const now = new Date().toISOString();
      const user = await this.database.get<ApiTokenUserRow>(
        `SELECT u.*, at.id AS api_token_id, at.last_used_at FROM api_tokens at
         JOIN users u ON u.id = at.user_id
         WHERE at.token_hash = ?
         AND u.disabled_at IS NULL
         AND (at.expires_at IS NULL OR at.expires_at > ?)`,
        hashSecret(token),
        now
      );
      if (!user) throw new UnauthorizedException("API token is expired or revoked");
      if (!user.last_used_at || new Date(user.last_used_at).getTime() < Date.now() - 5 * 60_000) {
        await this.database.run(
          "UPDATE api_tokens SET last_used_at = ? WHERE id = ?",
          now,
          user.api_token_id
        );
      }
      (request as AuthenticatedRequest).user = this.authenticatedUser(user, "apiToken");
      return true;
    }

    let payload: TokenPayload;
    try {
      payload = await this.jwt.verifyAsync<TokenPayload>(token);
    } catch {
      throw new UnauthorizedException("Session expired");
    }

    const user = await this.database.get<UserRow>("SELECT * FROM users WHERE id = ?", payload.sub);
    if (!user || user.disabled_at || user.token_version !== payload.v)
      throw new UnauthorizedException("Session expired");

    (request as AuthenticatedRequest).user = this.authenticatedUser(user, "session");
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

  private readToken(request: Request): string | undefined {
    const authorization = request.headers.authorization;
    if (!authorization?.startsWith("Bearer ")) return undefined;
    return authorization.slice(7).trim() || undefined;
  }
}
