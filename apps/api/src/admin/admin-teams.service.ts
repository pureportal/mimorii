import type { GlobalAdminTeamSummary, GlobalAdminTeamsPage } from "@mimorii/contracts";
import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { DatabaseService } from "../database/database.service.js";
import { LogSettingsService } from "../logs/log-settings.service.js";

interface AdminTeamRow {
  id: string;
  name: string;
  member_count: number;
  owner_name: string | null;
  logs_enabled: boolean;
  purge_after: string | null;
  last_log_at: string | null;
  created_at: string;
}

const logFilters = ["all", "enabled", "disabled"] as const;
type LogFilter = (typeof logFilters)[number];

const teamSelect = `SELECT t.id, t.name, t.created_at,
  (SELECT COUNT(*) FROM team_members tm WHERE tm.team_id = t.id) AS member_count,
  (SELECT u.name FROM team_members tm JOIN users u ON u.id = tm.user_id
    WHERE tm.team_id = t.id AND tm.role = 'owner' ORDER BY tm.joined_at LIMIT 1) AS owner_name,
  COALESCE(tls.enabled, FALSE) AS logs_enabled, tls.purge_after,
  (SELECT MAX(s.last_seen_at) FROM log_streams s WHERE s.team_id = t.id) AS last_log_at
  FROM teams t LEFT JOIN team_log_settings tls ON tls.team_id = t.id`;

@Injectable()
export class AdminTeamsService {
  constructor(
    private readonly database: DatabaseService,
    private readonly logSettings: LogSettingsService
  ) {}

  async list(options: {
    search?: string;
    logs?: string;
    limit?: string;
    offset?: string;
  }): Promise<GlobalAdminTeamsPage> {
    const limit = boundedNumber(options.limit, 20, 1, 100, "Limit");
    const offset = boundedNumber(options.offset, 0, 0, 1_000_000, "Offset");
    const logs = (options.logs ?? "all") as LogFilter;
    if (!logFilters.includes(logs)) throw new BadRequestException("Log filter is invalid");
    const search = options.search?.trim().toLowerCase() ?? "";
    if (search.length > 100) throw new BadRequestException("Search is too long");
    const clauses = ["TRUE"];
    const parameters: unknown[] = [];
    if (search) {
      clauses.push("(strpos(LOWER(t.name), ?) > 0 OR t.id = ?)");
      parameters.push(search, search);
    }
    if (logs !== "all") clauses.push(`COALESCE(tls.enabled, FALSE) = ${logs === "enabled"}`);
    const where = clauses.join(" AND ");
    const total = (await this.database.get<{ count: number }>(
      `SELECT COUNT(*) AS count FROM teams t
       LEFT JOIN team_log_settings tls ON tls.team_id = t.id WHERE ${where}`,
      ...parameters
    ))!.count;
    const rows = await this.database.all<AdminTeamRow>(
      `${teamSelect} WHERE ${where} ORDER BY LOWER(t.name), t.id LIMIT ? OFFSET ?`,
      ...parameters,
      limit,
      offset
    );
    return { teams: rows.map(mapTeam), total, limit, offset };
  }

  async setLogs(
    actorId: string,
    teamId: string,
    enabled: boolean
  ): Promise<GlobalAdminTeamSummary> {
    await this.logSettings.setEnabled(actorId, teamId, enabled);
    const row = await this.database.get<AdminTeamRow>(`${teamSelect} WHERE t.id = ?`, teamId);
    if (!row) throw new NotFoundException("Team not found");
    return mapTeam(row);
  }
}

function boundedNumber(
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

function mapTeam(row: AdminTeamRow): GlobalAdminTeamSummary {
  return {
    id: row.id,
    name: row.name,
    memberCount: row.member_count,
    ownerName: row.owner_name,
    logsEnabled: row.logs_enabled,
    logsDeletionScheduledAt: row.purge_after ? new Date(row.purge_after).toISOString() : null,
    lastLogAt: row.last_log_at ? new Date(row.last_log_at).toISOString() : null,
    createdAt: new Date(row.created_at).toISOString(),
  };
}
