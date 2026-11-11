import { Injectable, Logger, type OnApplicationBootstrap } from "@nestjs/common";
import { Interval } from "@nestjs/schedule";
import { AuditService } from "../common/audit.service.js";
import { DatabaseInitService } from "../database/database-init.service.js";
import { DatabaseService } from "../database/database.service.js";

const deleteBatchSize = 10_000;

@Injectable()
export class LogRetentionService implements OnApplicationBootstrap {
  private readonly logger = new Logger(LogRetentionService.name);
  private pruning = false;

  constructor(
    private readonly database: DatabaseService,
    private readonly databaseInit: DatabaseInitService,
    private readonly audit: AuditService
  ) {}

  onApplicationBootstrap(): void {
    if (process.env.MIMORII_SCHEDULER_ENABLED === "false") return;
    void this.scheduledPrune();
  }

  @Interval(60 * 60 * 1_000)
  async scheduledPrune(): Promise<void> {
    if (process.env.MIMORII_SCHEDULER_ENABLED === "false" || this.pruning) return;
    this.pruning = true;
    try {
      await this.prune();
    } catch (error) {
      this.logger.error(
        `Log retention failed: ${error instanceof Error ? error.message : String(error)}`
      );
    } finally {
      this.pruning = false;
    }
  }

  async prune(now = new Date()): Promise<void> {
    await this.databaseInit.waitUntilReady();
    await this.purgeDisabledTeams(now);
    await this.applyRetention(now);
    await this.pruneSourceStats(now);
  }

  private async purgeDisabledTeams(now: Date): Promise<void> {
    const teams = await this.database.all<{ team_id: string }>(
      `SELECT team_id FROM team_log_settings
       WHERE enabled = FALSE AND purge_after IS NOT NULL AND purge_after <= ?`,
      now.toISOString()
    );
    for (const { team_id: teamId } of teams) {
      const deleted = await this.deleteInBatches(
        `DELETE FROM log_entries WHERE id IN
         (SELECT id FROM log_entries WHERE team_id = ? LIMIT ${deleteBatchSize})
         AND EXISTS (SELECT 1 FROM team_log_settings WHERE team_id = ? AND enabled = FALSE
           AND purge_after <= ?)`,
        teamId,
        teamId,
        now.toISOString()
      );
      await this.database.transaction(async () => {
        const result = await this.database.run(
          `UPDATE team_log_settings SET purge_after = NULL
           WHERE team_id = ? AND enabled = FALSE AND purge_after <= ?`,
          teamId,
          now.toISOString()
        );
        if (result.changes === 0) return;
        await this.database.run("DELETE FROM log_volume WHERE team_id = ?", teamId);
        await this.database.run("DELETE FROM log_streams WHERE team_id = ?", teamId);
        await this.audit.record({
          teamId,
          action: "logs.deleted",
          subjectType: "team",
          subjectId: teamId,
          metadata: { entries: deleted },
        });
      });
    }
  }

  private async applyRetention(now: Date): Promise<void> {
    const teams = await this.database.all<{ team_id: string; retention_days: number }>(
      "SELECT team_id, retention_days FROM team_log_settings WHERE enabled = TRUE"
    );
    for (const team of teams) {
      const cutoff = new Date(now.getTime() - team.retention_days * 86_400_000).toISOString();
      await this.deleteInBatches(
        `DELETE FROM log_entries WHERE id IN
         (SELECT id FROM log_entries WHERE team_id = ? AND occurred_at < ? LIMIT ${deleteBatchSize})`,
        team.team_id,
        cutoff
      );
      await this.database.run(
        "DELETE FROM log_volume WHERE team_id = ? AND bucket_start < ?",
        team.team_id,
        cutoff
      );
      await this.database.run(
        `DELETE FROM log_streams s WHERE s.team_id = ? AND s.last_seen_at < ?
         AND NOT EXISTS (SELECT 1 FROM log_entries e WHERE e.stream_id = s.id)`,
        team.team_id,
        cutoff
      );
    }
  }

  private async pruneSourceStats(now: Date): Promise<void> {
    await this.database.run(
      "DELETE FROM log_source_stats WHERE bucket_start < ?",
      new Date(now.getTime() - 30 * 86_400_000).toISOString()
    );
  }

  private async deleteInBatches(sql: string, ...parameters: unknown[]): Promise<number> {
    let deleted = 0;
    for (;;) {
      const { changes } = await this.database.run(sql, ...parameters);
      deleted += changes;
      if (changes < deleteBatchSize) return deleted;
    }
  }
}
