import { Inject, Injectable, type OnModuleInit } from "@nestjs/common";
import { Interval } from "@nestjs/schedule";
import { DatabaseInitService } from "../database/database-init.service.js";
import { DatabaseService } from "../database/database.service.js";
import { PlatformSettingsService } from "../platform-settings/platform-settings.service.js";

@Injectable()
export class RetentionService implements OnModuleInit {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    private readonly databaseInit: DatabaseInitService,
    private readonly settings: PlatformSettingsService
  ) {}

  onModuleInit(): Promise<void> {
    return this.prune();
  }

  @Interval(6 * 60 * 60 * 1_000)
  async prune(): Promise<void> {
    await this.databaseInit.waitUntilReady();
    if (process.env.MIMORII_RETENTION_ENABLED === "false") return;
    const cutoffs = {
      results: this.cutoff("MIMORII_RESULT_RETENTION_DAYS", 365),
      snapshots: this.cutoff("MIMORII_SNAPSHOT_RETENTION_DAYS", 90),
      deliveries: this.cutoff("MIMORII_DELIVERY_RETENTION_DAYS", 180),
      pushEndpoints: this.cutoff("MIMORII_PUSH_ENDPOINT_RETENTION_DAYS", 270),
      audit: this.cutoff("MIMORII_AUDIT_RETENTION_DAYS", 730),
      tasks: this.cutoff("MIMORII_AGENT_TASK_RETENTION_DAYS", 7),
      heartbeats: this.cutoff("MIMORII_HEARTBEAT_RETENTION_DAYS", 365),
      sponsorshipApplications: this.cutoffDays(
        await this.settings.sponsorshipApplicationRetentionDays()
      ),
    };
    await this.database.transaction(async () => {
      await this.database.run("DELETE FROM team_invites WHERE expires_at < CURRENT_TIMESTAMP");
      await this.database.run(
        "DELETE FROM api_tokens WHERE expires_at IS NOT NULL AND expires_at < CURRENT_TIMESTAMP"
      );
      await this.database.run("DELETE FROM user_sessions WHERE expires_at < CURRENT_TIMESTAMP");
      await this.database.run(
        `DELETE FROM status_subscribers
         WHERE verified_at IS NULL
         AND verification_expires_at < CURRENT_TIMESTAMP`
      );
      await this.database.run("DELETE FROM check_results WHERE checked_at < ?", cutoffs.results);
      await this.database.run(
        "DELETE FROM host_snapshots WHERE observed_at < ?",
        cutoffs.snapshots
      );
      await this.database.run(
        "DELETE FROM mobile_device_statuses WHERE received_at < ?",
        cutoffs.snapshots
      );
      await this.database.run(
        "DELETE FROM notification_deliveries WHERE created_at < ?",
        cutoffs.deliveries
      );
      await this.database.run(
        `DELETE FROM notification_endpoints
         WHERE (status = 'invalid' AND invalidated_at < ?) OR last_seen_at < ?`,
        cutoffs.deliveries,
        cutoffs.pushEndpoints
      );
      await this.database.run(
        "DELETE FROM status_subscriber_deliveries WHERE created_at < ?",
        cutoffs.deliveries
      );
      await this.database.run("DELETE FROM audit_events WHERE created_at < ?", cutoffs.audit);
      await this.database.run(
        "DELETE FROM heartbeat_events WHERE received_at < ?",
        cutoffs.heartbeats
      );
      await this.database.run(
        `DELETE FROM agent_tasks WHERE status IN ('completed', 'expired') AND issued_at < ?`,
        cutoffs.tasks
      );
      await this.database.run(
        "DELETE FROM sponsorship_applications WHERE submitted_at < ?",
        cutoffs.sponsorshipApplications
      );
    });
  }

  private cutoff(name: string, fallbackDays: number): string {
    const configured = Number(process.env[name] ?? fallbackDays);
    const days = Number.isFinite(configured)
      ? Math.min(Math.max(Math.floor(configured), 1), 3_650)
      : fallbackDays;
    return this.cutoffDays(days);
  }

  private cutoffDays(days: number): string {
    return new Date(Date.now() - days * 86_400_000).toISOString();
  }
}
