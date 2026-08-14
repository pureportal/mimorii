import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type {
  ManagedSponsor,
  SponsorshipApplicationStatus,
  SponsorshipApplicationSummary,
  SponsorshipApplicationsPage,
  SponsorshipTier,
} from "@mimorii/contracts";
import { randomUUID } from "node:crypto";
import { AuditService } from "../common/audit.service.js";
import { DatabaseService } from "../database/database.service.js";
import type {
  CreateSponsorDto,
  ReorderSponsorsDto,
  ReviewSponsorshipApplicationDto,
  UpdateSponsorDto,
} from "./admin.dto.js";

interface ApplicationRow {
  id: string;
  organization_name: string;
  contact_name: string;
  email: string;
  website_url: string | null;
  tier: SponsorshipTier;
  message: string | null;
  status: SponsorshipApplicationStatus;
  submitted_at: string;
  reviewed_at: string | null;
}

interface SponsorRow {
  id: string;
  name: string;
  tier: SponsorshipTier;
  website_url: string | null;
  favicon_updated_at: string | null;
  display_order: number;
  published_at: string | null;
  created_at: string;
  updated_at: string;
}

interface SponsorFaviconRow {
  favicon_data: Buffer;
  favicon_updated_at: string;
}

const applicationStatuses = new Set(["all", "pending", "approved", "declined"]);

@Injectable()
export class AdminSponsorshipsService {
  constructor(
    private readonly database: DatabaseService,
    private readonly audit: AuditService
  ) {}

  async applications(options: {
    status?: string;
    limit?: string;
    offset?: string;
  }): Promise<SponsorshipApplicationsPage> {
    const status = options.status ?? "all";
    if (!applicationStatuses.has(status)) {
      throw new BadRequestException("Application status is invalid");
    }
    const limit = this.boundedInteger(options.limit, 50, 1, 100, "Limit");
    const offset = this.boundedInteger(options.offset, 0, 0, 1_000_000, "Offset");
    const where = status === "all" ? "" : "WHERE status = ?";
    const parameters = status === "all" ? [] : [status];
    const total = (await this.database.get<{ count: number }>(
      `SELECT COUNT(*) AS count FROM sponsorship_applications ${where}`,
      ...parameters
    ))!.count;
    const rows = await this.database.all<ApplicationRow>(
      `SELECT * FROM sponsorship_applications ${where}
       ORDER BY submitted_at DESC, id DESC LIMIT ? OFFSET ?`,
      ...parameters,
      limit,
      offset
    );
    return { applications: rows.map((row) => this.mapApplication(row)), total, limit, offset };
  }

  async review(
    actorId: string,
    id: string,
    input: ReviewSponsorshipApplicationDto
  ): Promise<SponsorshipApplicationSummary> {
    if (input.status === input.expectedStatus) {
      throw new BadRequestException("Application status is unchanged");
    }
    const reviewedAt = input.status === "pending" ? null : new Date().toISOString();
    await this.database.transaction(async () => {
      const result = await this.database.run(
        `UPDATE sponsorship_applications SET status = ?, reviewed_by = ?, reviewed_at = ?
         WHERE id = ? AND status = ?`,
        input.status,
        reviewedAt ? actorId : null,
        reviewedAt,
        id,
        input.expectedStatus
      );
      if (result.changes === 0) {
        if (
          !(await this.database.get("SELECT id FROM sponsorship_applications WHERE id = ?", id))
        ) {
          throw new NotFoundException("Sponsorship application not found");
        }
        throw new ConflictException("Application changed; reload and try again");
      }
      await this.audit.record({
        userId: actorId,
        action: "sponsorship.application_reviewed",
        subjectType: "sponsorship_application",
        subjectId: id,
        metadata: { status: input.status },
      });
    });
    return this.requireApplication(id);
  }

  async sponsors(): Promise<ManagedSponsor[]> {
    const rows = await this.database.all<SponsorRow>(
      `SELECT id, name, tier, website_url, favicon_updated_at, display_order,
       published_at, created_at, updated_at FROM sponsors
       ORDER BY CASE tier WHEN 'platinum' THEN 0 WHEN 'gold' THEN 1 ELSE 2 END,
       display_order, LOWER(name), id`
    );
    return rows.map((row) => this.mapSponsor(row));
  }

  async sponsorFavicon(id: string): Promise<SponsorFaviconRow> {
    const row = await this.database.get<SponsorFaviconRow>(
      `SELECT favicon_data, favicon_updated_at FROM sponsors
       WHERE id = ? AND favicon_data IS NOT NULL`,
      id
    );
    if (!row) throw new NotFoundException("Sponsor image not found");
    return row;
  }

  async createSponsor(
    actorId: string,
    input: CreateSponsorDto,
    faviconData?: Buffer
  ): Promise<ManagedSponsor> {
    const id = randomUUID();
    const now = new Date().toISOString();
    try {
      await this.database.transaction(async () => {
        const displayOrder = await this.nextDisplayOrder(input.tier);
        await this.database.run(
          `INSERT INTO sponsors
           (id, name, tier, website_url, favicon_data, favicon_updated_at, display_order,
            published_at, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          id,
          input.name.trim(),
          input.tier,
          this.websiteUrl(input.websiteUrl),
          faviconData ?? null,
          faviconData ? now : null,
          displayOrder,
          input.published ? now : null,
          now,
          now
        );
        await this.audit.record({
          userId: actorId,
          action: "sponsorship.sponsor_created",
          subjectType: "sponsor",
          subjectId: id,
          metadata: { tier: input.tier, published: input.published },
        });
      });
    } catch (error) {
      if (this.isUniqueViolation(error)) {
        throw new ConflictException("A sponsor already uses this name");
      }
      throw error;
    }
    return this.requireSponsor(id);
  }

  async updateSponsor(
    actorId: string,
    id: string,
    input: UpdateSponsorDto,
    faviconData?: Buffer
  ): Promise<ManagedSponsor> {
    if (faviconData !== undefined && input.removeFavicon) {
      throw new BadRequestException("Choose either a replacement image or removal");
    }
    const now = new Date(
      Math.max(Date.now(), new Date(input.expectedUpdatedAt).getTime() + 1)
    ).toISOString();
    const updatesFavicon = faviconData !== undefined || input.removeFavicon === true;
    try {
      await this.database.transaction(async () => {
        const current = await this.database.get<SponsorRow>(
          "SELECT * FROM sponsors WHERE id = ? AND updated_at = ?",
          id,
          input.expectedUpdatedAt
        );
        if (!current) {
          if (!(await this.database.get("SELECT id FROM sponsors WHERE id = ?", id))) {
            throw new NotFoundException("Sponsor not found");
          }
          throw new ConflictException("Sponsor changed; reload and try again");
        }
        const displayOrder =
          current.tier === input.tier
            ? current.display_order
            : await this.nextDisplayOrder(input.tier);
        const result = await this.database.run(
          `UPDATE sponsors SET name = ?, tier = ?, website_url = ?, display_order = ?,
           favicon_data = CASE WHEN ? THEN ? ELSE favicon_data END,
           favicon_updated_at = CASE WHEN ? THEN ? ELSE favicon_updated_at END,
           published_at = CASE WHEN ? THEN COALESCE(published_at, ?) ELSE NULL END,
           updated_at = ? WHERE id = ? AND updated_at = ?`,
          input.name.trim(),
          input.tier,
          this.websiteUrl(input.websiteUrl),
          displayOrder,
          updatesFavicon,
          faviconData ?? null,
          updatesFavicon,
          faviconData ? now : null,
          input.published,
          now,
          now,
          id,
          input.expectedUpdatedAt
        );
        if (result.changes === 0) {
          if (!(await this.database.get("SELECT id FROM sponsors WHERE id = ?", id))) {
            throw new NotFoundException("Sponsor not found");
          }
          throw new ConflictException("Sponsor changed; reload and try again");
        }
        await this.audit.record({
          userId: actorId,
          action: "sponsorship.sponsor_updated",
          subjectType: "sponsor",
          subjectId: id,
          metadata: { tier: input.tier, published: input.published },
        });
      });
    } catch (error) {
      if (this.isUniqueViolation(error)) {
        throw new ConflictException("A sponsor already uses this name");
      }
      throw error;
    }
    return this.requireSponsor(id);
  }

  async reorderSponsors(actorId: string, input: ReorderSponsorsDto): Promise<ManagedSponsor[]> {
    await this.database.transaction(async () => {
      const current = await this.database.all<{ id: string; updated_at: string }>(
        "SELECT id, updated_at FROM sponsors WHERE tier = ?",
        input.tier
      );
      const currentIds = new Set(current.map((sponsor) => sponsor.id));
      if (
        current.length !== input.sponsorIds.length ||
        input.sponsorIds.some((id) => !currentIds.has(id))
      ) {
        throw new ConflictException("Sponsor list changed; reload and try again");
      }

      const latestUpdate = Math.max(
        Date.now(),
        ...current.map((sponsor) => new Date(sponsor.updated_at).getTime() + 1)
      );
      const updatedAt = new Date(latestUpdate).toISOString();
      const orderingValues = input.sponsorIds.map(() => "(?, ?)").join(", ");
      const orderingParameters = input.sponsorIds.flatMap((id, index) => [id, index]);
      const result = await this.database.run(
        `UPDATE sponsors AS sponsor
         SET display_order = ordering.display_order, updated_at = ?
         FROM (VALUES ${orderingValues}) AS ordering(id, display_order)
         WHERE sponsor.id = ordering.id AND sponsor.tier = ?`,
        updatedAt,
        ...orderingParameters,
        input.tier
      );
      if (result.changes !== input.sponsorIds.length) {
        throw new ConflictException("Sponsor list changed; reload and try again");
      }
      await this.audit.record({
        userId: actorId,
        action: "sponsorship.sponsors_reordered",
        subjectType: "sponsor_tier",
        subjectId: input.tier,
        metadata: { sponsorIds: input.sponsorIds },
      });
    });
    return this.sponsors();
  }

  async removeSponsor(actorId: string, id: string, expectedUpdatedAt: string): Promise<void> {
    await this.database.transaction(async () => {
      const result = await this.database.run(
        "DELETE FROM sponsors WHERE id = ? AND updated_at = ?",
        id,
        expectedUpdatedAt
      );
      if (result.changes === 0) {
        if (!(await this.database.get("SELECT id FROM sponsors WHERE id = ?", id))) {
          throw new NotFoundException("Sponsor not found");
        }
        throw new ConflictException("Sponsor changed; reload and try again");
      }
      await this.audit.record({
        userId: actorId,
        action: "sponsorship.sponsor_deleted",
        subjectType: "sponsor",
        subjectId: id,
      });
    });
  }

  private async requireApplication(id: string): Promise<SponsorshipApplicationSummary> {
    const row = await this.database.get<ApplicationRow>(
      "SELECT * FROM sponsorship_applications WHERE id = ?",
      id
    );
    if (!row) throw new NotFoundException("Sponsorship application not found");
    return this.mapApplication(row);
  }

  private async requireSponsor(id: string): Promise<ManagedSponsor> {
    const row = await this.database.get<SponsorRow>("SELECT * FROM sponsors WHERE id = ?", id);
    if (!row) throw new NotFoundException("Sponsor not found");
    return this.mapSponsor(row);
  }

  private websiteUrl(value: string | null | undefined): string | null {
    if (!value) return null;
    const parsed = new URL(value);
    if (parsed.username || parsed.password) throw new BadRequestException("Website URL is invalid");
    return parsed.toString();
  }

  private async nextDisplayOrder(tier: SponsorshipTier): Promise<number> {
    const row = await this.database.get<{ display_order: number }>(
      `SELECT COALESCE(MAX(display_order), -1) + 1 AS display_order
       FROM sponsors WHERE tier = ?`,
      tier
    );
    return row!.display_order;
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

  private isUniqueViolation(error: unknown): boolean {
    return Boolean(error && typeof error === "object" && "code" in error && error.code === "23505");
  }

  private mapApplication(row: ApplicationRow): SponsorshipApplicationSummary {
    return {
      id: row.id,
      organizationName: row.organization_name,
      contactName: row.contact_name,
      email: row.email,
      websiteUrl: row.website_url,
      tier: row.tier,
      message: row.message,
      status: row.status,
      submittedAt: row.submitted_at,
      reviewedAt: row.reviewed_at,
    };
  }

  private mapSponsor(row: SponsorRow): ManagedSponsor {
    return {
      id: row.id,
      name: row.name,
      tier: row.tier,
      websiteUrl: row.website_url,
      faviconUpdatedAt: row.favicon_updated_at,
      displayOrder: row.display_order,
      published: row.published_at !== null,
      publishedAt: row.published_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}
