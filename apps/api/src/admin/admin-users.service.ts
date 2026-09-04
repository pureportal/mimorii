import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { GlobalAdminUserSummary, GlobalAdminUsersPage } from "@mimorii/contracts";
import { AuditService } from "../common/audit.service.js";
import type { AuthenticatedUser } from "../common/rows.js";
import { DatabaseService } from "../database/database.service.js";
import type { UpdateGlobalUserAccessDto } from "./admin.dto.js";

interface AdminUserRow {
  id: string;
  email: string;
  name: string;
  is_global_admin: boolean;
  disabled_at: string | null;
  last_signed_in_at: string | null;
  team_count: number;
  api_token_count: number;
  created_at: string;
  updated_at: string;
}

interface AccessRow {
  id: string;
  is_global_admin: boolean;
  disabled_at: string | null;
}

const userStatuses = new Set(["all", "enabled", "disabled", "administrators"]);

@Injectable()
export class AdminUsersService {
  constructor(
    private readonly database: DatabaseService,
    private readonly audit: AuditService
  ) {}

  async list(options: {
    search?: string;
    status?: string;
    limit?: string;
    offset?: string;
  }): Promise<GlobalAdminUsersPage> {
    const search = options.search?.trim() ?? "";
    if (search.length > 100) throw new BadRequestException("Search is too long");
    const status = options.status ?? "all";
    if (!userStatuses.has(status)) throw new BadRequestException("Account status is invalid");
    const limit = this.boundedInteger(options.limit, 50, 1, 100, "Limit");
    const offset = this.boundedInteger(options.offset, 0, 0, 1_000_000, "Offset");
    const clauses: string[] = [];
    const parameters: Array<string | number> = [];
    if (search) {
      clauses.push("(u.name ILIKE ? OR u.email ILIKE ?)");
      parameters.push(`%${search}%`, `%${search}%`);
    }
    if (status === "enabled") clauses.push("u.disabled_at IS NULL");
    if (status === "disabled") clauses.push("u.disabled_at IS NOT NULL");
    if (status === "administrators") clauses.push("u.is_global_admin = TRUE");
    const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
    const total = (await this.database.get<{ count: number }>(
      `SELECT COUNT(*) AS count FROM users u ${where}`,
      ...parameters
    ))!.count;
    const rows = await this.database.all<AdminUserRow>(
      `SELECT u.id, u.email, u.name, u.is_global_admin, u.disabled_at,
       u.last_signed_in_at, u.created_at, u.updated_at,
       COUNT(DISTINCT tm.team_id) AS team_count,
       COUNT(DISTINCT at.id) AS api_token_count
       FROM users u
       LEFT JOIN team_members tm ON tm.user_id = u.id
       LEFT JOIN api_tokens at ON at.user_id = u.id
       ${where}
       GROUP BY u.id
       ORDER BY LOWER(u.name), LOWER(u.email), u.id
       LIMIT ? OFFSET ?`,
      ...parameters,
      limit,
      offset
    );
    return { users: rows.map((row) => this.map(row)), total, limit, offset };
  }

  async updateAccess(
    actor: AuthenticatedUser,
    targetId: string,
    input: UpdateGlobalUserAccessDto
  ): Promise<GlobalAdminUserSummary> {
    await this.database.transaction(async () => {
      await this.database.get(
        "SELECT pg_advisory_xact_lock(hashtext(?))",
        "mimorii:global-admin-access"
      );
      const target = await this.database.get<AccessRow>(
        "SELECT id, is_global_admin, disabled_at FROM users WHERE id = ? FOR UPDATE",
        targetId
      );
      if (!target) throw new NotFoundException("User not found");
      const disabled = target.disabled_at !== null;
      if (
        target.is_global_admin !== input.expectedIsGlobalAdmin ||
        disabled !== input.expectedDisabled
      ) {
        throw new ConflictException("Account access changed; reload and try again");
      }
      if (target.is_global_admin === input.isGlobalAdmin && disabled === input.disabled) {
        throw new BadRequestException("Account access is unchanged");
      }
      if (target.id === actor.id && (!input.isGlobalAdmin || input.disabled)) {
        throw new ForbiddenException("You cannot remove your own administrator access");
      }
      if (
        target.is_global_admin &&
        !disabled &&
        (!input.isGlobalAdmin || input.disabled) &&
        (await this.activeAdministratorCount()) === 1
      ) {
        throw new BadRequestException("At least one enabled Global Administrator is required");
      }
      const now = new Date().toISOString();
      await this.database.run(
        `UPDATE users SET is_global_admin = ?, disabled_at = ?,
         token_version = token_version + 1, updated_at = ? WHERE id = ?`,
        input.isGlobalAdmin,
        input.disabled ? now : null,
        now,
        target.id
      );
      await this.database.run("DELETE FROM user_sessions WHERE user_id = ?", target.id);
      if (input.disabled) {
        await this.database.run("DELETE FROM api_tokens WHERE user_id = ?", target.id);
      }
      await this.audit.record({
        userId: actor.id,
        action: "global_admin.user_access_updated",
        subjectType: "user",
        subjectId: targetId,
        metadata: { isGlobalAdmin: input.isGlobalAdmin, disabled: input.disabled },
      });
    });
    return this.get(targetId);
  }

  async revokeSessions(actorId: string, targetId: string): Promise<void> {
    await this.database.transaction(async () => {
      const result = await this.database.run(
        `UPDATE users SET token_version = token_version + 1, updated_at = ? WHERE id = ?`,
        new Date().toISOString(),
        targetId
      );
      if (result.changes === 0) throw new NotFoundException("User not found");
      await this.database.run("DELETE FROM user_sessions WHERE user_id = ?", targetId);
      await this.database.run("DELETE FROM api_tokens WHERE user_id = ?", targetId);
      await this.audit.record({
        userId: actorId,
        action: "global_admin.user_sessions_revoked",
        subjectType: "user",
        subjectId: targetId,
      });
    });
  }

  private async get(id: string): Promise<GlobalAdminUserSummary> {
    const row = await this.database.get<AdminUserRow>(
      `SELECT u.id, u.email, u.name, u.is_global_admin, u.disabled_at,
       u.last_signed_in_at, u.created_at, u.updated_at,
       COUNT(DISTINCT tm.team_id) AS team_count,
       COUNT(DISTINCT at.id) AS api_token_count
       FROM users u
       LEFT JOIN team_members tm ON tm.user_id = u.id
       LEFT JOIN api_tokens at ON at.user_id = u.id
       WHERE u.id = ? GROUP BY u.id`,
      id
    );
    if (!row) throw new NotFoundException("User not found");
    return this.map(row);
  }

  private async activeAdministratorCount(): Promise<number> {
    return (await this.database.get<{ count: number }>(
      `SELECT COUNT(*) AS count FROM users
         WHERE is_global_admin = TRUE AND disabled_at IS NULL`
    ))!.count;
  }

  private boundedInteger(
    value: string | undefined,
    fallback: number,
    minimum: number,
    maximum: number,
    label: string
  ): number {
    if (value === undefined) return fallback;
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) {
      throw new BadRequestException(`${label} is invalid`);
    }
    return parsed;
  }

  private map(row: AdminUserRow): GlobalAdminUserSummary {
    return {
      id: row.id,
      email: row.email,
      name: row.name,
      isGlobalAdmin: row.is_global_admin,
      disabledAt: row.disabled_at,
      lastSignedInAt: row.last_signed_in_at,
      teamCount: row.team_count,
      apiTokenCount: row.api_token_count,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}
