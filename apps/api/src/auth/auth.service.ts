import {
  ConflictException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import {
  termsVersion,
  type AuthSession,
  type TeamSummary,
  type UserSummary,
} from "@mimorii/contracts";
import { randomUUID } from "node:crypto";
import { AuditService } from "../common/audit.service.js";
import { hashPassword, verifyPassword } from "../common/crypto.js";
import type { AuthenticatedUser, UserRow } from "../common/rows.js";
import { DatabaseService } from "../database/database.service.js";
import { PlatformSettingsService } from "../platform-settings/platform-settings.service.js";
import type { ChangePasswordDto, LoginDto, RegisterDto, UpdateProfileDto } from "./auth.dto.js";

const SESSION_SECONDS = 12 * 60 * 60;

interface TeamRow {
  id: string;
  name: string;
  role: TeamSummary["role"];
  created_at: string;
}

interface UserProfileRow {
  created_at: string;
  acknowledged_tour_ids: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly database: DatabaseService,
    private readonly jwt: JwtService,
    private readonly audit: AuditService,
    private readonly settings: PlatformSettingsService
  ) {}

  async register(input: RegisterDto): Promise<AuthSession> {
    if (!(await this.settings.registrationEnabled())) {
      throw new ForbiddenException("Registration is closed");
    }
    const email = input.email.trim().toLowerCase();
    const now = new Date().toISOString();
    const userId = randomUUID();
    const teamId = randomUUID();
    const name = input.name.trim();
    const passwordHash = await hashPassword(input.password);

    await this.database.transaction(async () => {
      const inserted = await this.database.run(
        `INSERT INTO users
         (id, email, name, password_hash, terms_version, terms_accepted_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT DO NOTHING`,
        userId,
        email,
        name,
        passwordHash,
        termsVersion,
        now,
        now,
        now
      );
      if (inserted.changes === 0) {
        throw new ConflictException("An account already uses this email");
      }
      await this.database.run(
        `INSERT INTO teams (id, name, created_by, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?)`,
        teamId,
        `${name}'s team`,
        userId,
        now,
        now
      );
      await this.database.run(
        "INSERT INTO team_members (team_id, user_id, role, joined_at) VALUES (?, ?, 'owner', ?)",
        teamId,
        userId,
        now
      );
    });

    await this.audit.record({
      teamId,
      userId,
      action: "account.registered",
      subjectType: "user",
      subjectId: userId,
      metadata: { termsVersion },
    });
    return this.createSession({
      id: userId,
      email,
      name,
      tokenVersion: 0,
      isGlobalAdmin: false,
      authMethod: "session",
    });
  }

  async login(input: LoginDto): Promise<AuthSession> {
    const email = input.email.trim().toLowerCase();
    const user = await this.database.get<UserRow>("SELECT * FROM users WHERE email = ?", email);
    if (!user || !(await verifyPassword(input.password, user.password_hash)) || user.disabled_at) {
      throw new UnauthorizedException("Email or password is incorrect");
    }
    const signedInAt = new Date().toISOString();
    await this.database.run(
      "UPDATE users SET last_signed_in_at = ?, updated_at = ? WHERE id = ?",
      signedInAt,
      signedInAt,
      user.id
    );
    await this.audit.record({
      userId: user.id,
      action: "account.signed_in",
      subjectType: "user",
      subjectId: user.id,
    });
    return this.createSession({
      id: user.id,
      email: user.email,
      name: user.name,
      tokenVersion: user.token_version,
      isGlobalAdmin: user.is_global_admin,
      authMethod: "session",
    });
  }

  async current(user: AuthenticatedUser): Promise<{ user: UserSummary; teams: TeamSummary[] }> {
    return { user: await this.userSummary(user), teams: await this.listTeams(user.id) };
  }

  async updateProfile(user: AuthenticatedUser, input: UpdateProfileDto): Promise<UserSummary> {
    const name = input.name.trim();
    const updatedAt = new Date().toISOString();
    await this.database.run(
      "UPDATE users SET name = ?, updated_at = ? WHERE id = ?",
      name,
      updatedAt,
      user.id
    );
    await this.audit.record({
      userId: user.id,
      action: "account.profile_updated",
      subjectType: "user",
      subjectId: user.id,
    });
    return this.userSummary({ ...user, name });
  }

  async acknowledgeTour(user: AuthenticatedUser, tourId: string): Promise<UserSummary> {
    const acknowledgedAt = new Date().toISOString();
    await this.database.run(
      `UPDATE users
       SET acknowledged_tour_ids = acknowledged_tour_ids || jsonb_build_array(CAST(? AS TEXT)),
           updated_at = ?
       WHERE id = ?
       AND NOT acknowledged_tour_ids @> jsonb_build_array(CAST(? AS TEXT))`,
      tourId,
      acknowledgedAt,
      user.id,
      tourId
    );
    return this.userSummary(user);
  }

  async changePassword(user: AuthenticatedUser, input: ChangePasswordDto): Promise<void> {
    const row = await this.database.get<UserRow>("SELECT * FROM users WHERE id = ?", user.id);
    if (!row || !(await verifyPassword(input.currentPassword, row.password_hash))) {
      throw new UnauthorizedException("Current password is incorrect");
    }
    const passwordHash = await hashPassword(input.newPassword);
    await this.database.run(
      `UPDATE users SET password_hash = ?, token_version = token_version + 1, updated_at = ? WHERE id = ?`,
      passwordHash,
      new Date().toISOString(),
      user.id
    );
    await this.audit.record({
      userId: user.id,
      action: "account.password_changed",
      subjectType: "user",
      subjectId: user.id,
    });
  }

  private async createSession(user: AuthenticatedUser): Promise<AuthSession> {
    const accessToken = await this.jwt.signAsync(
      { sub: user.id, v: user.tokenVersion },
      { expiresIn: SESSION_SECONDS }
    );
    return {
      accessToken,
      expiresAt: new Date(Date.now() + SESSION_SECONDS * 1000).toISOString(),
      user: await this.userSummary(user),
      teams: await this.listTeams(user.id),
    };
  }

  private async listTeams(userId: string): Promise<TeamSummary[]> {
    const rows = await this.database.all<TeamRow>(
      `SELECT t.id, t.name, m.role, t.created_at
       FROM teams t JOIN team_members m ON m.team_id = t.id
       WHERE m.user_id = ? ORDER BY LOWER(t.name)`,
      userId
    );
    return rows.map((team) => ({
      id: team.id,
      name: team.name,
      role: team.role,
      createdAt: team.created_at,
    }));
  }

  private async userSummary(user: AuthenticatedUser): Promise<UserSummary> {
    const profile = await this.database.get<UserProfileRow>(
      `SELECT created_at, acknowledged_tour_ids::TEXT AS acknowledged_tour_ids
       FROM users WHERE id = ?`,
      user.id
    );
    if (!profile) throw new UnauthorizedException("Account no longer exists");
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      isGlobalAdmin: user.isGlobalAdmin,
      acknowledgedTourIds: parseAcknowledgedTourIds(profile.acknowledged_tour_ids),
      createdAt: profile.created_at,
    };
  }
}

function parseAcknowledgedTourIds(value: string): string[] {
  const parsed: unknown = JSON.parse(value);
  if (!Array.isArray(parsed)) throw new Error("Stored tour acknowledgements are invalid");
  const tourIds: string[] = [];
  for (const tourId of parsed) {
    if (typeof tourId !== "string") throw new Error("Stored tour acknowledgements are invalid");
    tourIds.push(tourId);
  }
  return tourIds;
}
