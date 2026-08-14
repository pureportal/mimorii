import { Controller, Get, Param, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { AuthGuard } from "../auth/auth.guard.js";
import { CurrentUser } from "../auth/current-user.decorator.js";
import type { AuthenticatedUser } from "../common/rows.js";
import { DatabaseService } from "../database/database.service.js";
import { TeamAccessService } from "../teams/team-access.service.js";

interface AuditRow {
  id: string;
  action: string;
  subject_type: string;
  subject_id: string | null;
  metadata_json: string;
  created_at: string;
  actor_name: string | null;
}

@ApiTags("Audit")
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller("teams/:teamId/audit")
export class AuditController {
  constructor(
    private readonly database: DatabaseService,
    private readonly access: TeamAccessService
  ) {}

  @Get()
  async list(
    @CurrentUser() user: AuthenticatedUser,
    @Param("teamId") teamId: string,
    @Query("limit") limit?: string,
    @Query("before") before?: string,
    @Query("action") action?: string
  ) {
    await this.access.require(user.id, teamId, "admin");
    const clauses = ["a.team_id = ?"];
    const parameters: Array<string | number> = [teamId];
    if (before) {
      const separator = before.lastIndexOf("|");
      const createdAt = separator > 0 ? before.slice(0, separator) : before;
      const id = separator > 0 ? before.slice(separator + 1) : "";
      clauses.push("(a.created_at < ? OR (a.created_at = ? AND a.id < ?))");
      parameters.push(createdAt, createdAt, id);
    }
    if (action) {
      clauses.push("a.action = ?");
      parameters.push(action);
    }
    parameters.push(Math.min(Math.max(Number(limit) || 100, 1), 500));
    const rows = await this.database.all<AuditRow>(
      `SELECT a.*, u.name AS actor_name FROM audit_events a LEFT JOIN users u ON u.id = a.user_id
       WHERE ${clauses.join(" AND ")} ORDER BY a.created_at DESC, a.id DESC LIMIT ?`,
      ...parameters
    );
    return rows.map((row) => ({
      id: row.id,
      action: row.action,
      subjectType: row.subject_type,
      subjectId: row.subject_id,
      metadata: JSON.parse(row.metadata_json) as Record<string, unknown>,
      actorName: row.actor_name,
      createdAt: row.created_at,
    }));
  }
}
