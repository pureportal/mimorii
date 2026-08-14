import { ConflictException, Injectable } from "@nestjs/common";
import type { PlatformSettings } from "@mimorii/contracts";
import { AuditService } from "../common/audit.service.js";
import { DatabaseService } from "../database/database.service.js";

interface PlatformSettingsRow {
  registration_enabled: boolean;
  sponsorship_applications_enabled: boolean;
  sponsorship_application_retention_days: number;
  revision: number;
  updated_at: string;
}

@Injectable()
export class PlatformSettingsService {
  constructor(
    private readonly database: DatabaseService,
    private readonly audit: AuditService
  ) {}

  async get(): Promise<PlatformSettings> {
    const row = await this.database.get<PlatformSettingsRow>(
      "SELECT * FROM platform_settings WHERE id = 1"
    );
    if (!row) throw new Error("Platform settings are unavailable");
    return this.map(row);
  }

  async registrationEnabled(): Promise<boolean> {
    return (await this.get()).registrationEnabled;
  }

  async sponsorshipApplicationsEnabled(): Promise<boolean> {
    return (await this.get()).sponsorshipApplicationsEnabled;
  }

  async sponsorshipApplicationRetentionDays(): Promise<number> {
    return (await this.get()).sponsorshipApplicationRetentionDays;
  }

  async update(
    actorId: string,
    input: {
      registrationEnabled: boolean;
      sponsorshipApplicationsEnabled: boolean;
      sponsorshipApplicationRetentionDays: number;
      expectedRevision: number;
    }
  ): Promise<PlatformSettings> {
    const updatedAt = new Date().toISOString();
    let settings: PlatformSettings | undefined;
    await this.database.transaction(async () => {
      const result = await this.database.run(
        `UPDATE platform_settings SET registration_enabled = ?,
         sponsorship_applications_enabled = ?, sponsorship_application_retention_days = ?,
         revision = revision + 1, updated_by = ?, updated_at = ?
         WHERE id = 1 AND revision = ?`,
        input.registrationEnabled,
        input.sponsorshipApplicationsEnabled,
        input.sponsorshipApplicationRetentionDays,
        actorId,
        updatedAt,
        input.expectedRevision
      );
      if (result.changes === 0) {
        throw new ConflictException("Settings changed; reload and try again");
      }
      settings = await this.get();
      await this.audit.record({
        userId: actorId,
        action: "platform.settings_updated",
        subjectType: "platform_settings",
        metadata: {
          registrationEnabled: settings.registrationEnabled,
          sponsorshipApplicationsEnabled: settings.sponsorshipApplicationsEnabled,
          sponsorshipApplicationRetentionDays: settings.sponsorshipApplicationRetentionDays,
        },
      });
    });
    return settings!;
  }

  private map(row: PlatformSettingsRow): PlatformSettings {
    return {
      registrationEnabled: row.registration_enabled,
      sponsorshipApplicationsEnabled: row.sponsorship_applications_enabled,
      sponsorshipApplicationRetentionDays: row.sponsorship_application_retention_days,
      revision: row.revision,
      updatedAt: row.updated_at,
    };
  }
}
