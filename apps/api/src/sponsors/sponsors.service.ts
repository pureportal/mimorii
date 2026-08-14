import {
  sponsorshipTiers,
  type SponsorSummary,
  type SponsorshipApplicationReceipt,
  type SponsorshipTier,
  type SponsorshipTierCollection,
} from "@mimorii/contracts";
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { DatabaseService } from "../database/database.service.js";
import { PlatformSettingsService } from "../platform-settings/platform-settings.service.js";
import type { CreateSponsorshipApplicationDto } from "./sponsors.dto.js";

interface SponsorRow {
  id: string;
  name: string;
  tier: SponsorshipTier;
  website_url: string | null;
  favicon_updated_at: string | null;
}

interface SponsorFaviconRow {
  favicon_data: Buffer;
  favicon_updated_at: string;
}

@Injectable()
export class SponsorsService {
  constructor(
    private readonly database: DatabaseService,
    private readonly settings: PlatformSettingsService
  ) {}

  async list(): Promise<SponsorshipTierCollection[]> {
    const rows = await this.database.all<SponsorRow>(
      `SELECT id, name, tier, website_url, favicon_updated_at FROM sponsors
       WHERE published_at IS NOT NULL
       ORDER BY CASE tier WHEN 'platinum' THEN 0 WHEN 'gold' THEN 1 ELSE 2 END,
       display_order, LOWER(name), name`
    );

    return sponsorshipTiers.map((tier) => ({
      tier,
      sponsors: rows
        .filter((row) => row.tier === tier)
        .map<SponsorSummary>((row) => ({
          id: row.id,
          name: row.name,
          websiteUrl: row.website_url,
          faviconUpdatedAt: row.favicon_updated_at,
        })),
    }));
  }

  async favicon(id: string): Promise<SponsorFaviconRow> {
    const row = await this.database.get<SponsorFaviconRow>(
      `SELECT favicon_data, favicon_updated_at FROM sponsors
       WHERE id = ? AND published_at IS NOT NULL AND favicon_data IS NOT NULL`,
      id
    );
    if (!row) throw new NotFoundException("Sponsor favicon not found");
    return row;
  }

  async apply(input: CreateSponsorshipApplicationDto): Promise<SponsorshipApplicationReceipt> {
    if (!(await this.settings.sponsorshipApplicationsEnabled())) {
      throw new ForbiddenException("Sponsorship applications are closed");
    }
    let websiteUrl: string | null = null;
    if (input.websiteUrl) {
      const parsed = new URL(input.websiteUrl);
      if (parsed.username || parsed.password) {
        throw new BadRequestException("Website URL is invalid");
      }
      websiteUrl = parsed.toString();
    }

    const id = randomUUID();
    const submittedAt = new Date().toISOString();
    await this.database.run(
      `INSERT INTO sponsorship_applications
       (id, organization_name, contact_name, email, website_url, tier, message, submitted_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      id,
      input.organizationName.trim(),
      input.contactName.trim(),
      input.email.trim().toLowerCase(),
      websiteUrl,
      input.tier,
      input.message?.trim() || null,
      submittedAt
    );
    return { id, submittedAt };
  }
}
