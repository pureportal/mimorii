import { BadRequestException, Injectable } from "@nestjs/common";
import type { GlobalAdminStatistics, GlobalAuditEventSummary } from "@mimorii/contracts";
import { DatabaseService } from "../database/database.service.js";

interface StatisticsRow {
  total_users: number;
  enabled_users: number;
  disabled_users: number;
  global_administrators: number;
  signed_in_users_30d: number;
  teams: number;
  resources: number;
  checks: number;
  open_incidents: number;
  pending_sponsorship_applications: number;
  published_sponsors: number;
}

interface AuditRow {
  id: string;
  action: string;
  subject_type: string;
  subject_id: string | null;
  metadata_json: string;
  created_at: string;
  actor_name: string | null;
}

@Injectable()
export class AdminService {
  constructor(private readonly database: DatabaseService) {}

  async statistics(): Promise<GlobalAdminStatistics> {
    const signedInSince = new Date(Date.now() - 30 * 86_400_000).toISOString();
    const row = (await this.database.get<StatisticsRow>(
      `SELECT
       (SELECT COUNT(*) FROM users) AS total_users,
       (SELECT COUNT(*) FROM users WHERE disabled_at IS NULL) AS enabled_users,
       (SELECT COUNT(*) FROM users WHERE disabled_at IS NOT NULL) AS disabled_users,
       (SELECT COUNT(*) FROM users WHERE is_global_admin = TRUE AND disabled_at IS NULL)
         AS global_administrators,
       (SELECT COUNT(*) FROM users WHERE disabled_at IS NULL AND last_signed_in_at >= ?)
         AS signed_in_users_30d,
       (SELECT COUNT(*) FROM teams) AS teams,
       (SELECT COUNT(*) FROM resources) AS resources,
       (SELECT COUNT(*) FROM checks) AS checks,
       (SELECT COUNT(*) FROM incidents WHERE status != 'resolved') AS open_incidents,
       (SELECT COUNT(*) FROM sponsorship_applications WHERE status = 'pending')
         AS pending_sponsorship_applications,
       (SELECT COUNT(*) FROM sponsors WHERE published_at IS NOT NULL) AS published_sponsors`,
      signedInSince
    ))!;
    const registrations = await this.database.all<{ date: string; count: number }>(
      `SELECT TO_CHAR(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS date,
       COUNT(*) AS count FROM users
       WHERE created_at >= CURRENT_TIMESTAMP - INTERVAL '30 days'
       GROUP BY TO_CHAR(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD') ORDER BY date`
    );
    return {
      totalUsers: row.total_users,
      enabledUsers: row.enabled_users,
      disabledUsers: row.disabled_users,
      globalAdministrators: row.global_administrators,
      signedInUsers30d: row.signed_in_users_30d,
      teams: row.teams,
      resources: row.resources,
      checks: row.checks,
      openIncidents: row.open_incidents,
      pendingSponsorshipApplications: row.pending_sponsorship_applications,
      publishedSponsors: row.published_sponsors,
      registrations,
    };
  }

  async audit(options: {
    limit?: string;
    before?: string;
    action?: string;
  }): Promise<GlobalAuditEventSummary[]> {
    const limit = this.boundedLimit(options.limit);
    const clauses = ["a.team_id IS NULL"];
    const parameters: Array<string | number> = [];
    if (options.before) {
      const separator = options.before.lastIndexOf("|");
      if (separator < 1) throw new BadRequestException("Audit cursor is invalid");
      const createdAt = options.before.slice(0, separator);
      const id = options.before.slice(separator + 1);
      if (!Number.isFinite(new Date(createdAt).getTime()) || !id) {
        throw new BadRequestException("Audit cursor is invalid");
      }
      clauses.push("(a.created_at < ? OR (a.created_at = ? AND a.id < ?))");
      parameters.push(createdAt, createdAt, id);
    }
    if (options.action) {
      if (options.action.length > 120) throw new BadRequestException("Audit action is invalid");
      clauses.push("a.action = ?");
      parameters.push(options.action);
    }
    const rows = await this.database.all<AuditRow>(
      `SELECT a.*, u.name AS actor_name
       FROM audit_events a LEFT JOIN users u ON u.id = a.user_id
       WHERE ${clauses.join(" AND ")}
       ORDER BY a.created_at DESC, a.id DESC LIMIT ?`,
      ...parameters,
      limit
    );
    return rows.map((row) => ({
      id: row.id,
      action: row.action,
      subjectType: row.subject_type,
      subjectId: row.subject_id,
      metadata: this.parseMetadata(row.metadata_json),
      actorName: row.actor_name,
      createdAt: row.created_at,
    }));
  }

  private boundedLimit(value: string | undefined): number {
    if (value === undefined) return 100;
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > 500) {
      throw new BadRequestException("Limit is invalid");
    }
    return parsed;
  }

  private parseMetadata(value: string): Record<string, unknown> {
    const parsed: unknown = JSON.parse(value);
    if (!this.isRecord(parsed)) throw new Error("Audit metadata is invalid");
    return parsed;
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
  }
}
