import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { Interval } from "@nestjs/schedule";
import {
  appRoutes,
  type IncidentImpact,
  type IncidentResource,
  type IncidentStatus,
  type IncidentSummary,
  type IncidentUpdate,
} from "@mimorii/contracts";
import { randomUUID } from "node:crypto";
import { AuditService } from "../common/audit.service.js";
import { DatabaseService } from "../database/database.service.js";
import { MaintenanceService } from "../maintenance/maintenance.service.js";
import { NotificationsService } from "../notifications/notifications.service.js";
import { TeamAccessService } from "../teams/team-access.service.js";
import type {
  AddIncidentUpdateDto,
  CreateIncidentDto,
  UpdateIncidentDto,
} from "./incidents.dto.js";

interface IncidentRow {
  id: string;
  team_id: string;
  source: "automatic" | "manual";
  check_id: string | null;
  heartbeat_id: string | null;
  title: string;
  impact: IncidentImpact;
  status: IncidentStatus;
  started_at: string;
  acknowledged_at: string | null;
  resolved_at: string | null;
  created_at: string;
  notifications_suppressed: number;
}

interface IncidentUpdateRow {
  id: string;
  incident_id: string;
  status: IncidentStatus;
  message: string;
  created_at: string;
  created_by_name: string | null;
}

interface IncidentResourceRow extends IncidentResource {
  incident_id: string;
}

interface CheckContext {
  id: string;
  team_id: string;
  resource_id: string;
  check_name: string;
  check_type: string;
  resource_name: string;
}

interface CheckTransitionDetails {
  previousStatus: string;
  metrics: Record<string, number | string | boolean | null>;
  latencyMs: number | null;
  statusCode: number | null;
}

interface HeartbeatContext {
  id: string;
  team_id: string;
  resource_id: string;
  heartbeat_name: string;
  resource_name: string;
}

@Injectable()
export class IncidentsService {
  private releasingSuppressedNotifications = false;

  constructor(
    private readonly database: DatabaseService,
    private readonly access: TeamAccessService,
    private readonly maintenance: MaintenanceService,
    private readonly notifications: NotificationsService,
    private readonly audit: AuditService
  ) {}

  @Interval(30_000)
  async releaseEndedMaintenanceSuppressions(): Promise<void> {
    if (
      process.env.MIMORII_SCHEDULER_ENABLED === "false" ||
      this.releasingSuppressedNotifications
    ) {
      return;
    }
    this.releasingSuppressedNotifications = true;
    try {
      const incidents = await this.database.all<{ id: string }>(
        `SELECT id FROM incidents
         WHERE status != 'resolved' AND notifications_suppressed = 1
         ORDER BY started_at LIMIT 50`
      );
      await Promise.all(incidents.map((incident) => this.releaseSuppression(incident.id)));
    } finally {
      this.releasingSuppressedNotifications = false;
    }
  }

  async list(
    userId: string,
    teamId: string,
    options: { status?: "active" | "resolved"; limit?: number } = {}
  ): Promise<IncidentSummary[]> {
    await this.access.require(userId, teamId, "viewer");
    const clauses = ["team_id = ?"];
    if (options.status === "active") clauses.push("status != 'resolved'");
    if (options.status === "resolved") clauses.push("status = 'resolved'");
    const rows = await this.database.all<IncidentRow>(
      `SELECT * FROM incidents WHERE ${clauses.join(" AND ")}
       ORDER BY started_at DESC LIMIT ?`,
      teamId,
      Math.min(Math.max(options.limit ?? 100, 1), 500)
    );
    return this.mapRows(rows);
  }

  async get(userId: string, teamId: string, id: string): Promise<IncidentSummary> {
    await this.access.require(userId, teamId, "viewer");
    return this.map(await this.requireRow(teamId, id));
  }

  async create(userId: string, teamId: string, input: CreateIncidentDto): Promise<IncidentSummary> {
    await this.access.require(userId, teamId, "member");
    const resourceIds = await this.validateResources(teamId, input.resourceIds);
    const id = randomUUID();
    const now = new Date().toISOString();
    const startedAt = input.startedAt ? new Date(input.startedAt).toISOString() : now;
    if (new Date(startedAt).getTime() > Date.now() + 60_000) {
      throw new BadRequestException("Incident start cannot be in the future");
    }
    const status = input.status ?? "investigating";
    await this.database.transaction(async () => {
      await this.database.run(
        `INSERT INTO incidents
         (id, team_id, source, title, impact, status, started_at, acknowledged_at,
          created_by, created_at, updated_at)
         VALUES (?, ?, 'manual', ?, ?, ?, ?, ?, ?, ?, ?)`,
        id,
        teamId,
        input.title.trim(),
        input.impact,
        status,
        startedAt,
        status === "investigating" ? null : now,
        userId,
        now,
        now
      );
      await this.replaceResources(id, resourceIds);
      await this.insertUpdate(id, status, input.message, userId, now);
      await this.notifications.enqueue(teamId, "incident.opened", {
        source: "manual",
        severity: "warning",
        incidentId: id,
        title: input.title.trim(),
        message: input.message.trim(),
        impact: input.impact,
        status,
        resourceIds,
        dedupeKey: `incident:${id}`,
        path: appRoutes.incidents,
        occurredAt: startedAt,
      });
    });
    await this.audit.record({
      teamId,
      userId,
      action: "incident.created",
      subjectType: "incident",
      subjectId: id,
    });
    return this.get(userId, teamId, id);
  }

  async update(
    userId: string,
    teamId: string,
    id: string,
    input: UpdateIncidentDto
  ): Promise<IncidentSummary> {
    await this.access.require(userId, teamId, "member");
    const current = await this.requireRow(teamId, id);
    if (input.status || input.message) {
      throw new BadRequestException("Publish an incident update to change its status");
    }
    const resourceIds = input.resourceIds
      ? await this.validateResources(teamId, input.resourceIds)
      : (await this.resources(id)).map((resource) => resource.id);
    await this.database.transaction(async () => {
      await this.database.run(
        `UPDATE incidents SET title = ?, impact = ?, started_at = ?, updated_at = ?
         WHERE id = ? AND team_id = ?`,
        input.title?.trim() ?? current.title,
        input.impact ?? current.impact,
        input.startedAt ? new Date(input.startedAt).toISOString() : current.started_at,
        new Date().toISOString(),
        id,
        teamId
      );
      await this.replaceResources(id, resourceIds);
    });
    await this.audit.record({
      teamId,
      userId,
      action: "incident.updated",
      subjectType: "incident",
      subjectId: id,
    });
    return this.get(userId, teamId, id);
  }

  async addUpdate(
    userId: string,
    teamId: string,
    id: string,
    input: AddIncidentUpdateDto
  ): Promise<IncidentSummary> {
    await this.access.require(userId, teamId, "member");
    const current = await this.requireRow(teamId, id);
    if (current.status === "resolved")
      throw new BadRequestException("Incident is already resolved");
    const now = new Date().toISOString();
    await this.database.transaction(async () => {
      await this.database.run(
        `UPDATE incidents SET status = ?, acknowledged_at = ?, resolved_at = ?, updated_at = ?
         WHERE id = ? AND team_id = ?`,
        input.status,
        current.acknowledged_at ?? (input.status === "investigating" ? null : now),
        input.status === "resolved" ? now : null,
        now,
        id,
        teamId
      );
      await this.insertUpdate(id, input.status, input.message, userId, now);
      const resourceIds = (await this.resources(id)).map((resource) => resource.id);
      const event = input.status === "resolved" ? "incident.resolved" : "incident.updated";
      await this.notifications.enqueue(teamId, event, {
        source: "manual",
        severity: event === "incident.resolved" ? "info" : "warning",
        incidentId: id,
        title: current.title,
        message: input.message.trim(),
        impact: current.impact,
        status: input.status,
        resourceIds,
        dedupeKey: `incident:${id}`,
        path: appRoutes.incidents,
        occurredAt: now,
      });
    });
    const event = input.status === "resolved" ? "incident.resolved" : "incident.updated";
    await this.audit.record({
      teamId,
      userId,
      action: event,
      subjectType: "incident",
      subjectId: id,
    });
    return this.get(userId, teamId, id);
  }

  async openForCheck(
    checkId: string,
    resultId: string,
    message: string | null,
    startedAt: string,
    details: CheckTransitionDetails
  ): Promise<string | null> {
    const context = await this.checkContext(checkId);
    const existing = await this.database.get(
      "SELECT id FROM incidents WHERE check_id = ? AND status != 'resolved'",
      checkId
    );
    if (existing) return null;
    const id = randomUUID();
    const title = `${context.resource_name}: ${context.check_name}`;
    const updateMessage = message?.trim() || "The check reported an outage.";
    const suppressed = await this.maintenance.suppressesNotifications(
      context.resource_id,
      new Date(startedAt)
    );
    await this.database.transaction(async () => {
      await this.database.run(
        `INSERT INTO incidents
         (id, team_id, source, check_id, title, impact, status, started_at, opening_result_id,
          notifications_suppressed, created_at, updated_at)
         VALUES (?, ?, 'automatic', ?, ?, 'major', 'investigating', ?, ?, ?, ?, ?)`,
        id,
        context.team_id,
        checkId,
        title,
        startedAt,
        resultId,
        suppressed ? 1 : 0,
        startedAt,
        startedAt
      );
      await this.database.run(
        "INSERT INTO incident_resources (incident_id, resource_id) VALUES (?, ?)",
        id,
        context.resource_id
      );
      await this.insertUpdate(id, "investigating", updateMessage, null, startedAt);
      if (!suppressed) {
        await this.notifications.enqueue(context.team_id, "incident.opened", {
          source: "check",
          severity: "warning",
          incidentId: id,
          checkId,
          checkType: context.check_type,
          title,
          message: updateMessage,
          impact: "major",
          status: "investigating",
          previousStatus: details.previousStatus,
          metrics: details.metrics,
          latencyMs: details.latencyMs,
          statusCode: details.statusCode,
          resourceId: context.resource_id,
          resourceIds: [context.resource_id],
          dedupeKey: `check:${checkId}`,
          path: appRoutes.resource(context.resource_id),
          occurredAt: startedAt,
        });
      }
    });
    return id;
  }

  async resolveForCheck(
    checkId: string,
    resultId: string,
    resolvedAt: string,
    details: CheckTransitionDetails
  ): Promise<boolean> {
    const incident = await this.database.get<IncidentRow>(
      `SELECT * FROM incidents WHERE check_id = ? AND status != 'resolved'
       ORDER BY started_at DESC LIMIT 1`,
      checkId
    );
    if (!incident) return false;
    const context = await this.checkContext(checkId);
    await this.database.transaction(async () => {
      await this.database.run(
        `UPDATE incidents SET status = 'resolved', resolved_at = ?, closing_result_id = ?, updated_at = ?
         WHERE id = ?`,
        resolvedAt,
        resultId,
        resolvedAt,
        incident.id
      );
      await this.insertUpdate(incident.id, "resolved", "The check recovered.", null, resolvedAt);
      const resourceIds = (await this.resources(incident.id)).map((resource) => resource.id);
      if (!incident.notifications_suppressed) {
        await this.notifications.enqueue(incident.team_id, "incident.resolved", {
          source: "check",
          severity: "info",
          incidentId: incident.id,
          checkId,
          checkType: context.check_type,
          title: incident.title,
          message: "The check recovered.",
          impact: incident.impact,
          status: "resolved",
          previousStatus: details.previousStatus,
          metrics: details.metrics,
          latencyMs: details.latencyMs,
          statusCode: details.statusCode,
          resourceId: context.resource_id,
          resourceIds,
          dedupeKey: `check:${checkId}`,
          path: appRoutes.resource(context.resource_id),
          occurredAt: resolvedAt,
        });
      }
    });
    return true;
  }

  async openForHeartbeat(
    heartbeatId: string,
    message: string | null,
    startedAt: string
  ): Promise<void> {
    const context = await this.heartbeatContext(heartbeatId);
    const existing = await this.database.get(
      "SELECT id FROM incidents WHERE heartbeat_id = ? AND status != 'resolved'",
      heartbeatId
    );
    if (existing) return;
    const id = randomUUID();
    const title = `${context.resource_name}: ${context.heartbeat_name}`;
    const updateMessage = message?.trim() || "The heartbeat reported a failure.";
    const suppressed = await this.maintenance.suppressesNotifications(
      context.resource_id,
      new Date(startedAt)
    );
    await this.database.transaction(async () => {
      await this.database.run(
        `INSERT INTO incidents
         (id, team_id, source, heartbeat_id, title, impact, status, started_at,
          notifications_suppressed, created_at, updated_at)
         VALUES (?, ?, 'automatic', ?, ?, 'major', 'investigating', ?, ?, ?, ?)`,
        id,
        context.team_id,
        heartbeatId,
        title,
        startedAt,
        suppressed ? 1 : 0,
        startedAt,
        startedAt
      );
      await this.database.run(
        "INSERT INTO incident_resources (incident_id, resource_id) VALUES (?, ?)",
        id,
        context.resource_id
      );
      await this.insertUpdate(id, "investigating", updateMessage, null, startedAt);
      if (!suppressed) {
        await this.notifications.enqueue(context.team_id, "incident.opened", {
          source: "heartbeat",
          severity: "warning",
          incidentId: id,
          heartbeatId,
          title,
          message: updateMessage,
          impact: "major",
          status: "investigating",
          resourceId: context.resource_id,
          resourceIds: [context.resource_id],
          dedupeKey: `heartbeat:${heartbeatId}`,
          path: appRoutes.resource(context.resource_id),
          occurredAt: startedAt,
        });
      }
    });
  }

  async resolveForHeartbeat(
    heartbeatId: string,
    resolvedAt: string,
    message: string
  ): Promise<void> {
    const incident = await this.database.get<IncidentRow>(
      `SELECT * FROM incidents WHERE heartbeat_id = ? AND status != 'resolved'
       ORDER BY started_at DESC LIMIT 1`,
      heartbeatId
    );
    if (!incident) return;
    await this.database.transaction(async () => {
      await this.database.run(
        `UPDATE incidents SET status = 'resolved', resolved_at = ?, updated_at = ? WHERE id = ?`,
        resolvedAt,
        resolvedAt,
        incident.id
      );
      await this.insertUpdate(incident.id, "resolved", message, null, resolvedAt);
      const resourceIds = (await this.resources(incident.id)).map((resource) => resource.id);
      if (!incident.notifications_suppressed) {
        await this.notifications.enqueue(incident.team_id, "incident.resolved", {
          source: "heartbeat",
          severity: "info",
          incidentId: incident.id,
          heartbeatId,
          title: incident.title,
          message,
          impact: incident.impact,
          status: "resolved",
          resourceId: resourceIds[0],
          resourceIds,
          dedupeKey: `heartbeat:${heartbeatId}`,
          path: resourceIds[0] ? appRoutes.resource(resourceIds[0]) : appRoutes.incidents,
          occurredAt: resolvedAt,
        });
      }
    });
  }

  private async releaseSuppression(id: string): Promise<void> {
    await this.database.transaction(async () => {
      const incident = await this.database.get<IncidentRow>(
        `SELECT * FROM incidents WHERE id = ? AND status != 'resolved'
         AND notifications_suppressed = 1 FOR UPDATE`,
        id
      );
      if (!incident) return;
      const resourceIds = (await this.resources(id)).map((resource) => resource.id);
      const stillSuppressed = await this.maintenance.suppressesAnyNotifications(
        resourceIds,
        new Date()
      );
      if (stillSuppressed) return;
      const occurredAt = new Date().toISOString();
      const source = incident.check_id ? "check" : incident.heartbeat_id ? "heartbeat" : "manual";
      const check = incident.check_id
        ? await this.database.get<{ type: string }>(
            "SELECT type FROM checks WHERE id = ?",
            incident.check_id
          )
        : undefined;
      await this.database.run(
        "UPDATE incidents SET notifications_suppressed = 0, updated_at = ? WHERE id = ?",
        occurredAt,
        id
      );
      await this.notifications.enqueue(incident.team_id, "incident.opened", {
        source,
        severity: "warning",
        incidentId: id,
        checkId: incident.check_id,
        checkType: check?.type,
        heartbeatId: incident.heartbeat_id,
        title: incident.title,
        message: "The incident is still active after maintenance.",
        impact: incident.impact,
        status: incident.status,
        resourceId: resourceIds[0],
        resourceIds,
        suppressionEnded: true,
        dedupeKey: incident.check_id
          ? `check:${incident.check_id}`
          : incident.heartbeat_id
            ? `heartbeat:${incident.heartbeat_id}`
            : `incident:${id}`,
        path: resourceIds[0] ? appRoutes.resource(resourceIds[0]) : appRoutes.incidents,
        occurredAt,
      });
    });
  }

  async forResources(resourceIds: string[], resolvedSince: string): Promise<IncidentSummary[]> {
    if (resourceIds.length === 0) return [];
    const placeholders = resourceIds.map(() => "?").join(",");
    const rows = await this.database.all<IncidentRow>(
      `SELECT DISTINCT i.* FROM incidents i
       JOIN incident_resources ir ON ir.incident_id = i.id
       WHERE ir.resource_id IN (${placeholders})
       AND (i.status != 'resolved' OR i.resolved_at >= ?)
       ORDER BY i.started_at DESC LIMIT 100`,
      ...resourceIds,
      resolvedSince
    );
    return this.mapRows(rows);
  }

  private async checkContext(checkId: string): Promise<CheckContext> {
    const row = await this.database.get<CheckContext>(
      `SELECT c.id, c.team_id, c.resource_id, c.name AS check_name, c.type AS check_type,
       r.name AS resource_name
       FROM checks c JOIN resources r ON r.id = c.resource_id WHERE c.id = ?`,
      checkId
    );
    if (!row) throw new NotFoundException("Check not found");
    return row;
  }

  private async heartbeatContext(heartbeatId: string): Promise<HeartbeatContext> {
    const row = await this.database.get<HeartbeatContext>(
      `SELECT hm.id, hm.team_id, hm.resource_id, hm.name AS heartbeat_name,
       r.name AS resource_name FROM heartbeat_monitors hm
       JOIN resources r ON r.id = hm.resource_id WHERE hm.id = ?`,
      heartbeatId
    );
    if (!row) throw new NotFoundException("Heartbeat monitor not found");
    return row;
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

  private async requireRow(teamId: string, id: string): Promise<IncidentRow> {
    const row = await this.database.get<IncidentRow>(
      "SELECT * FROM incidents WHERE id = ? AND team_id = ?",
      id,
      teamId
    );
    if (!row) throw new NotFoundException("Incident not found");
    return row;
  }

  private async replaceResources(incidentId: string, resourceIds: string[]): Promise<void> {
    await this.database.run("DELETE FROM incident_resources WHERE incident_id = ?", incidentId);
    for (const resourceId of resourceIds) {
      await this.database.run(
        "INSERT INTO incident_resources (incident_id, resource_id) VALUES (?, ?)",
        incidentId,
        resourceId
      );
    }
  }

  private async insertUpdate(
    incidentId: string,
    status: IncidentStatus,
    message: string,
    userId: string | null,
    createdAt: string
  ): Promise<void> {
    await this.database.run(
      `INSERT INTO incident_updates (id, incident_id, status, message, created_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      randomUUID(),
      incidentId,
      status,
      message.trim().slice(0, 2_000),
      userId,
      createdAt
    );
  }

  private resources(id: string): Promise<IncidentResource[]> {
    return this.database.all<IncidentResource>(
      `SELECT r.id, r.name FROM resources r JOIN incident_resources ir ON ir.resource_id = r.id
       WHERE ir.incident_id = ? ORDER BY LOWER(r.name)`,
      id
    );
  }

  private async updates(id: string): Promise<IncidentUpdate[]> {
    return (
      await this.database.all<IncidentUpdateRow>(
        `SELECT iu.*, u.name AS created_by_name FROM incident_updates iu
         LEFT JOIN users u ON u.id = iu.created_by WHERE iu.incident_id = ?
         ORDER BY iu.created_at DESC`,
        id
      )
    ).map((row) => this.mapUpdate(row));
  }

  private async map(row: IncidentRow): Promise<IncidentSummary> {
    const mappedAt = Date.now();
    const [resources, updates] = await Promise.all([this.resources(row.id), this.updates(row.id)]);
    return this.mapSummary(row, resources, updates, mappedAt);
  }

  private async mapRows(rows: IncidentRow[]): Promise<IncidentSummary[]> {
    if (rows.length === 0) return [];
    const mappedAt = Date.now();
    const ids = rows.map((row) => row.id);
    const placeholders = ids.map(() => "?").join(",");
    const [resourceRows, updateRows] = await Promise.all([
      this.database.all<IncidentResourceRow>(
        `SELECT ir.incident_id, r.id, r.name FROM resources r
         JOIN incident_resources ir ON ir.resource_id = r.id
         WHERE ir.incident_id IN (${placeholders})
         ORDER BY ir.incident_id, LOWER(r.name)`,
        ...ids
      ),
      this.database.all<IncidentUpdateRow>(
        `SELECT iu.*, u.name AS created_by_name FROM incident_updates iu
         LEFT JOIN users u ON u.id = iu.created_by
         WHERE iu.incident_id IN (${placeholders})
         ORDER BY iu.incident_id, iu.created_at DESC`,
        ...ids
      ),
    ]);
    const resources = new Map<string, IncidentResource[]>(ids.map((id) => [id, []]));
    const updates = new Map<string, IncidentUpdate[]>(ids.map((id) => [id, []]));
    for (const resource of resourceRows) {
      resources.get(resource.incident_id)?.push({ id: resource.id, name: resource.name });
    }
    for (const update of updateRows) {
      updates.get(update.incident_id)?.push(this.mapUpdate(update));
    }
    return rows.map((row) =>
      this.mapSummary(row, resources.get(row.id) ?? [], updates.get(row.id) ?? [], mappedAt)
    );
  }

  private mapSummary(
    row: IncidentRow,
    resources: IncidentResource[],
    updates: IncidentUpdate[],
    mappedAt: number
  ): IncidentSummary {
    const end = row.resolved_at ? new Date(row.resolved_at).getTime() : mappedAt;
    return {
      id: row.id,
      teamId: row.team_id,
      source: row.source,
      checkId: row.check_id,
      heartbeatId: row.heartbeat_id,
      title: row.title,
      impact: row.impact,
      status: row.status,
      startedAt: row.started_at,
      acknowledgedAt: row.acknowledged_at,
      resolvedAt: row.resolved_at,
      durationSeconds: Math.max(0, Math.floor((end - new Date(row.started_at).getTime()) / 1_000)),
      resources,
      updates,
    };
  }

  private mapUpdate(row: IncidentUpdateRow): IncidentUpdate {
    return {
      id: row.id,
      incidentId: row.incident_id,
      status: row.status,
      message: row.message,
      createdByName: row.created_by_name,
      createdAt: row.created_at,
    };
  }
}
