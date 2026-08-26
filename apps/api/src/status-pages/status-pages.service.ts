import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type {
  PublicStatusPage,
  StatusPageComponent,
  StatusPageSummary,
  StatusPageSubscriberSummary,
} from "@mimorii/contracts";
import { randomUUID } from "node:crypto";
import { AuditService } from "../common/audit.service.js";
import { MONITOR_OBSERVATIONS_CTE } from "../common/monitor-observations.js";
import { ResourceHealthService } from "../common/resource-health.service.js";
import { createSecret, hashSecret, verifySignedReference } from "../common/crypto.js";
import { DatabaseService } from "../database/database.service.js";
import { IncidentsService } from "../incidents/incidents.service.js";
import { MaintenanceService } from "../maintenance/maintenance.service.js";
import { NotificationsService } from "../notifications/notifications.service.js";
import { TeamAccessService } from "../teams/team-access.service.js";
import type {
  CreateStatusPageDto,
  SubscribeStatusPageDto,
  UpdateStatusPageDto,
} from "./status-pages.dto.js";

interface StatusPageRow {
  id: string;
  team_id: string;
  name: string;
  slug: string;
  published: number;
  show_uptime: number;
  created_at: string;
  updated_at: string;
  subscriber_count: number;
}

interface ComponentRow {
  id: string;
  name: string;
  uptime_30d: number | null;
}

@Injectable()
export class StatusPagesService {
  constructor(
    private readonly database: DatabaseService,
    private readonly access: TeamAccessService,
    private readonly incidents: IncidentsService,
    private readonly maintenance: MaintenanceService,
    private readonly notifications: NotificationsService,
    private readonly audit: AuditService,
    private readonly health: ResourceHealthService
  ) {}

  async list(userId: string, teamId: string): Promise<StatusPageSummary[]> {
    await this.access.require(userId, teamId, "viewer");
    const rows = await this.rows("sp.team_id = ?", teamId);
    return Promise.all(rows.map((row) => this.map(row)));
  }

  async create(
    userId: string,
    teamId: string,
    input: CreateStatusPageDto
  ): Promise<StatusPageSummary> {
    await this.access.require(userId, teamId, "admin");
    const resourceIds = await this.validateResources(teamId, input.resourceIds);
    const id = randomUUID();
    const now = new Date().toISOString();
    await this.database.transaction(async () => {
      await this.database.run(
        `INSERT INTO status_pages
         (id, team_id, name, slug, published, show_uptime, created_by, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        id,
        teamId,
        input.name.trim(),
        input.slug.toLowerCase(),
        input.published ? 1 : 0,
        input.showUptime === false ? 0 : 1,
        userId,
        now,
        now
      );
      await this.replaceResources(id, resourceIds);
    });
    await this.audit.record({
      teamId,
      userId,
      action: "status_page.created",
      subjectType: "status_page",
      subjectId: id,
    });
    return this.requireSummary(teamId, id);
  }

  async update(
    userId: string,
    teamId: string,
    id: string,
    input: UpdateStatusPageDto
  ): Promise<StatusPageSummary> {
    await this.access.require(userId, teamId, "admin");
    const current = await this.requireRow(teamId, id);
    const resourceIds = input.resourceIds
      ? await this.validateResources(teamId, input.resourceIds)
      : await this.resourceIds(id);
    await this.database.transaction(async () => {
      await this.database.run(
        `UPDATE status_pages SET name = ?, slug = ?, published = ?, show_uptime = ?, updated_at = ?
         WHERE id = ? AND team_id = ?`,
        input.name?.trim() ?? current.name,
        input.slug?.toLowerCase() ?? current.slug,
        (input.published ?? Boolean(current.published)) ? 1 : 0,
        (input.showUptime ?? Boolean(current.show_uptime)) ? 1 : 0,
        new Date().toISOString(),
        id,
        teamId
      );
      await this.replaceResources(id, resourceIds);
    });
    await this.audit.record({
      teamId,
      userId,
      action: "status_page.updated",
      subjectType: "status_page",
      subjectId: id,
    });
    return this.requireSummary(teamId, id);
  }

  async remove(userId: string, teamId: string, id: string): Promise<void> {
    await this.access.require(userId, teamId, "admin");
    const result = await this.database.run(
      "DELETE FROM status_pages WHERE id = ? AND team_id = ?",
      id,
      teamId
    );
    if (result.changes === 0) throw new NotFoundException("Status page not found");
    await this.audit.record({
      teamId,
      userId,
      action: "status_page.deleted",
      subjectType: "status_page",
      subjectId: id,
    });
  }

  async subscribers(
    userId: string,
    teamId: string,
    id: string
  ): Promise<StatusPageSubscriberSummary[]> {
    await this.access.require(userId, teamId, "admin");
    await this.requireRow(teamId, id);
    const subscribers = await this.database.all<{
      id: string;
      email: string;
      verified_at: string | null;
      created_at: string;
    }>(
      `SELECT id, email, verified_at, created_at
         FROM status_subscribers WHERE status_page_id = ? ORDER BY created_at DESC`,
      id
    );
    return subscribers.map((subscriber) => ({
      id: subscriber.id,
      email: subscriber.email,
      status: subscriber.verified_at ? "verified" : "pending",
      verifiedAt: subscriber.verified_at,
      createdAt: subscriber.created_at,
    }));
  }

  async removeSubscriber(
    userId: string,
    teamId: string,
    pageId: string,
    id: string
  ): Promise<void> {
    await this.access.require(userId, teamId, "admin");
    await this.requireRow(teamId, pageId);
    const result = await this.database.run(
      "DELETE FROM status_subscribers WHERE id = ? AND status_page_id = ?",
      id,
      pageId
    );
    if (result.changes === 0) throw new NotFoundException("Subscriber not found");
    await this.audit.record({
      teamId,
      userId,
      action: "status_page.subscriber_removed",
      subjectType: "status_subscriber",
      subjectId: id,
      metadata: { statusPageId: pageId },
    });
  }

  async publicPage(id: string): Promise<PublicStatusPage> {
    const row = await this.database.get<StatusPageRow>(
      `${this.selectSql()} WHERE sp.id = ? AND sp.published = 1 GROUP BY sp.id`,
      id
    );
    if (!row) throw new NotFoundException("Status page not found");
    const resourceIds = await this.resourceIds(row.id);
    const components = await this.components(row.id, row.team_id);
    const maintenance = await this.maintenance.visibleForResources(
      resourceIds,
      new Date(Date.now() + 30 * 86_400_000)
    );
    const activeMaintenanceIds = new Set(
      maintenance
        .filter((window) => window.status === "active")
        .flatMap((window) => window.resources.map((resource) => resource.id))
    );
    const resolvedSince = new Date(Date.now() - 14 * 86_400_000).toISOString();
    const publicComponents = components.map((component, index) => ({
      ...component,
      id: `component-${index + 1}`,
      status: activeMaintenanceIds.has(component.id) ? "maintenance" : component.status,
    }));
    const state = publicComponents.some((component) => component.status === "down")
      ? "outage"
      : publicComponents.some(
            (component) =>
              component.status === "critical" ||
              component.status === "warning" ||
              component.status === "degraded"
          )
        ? "degraded"
        : publicComponents.some((component) => component.status === "maintenance")
          ? "maintenance"
          : "operational";
    const lastCheck = (
      await this.database.get<{ updated_at: string | null }>(
        `SELECT MAX(updated_at) AS updated_at FROM (
         SELECT c.last_checked_at AS updated_at FROM checks c
         JOIN status_page_resources spr ON spr.resource_id = c.resource_id
         WHERE spr.status_page_id = ?
         UNION ALL
         SELECT hm.last_ping_at AS updated_at FROM heartbeat_monitors hm
         JOIN status_page_resources spr ON spr.resource_id = hm.resource_id
         WHERE spr.status_page_id = ?
       )`,
        row.id,
        row.id
      )
    )?.updated_at;
    const incidents = await this.incidents.forResources(resourceIds, resolvedSince);
    return {
      id: row.id,
      name: row.name,
      slug: row.slug,
      state,
      showUptime: Boolean(row.show_uptime),
      subscriptionsEnabled: this.notifications.emailAvailable(),
      components: publicComponents,
      incidents: incidents.map((incident) => ({
        id: incident.id,
        title: incident.title,
        impact: incident.impact,
        status: incident.status,
        startedAt: incident.startedAt,
        resolvedAt: incident.resolvedAt,
        resources: incident.resources.map((resource) => resource.name),
        updates: incident.updates.map((update) => ({
          id: update.id,
          status: update.status,
          message: update.message,
          createdAt: update.createdAt,
        })),
      })),
      maintenance: maintenance.map((window) => ({
        id: window.id,
        name: window.name,
        startsAt: window.startsAt,
        endsAt: window.endsAt,
        recurrence: window.recurrence,
        status: window.status,
        nextStartsAt: window.nextStartsAt,
        nextEndsAt: window.nextEndsAt,
        resources: window.resources.map((resource) => resource.name),
      })),
      updatedAt: lastCheck ?? row.updated_at,
    };
  }

  async subscribe(id: string, input: SubscribeStatusPageDto): Promise<{ accepted: true }> {
    if (!this.notifications.emailAvailable()) {
      throw new BadRequestException("Email subscriptions are unavailable");
    }
    const page = await this.database.get<StatusPageRow>(
      `${this.selectSql()} WHERE sp.id = ? AND sp.published = 1 GROUP BY sp.id`,
      id
    );
    if (!page) throw new NotFoundException("Status page not found");
    const email = input.email.trim().toLowerCase();
    const existing = await this.database.get<{ id: string; verified_at: string | null }>(
      "SELECT id, verified_at FROM status_subscribers WHERE status_page_id = ? AND email = ?",
      page.id,
      email
    );
    if (existing?.verified_at) return { accepted: true };
    const subscriberId = existing?.id ?? randomUUID();
    const token = createSecret("mim_status");
    const now = new Date().toISOString();
    const verificationExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1_000).toISOString();
    if (existing) {
      await this.database.run(
        `UPDATE status_subscribers SET token_hash = ?, verification_expires_at = ?, created_at = ?
         WHERE id = ?`,
        hashSecret(token),
        verificationExpiresAt,
        now,
        subscriberId
      );
    } else {
      await this.database.run(
        `INSERT INTO status_subscribers
         (id, status_page_id, email, token_hash, verification_expires_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        subscriberId,
        page.id,
        email,
        hashSecret(token),
        verificationExpiresAt,
        now
      );
    }
    const baseUrl = (process.env.MIMORII_PUBLIC_URL ?? "http://localhost:4310").replace(/\/$/, "");
    await this.notifications.sendTransactionalEmail(
      email,
      `Confirm ${page.name} updates`,
      `${baseUrl}/status/${page.id}/${page.slug}?verify=${encodeURIComponent(token)}`
    );
    return { accepted: true };
  }

  async verify(token: string): Promise<{ verified: true }> {
    const result = await this.database.run(
      `UPDATE status_subscribers SET verified_at = ?, verification_expires_at = NULL, token_hash = NULL
       WHERE token_hash = ? AND verification_expires_at > CURRENT_TIMESTAMP`,
      new Date().toISOString(),
      hashSecret(token)
    );
    if (result.changes === 0) throw new NotFoundException("Subscription link is invalid");
    return { verified: true };
  }

  async unsubscribe(reference: string): Promise<{ unsubscribed: true }> {
    const id = verifySignedReference("status-unsubscribe", reference);
    if (!id) throw new NotFoundException("Unsubscribe link is invalid");
    const result = await this.database.run("DELETE FROM status_subscribers WHERE id = ?", id);
    if (result.changes === 0) throw new NotFoundException("Unsubscribe link is invalid");
    return { unsubscribed: true };
  }

  private rows(where: string, ...parameters: string[]): Promise<StatusPageRow[]> {
    return this.database.all<StatusPageRow>(
      `${this.selectSql()} WHERE ${where} GROUP BY sp.id ORDER BY LOWER(sp.name)`,
      ...parameters
    );
  }

  private selectSql(): string {
    return `SELECT sp.*, COUNT(DISTINCT CASE WHEN ss.verified_at IS NOT NULL
      THEN ss.id END) AS subscriber_count FROM status_pages sp
      LEFT JOIN status_subscribers ss ON ss.status_page_id = sp.id`;
  }

  private async requireRow(teamId: string, id: string): Promise<StatusPageRow> {
    const row = await this.database.get<StatusPageRow>(
      `${this.selectSql()} WHERE sp.team_id = ? AND sp.id = ? GROUP BY sp.id`,
      teamId,
      id
    );
    if (!row) throw new NotFoundException("Status page not found");
    return row;
  }

  private requireSummary(teamId: string, id: string): Promise<StatusPageSummary> {
    return this.requireRow(teamId, id).then((row) => this.map(row));
  }

  private async validateResources(teamId: string, resourceIds: string[]): Promise<string[]> {
    const ids = [...new Set(resourceIds)];
    if (ids.length === 0) throw new BadRequestException("Select at least one resource");
    const placeholders = ids.map(() => "?").join(",");
    const count = (await this.database.get<{ count: number }>(
      `SELECT COUNT(*) AS count FROM resources WHERE team_id = ? AND id IN (${placeholders})`,
      teamId,
      ...ids
    ))!.count;
    if (count !== ids.length) throw new BadRequestException("A resource is unavailable");
    return ids;
  }

  private async replaceResources(pageId: string, resourceIds: string[]): Promise<void> {
    await this.database.run("DELETE FROM status_page_resources WHERE status_page_id = ?", pageId);
    for (const [index, resourceId] of resourceIds.entries()) {
      await this.database.run(
        `INSERT INTO status_page_resources (status_page_id, resource_id, display_order)
         VALUES (?, ?, ?)`,
        pageId,
        resourceId,
        index
      );
    }
  }

  private async resourceIds(pageId: string): Promise<string[]> {
    const rows = await this.database.all<{ resource_id: string }>(
      `SELECT resource_id FROM status_page_resources WHERE status_page_id = ?
         ORDER BY display_order`,
      pageId
    );
    return rows.map((row) => row.resource_id);
  }

  private async components(pageId: string, teamId: string): Promise<StatusPageComponent[]> {
    const rows = await this.database.all<ComponentRow>(
      `${MONITOR_OBSERVATIONS_CTE} SELECT r.id, r.name,
       AVG(CASE WHEN o.status IS NULL THEN NULL WHEN o.status = 'down' THEN 0.0 ELSE 100.0 END) AS uptime_30d
       FROM status_page_resources spr JOIN resources r ON r.id = spr.resource_id
       LEFT JOIN observations o ON o.resource_id = r.id AND o.category = 'availability'
       AND o.observed_at >= ?
       WHERE spr.status_page_id = ? GROUP BY r.id, spr.display_order ORDER BY spr.display_order`,
      new Date(Date.now() - 30 * 86_400_000).toISOString(),
      pageId
    );
    const statuses = await this.health.forResources(
      teamId,
      rows.map((row) => row.id)
    );
    return Promise.all(
      rows.map(async (row) => ({
        id: row.id,
        name: row.name,
        status: statuses.get(row.id) ?? "pending",
        uptime30d: row.uptime_30d,
        dailyUptime: await this.dailyUptime(row.id, 30),
      }))
    );
  }

  private async dailyUptime(resourceId: string, days: number) {
    const from = new Date();
    from.setUTCDate(from.getUTCDate() - days + 1);
    from.setUTCHours(0, 0, 0, 0);
    const rows = await this.database.all<{ date: string; uptime: number }>(
      `${MONITOR_OBSERVATIONS_CTE} SELECT TO_CHAR(observed_at AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS date,
       AVG(CASE WHEN status = 'down' THEN 0.0 ELSE 100.0 END) AS uptime
       FROM observations WHERE resource_id = ? AND category = 'availability' AND observed_at >= ?
       GROUP BY TO_CHAR(observed_at AT TIME ZONE 'UTC', 'YYYY-MM-DD')`,
      resourceId,
      from.toISOString()
    );
    const byDate = new Map(rows.map((row) => [row.date, row.uptime]));
    return Array.from({ length: days }, (_, index) => {
      const date = new Date(from);
      date.setUTCDate(date.getUTCDate() + index);
      const key = date.toISOString().slice(0, 10);
      return { date: key, uptime: byDate.get(key) ?? null };
    });
  }

  private async map(row: StatusPageRow): Promise<StatusPageSummary> {
    return {
      id: row.id,
      teamId: row.team_id,
      name: row.name,
      slug: row.slug,
      published: Boolean(row.published),
      showUptime: Boolean(row.show_uptime),
      resourceIds: await this.resourceIds(row.id),
      subscriberCount: row.subscriber_count,
      createdAt: row.created_at,
    };
  }
}
