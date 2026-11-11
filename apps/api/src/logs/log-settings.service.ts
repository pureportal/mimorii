import { logDeletionGraceDays, type TeamLogSettings } from "@mimorii/contracts";
import { Injectable, NotFoundException } from "@nestjs/common";
import { AuditService } from "../common/audit.service.js";
import { DatabaseService } from "../database/database.service.js";
import { LogAlertsService } from "./log-alerts.service.js";
import { LogsAccessService } from "./logs-access.service.js";

interface TeamLogSettingsRow {
  enabled: boolean;
  retention_days: number;
  enabled_at: string | null;
}

@Injectable()
export class LogSettingsService {
  constructor(
    private readonly database: DatabaseService,
    private readonly access: LogsAccessService,
    private readonly alerts: LogAlertsService,
    private readonly audit: AuditService
  ) {}

  async get(userId: string, teamId: string): Promise<TeamLogSettings> {
    await this.access.require(userId, teamId, "viewer");
    return this.read(teamId);
  }

  async updateRetention(
    userId: string,
    teamId: string,
    retentionDays: number
  ): Promise<TeamLogSettings> {
    await this.access.require(userId, teamId, "admin");
    await this.database.run(
      `UPDATE team_log_settings SET retention_days = ?, updated_by = ?, updated_at = ?
       WHERE team_id = ?`,
      retentionDays,
      userId,
      new Date().toISOString(),
      teamId
    );
    await this.audit.record({
      teamId,
      userId,
      action: "logs.retention_updated",
      subjectType: "team",
      subjectId: teamId,
      metadata: { retentionDays },
    });
    return this.read(teamId);
  }

  async setEnabled(actorId: string, teamId: string, enabled: boolean): Promise<void> {
    const team = await this.database.get<{ name: string }>(
      "SELECT name FROM teams WHERE id = ?",
      teamId
    );
    if (!team) throw new NotFoundException("Team not found");
    const now = new Date();
    const changedAt = now.toISOString();
    const purgeAfter = new Date(now.getTime() + logDeletionGraceDays * 86_400_000).toISOString();
    await this.database.transaction(async () => {
      const current = await this.database.get<{ enabled: boolean }>(
        "SELECT enabled FROM team_log_settings WHERE team_id = ? FOR UPDATE",
        teamId
      );
      if (Boolean(current?.enabled) === enabled) return;
      if (enabled) {
        await this.database.run(
          `INSERT INTO team_log_settings (team_id, enabled, enabled_at, updated_by, updated_at)
           VALUES (?, TRUE, ?, ?, ?)
           ON CONFLICT (team_id) DO UPDATE SET enabled = TRUE, enabled_at = EXCLUDED.enabled_at,
           purge_after = NULL, updated_by = EXCLUDED.updated_by, updated_at = EXCLUDED.updated_at`,
          teamId,
          changedAt,
          actorId,
          changedAt
        );
      } else {
        await this.database.run(
          `UPDATE team_log_settings SET enabled = FALSE, disabled_at = ?, purge_after = ?,
           updated_by = ?, updated_at = ? WHERE team_id = ?`,
          changedAt,
          purgeAfter,
          actorId,
          changedAt,
          teamId
        );
        await this.alerts.suspendTeam(teamId, changedAt);
      }
      const action = enabled ? "logs.enabled" : "logs.disabled";
      const metadata = enabled ? { teamName: team.name } : { teamName: team.name, purgeAfter };
      await this.audit.record({
        userId: actorId,
        action: `platform.${action}`,
        subjectType: "team",
        subjectId: teamId,
        metadata,
      });
      await this.audit.record({
        teamId,
        userId: actorId,
        action,
        subjectType: "team",
        subjectId: teamId,
        metadata: enabled ? {} : { purgeAfter },
      });
    });
  }

  private async read(teamId: string): Promise<TeamLogSettings> {
    const row = (await this.database.get<TeamLogSettingsRow>(
      "SELECT enabled, retention_days, enabled_at FROM team_log_settings WHERE team_id = ?",
      teamId
    ))!;
    return {
      retentionDays: row.retention_days,
      enabledAt: row.enabled_at ? new Date(row.enabled_at).toISOString() : null,
    };
  }
}
