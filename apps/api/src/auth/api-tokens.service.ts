import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type {
  ApiTokenAccess,
  ApiTokenSummary,
  ApiTokenTeamSummary,
  CreatedApiToken,
  TeamRole,
} from "@mimorii/contracts";
import { randomUUID } from "node:crypto";
import { AuditService } from "../common/audit.service.js";
import { createSecret, hashSecret } from "../common/crypto.js";
import { teamRoleAtLeast } from "../common/team-roles.js";
import { DatabaseService } from "../database/database.service.js";
import type { ApiTokenTeamDto, CreateApiTokenDto } from "./auth.dto.js";

interface ApiTokenRow {
  id: string;
  name: string;
  token_prefix: string;
  access: ApiTokenAccess;
  teams: ApiTokenTeamSummary[];
  expires_at: string | null;
  last_used_at: string | null;
  created_at: string;
}

@Injectable()
export class ApiTokensService {
  constructor(
    private readonly database: DatabaseService,
    private readonly audit: AuditService
  ) {}

  async list(userId: string): Promise<ApiTokenSummary[]> {
    const rows = await this.database.all<ApiTokenRow>(
      `${this.selectSql()} WHERE at.user_id = ? GROUP BY at.id ORDER BY at.created_at DESC`,
      userId
    );
    return rows.map((row) => this.map(row));
  }

  async create(userId: string, input: CreateApiTokenDto): Promise<CreatedApiToken> {
    const count = (await this.database.get<{ count: number }>(
      "SELECT COUNT(*) AS count FROM api_tokens WHERE user_id = ?",
      userId
    ))!.count;
    if (count >= 50) throw new BadRequestException("API token limit reached");
    await this.requireTeamRoles(userId, input.teams);
    const token = createSecret("mim_pat");
    const id = randomUUID();
    const createdAt = new Date().toISOString();
    const expiresInDays = input.expiresInDays === undefined ? 90 : input.expiresInDays;
    const expiresAt = expiresInDays
      ? new Date(Date.now() + expiresInDays * 86_400_000).toISOString()
      : null;
    await this.database.transaction(async () => {
      await this.database.run(
        `INSERT INTO api_tokens
         (id, user_id, name, token_prefix, token_hash, access, expires_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        id,
        userId,
        input.name.trim(),
        token.slice(0, 16),
        hashSecret(token),
        input.access,
        expiresAt,
        createdAt
      );
      await this.database.run(
        `INSERT INTO api_token_teams (api_token_id, team_id, role)
         VALUES ${input.teams.map(() => "(?, ?, ?)").join(", ")}`,
        ...input.teams.flatMap((team) => [id, team.teamId, team.role])
      );
    });
    await this.audit.record({
      userId,
      action: "api_token.created",
      subjectType: "api_token",
      subjectId: id,
    });
    return {
      apiToken: this.map(await this.require(userId, id)),
      token,
    };
  }

  async revoke(userId: string, id: string): Promise<void> {
    const result = await this.database.run(
      "DELETE FROM api_tokens WHERE id = ? AND user_id = ?",
      id,
      userId
    );
    if (result.changes === 0) throw new NotFoundException("API token not found");
    await this.audit.record({
      userId,
      action: "api_token.revoked",
      subjectType: "api_token",
      subjectId: id,
    });
  }

  private async requireTeamRoles(userId: string, teams: ApiTokenTeamDto[]): Promise<void> {
    const memberships = await this.database.all<{ team_id: string; role: TeamRole }>(
      `SELECT team_id, role FROM team_members
       WHERE user_id = ? AND team_id IN (${teams.map(() => "?").join(", ")})`,
      userId,
      ...teams.map((team) => team.teamId)
    );
    const memberRoles = new Map(
      memberships.map((membership) => [membership.team_id, membership.role])
    );
    for (const team of teams) {
      const memberRole = memberRoles.get(team.teamId);
      if (!memberRole) throw new BadRequestException("Choose only teams you belong to");
      if (!teamRoleAtLeast(memberRole, team.role)) {
        throw new BadRequestException("API token role cannot exceed your team role");
      }
    }
  }

  private async require(userId: string, id: string): Promise<ApiTokenRow> {
    const row = await this.database.get<ApiTokenRow>(
      `${this.selectSql()} WHERE at.id = ? AND at.user_id = ? GROUP BY at.id`,
      id,
      userId
    );
    if (!row) throw new NotFoundException("API token not found");
    return row;
  }

  private selectSql(): string {
    return `SELECT at.id, at.name, at.token_prefix, at.access, at.expires_at, at.last_used_at,
        at.created_at,
        COALESCE(
          json_agg(
            json_build_object('id', t.id, 'name', t.name, 'role', att.role)
            ORDER BY LOWER(t.name)
          ) FILTER (WHERE t.id IS NOT NULL),
          '[]'::json
        ) AS teams
      FROM api_tokens at
      LEFT JOIN api_token_teams att ON att.api_token_id = at.id
      LEFT JOIN teams t ON t.id = att.team_id`;
  }

  private map(row: ApiTokenRow): ApiTokenSummary {
    return {
      id: row.id,
      name: row.name,
      prefix: row.token_prefix,
      access: row.access,
      teams: row.teams,
      expiresAt: row.expires_at,
      lastUsedAt: row.last_used_at,
      createdAt: row.created_at,
    };
  }
}
