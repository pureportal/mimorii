import { Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { randomUUID } from "node:crypto";
import { createSecret, hashSecret } from "../common/crypto.js";
import type { AuthenticatedUser, UserRow } from "../common/rows.js";
import { DatabaseService } from "../database/database.service.js";

const ACCESS_TOKEN_LIFETIME_SECONDS = 60 * 60;
const SESSION_LEASE_MILLISECONDS = 30 * 86_400_000;

export interface SessionCredentials {
  accessToken: string;
  expiresAt: string;
  refreshToken: string;
  refreshExpiresAt: string;
}

export interface RefreshedSession {
  credentials: SessionCredentials;
  user: AuthenticatedUser;
}

interface SessionUserRow extends UserRow {
  session_id: string;
  session_token_version: number;
  session_expires_at: string;
}

@Injectable()
export class SessionService {
  constructor(
    private readonly database: DatabaseService,
    private readonly jwt: JwtService
  ) {}

  async create(user: AuthenticatedUser): Promise<SessionCredentials> {
    const now = new Date();
    const sessionId = randomUUID();
    const refreshToken = createSecret("mim_srt");
    const refreshExpiresAt = new Date(now.getTime() + SESSION_LEASE_MILLISECONDS).toISOString();
    await this.database.run(
      `INSERT INTO user_sessions
       (id, token_hash, user_id, user_token_version, expires_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      sessionId,
      hashSecret(refreshToken),
      user.id,
      user.tokenVersion,
      refreshExpiresAt,
      now.toISOString()
    );
    return this.credentials(user, sessionId, refreshToken, refreshExpiresAt, now);
  }

  async refresh(refreshToken: string): Promise<RefreshedSession> {
    return this.database.transaction(async () => {
      const now = new Date();
      const row = await this.database.get<SessionUserRow>(
        `SELECT u.*, s.id AS session_id,
         s.user_token_version AS session_token_version,
         s.expires_at AS session_expires_at
         FROM user_sessions s
         JOIN users u ON u.id = s.user_id
         WHERE s.token_hash = ? FOR UPDATE`,
        hashSecret(refreshToken)
      );
      if (
        !row ||
        row.disabled_at ||
        row.session_token_version !== row.token_version ||
        new Date(row.session_expires_at).getTime() <= now.getTime()
      ) {
        throw new UnauthorizedException("Session expired");
      }

      const refreshExpiresAt = new Date(now.getTime() + SESSION_LEASE_MILLISECONDS).toISOString();
      const updated = await this.database.run(
        "UPDATE user_sessions SET expires_at = ?, last_refreshed_at = ? WHERE id = ?",
        refreshExpiresAt,
        now.toISOString(),
        row.session_id
      );
      if (updated.changes === 0) throw new UnauthorizedException("Session expired");

      const user = this.authenticatedUser(row);
      return {
        credentials: await this.credentials(
          user,
          row.session_id,
          refreshToken,
          refreshExpiresAt,
          now
        ),
        user,
      };
    });
  }

  async revoke(refreshToken: string): Promise<void> {
    await this.database.run(
      "DELETE FROM user_sessions WHERE token_hash = ?",
      hashSecret(refreshToken)
    );
  }

  private async credentials(
    user: AuthenticatedUser,
    sessionId: string,
    refreshToken: string,
    refreshExpiresAt: string,
    now: Date
  ): Promise<SessionCredentials> {
    const accessToken = await this.jwt.signAsync(
      { sub: user.id, v: user.tokenVersion, sid: sessionId },
      { expiresIn: ACCESS_TOKEN_LIFETIME_SECONDS }
    );
    return {
      accessToken,
      expiresAt: new Date(now.getTime() + ACCESS_TOKEN_LIFETIME_SECONDS * 1_000).toISOString(),
      refreshToken,
      refreshExpiresAt,
    };
  }

  private authenticatedUser(user: UserRow): AuthenticatedUser {
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      tokenVersion: user.token_version,
      isGlobalAdmin: user.is_global_admin,
      authMethod: "session",
    };
  }
}
