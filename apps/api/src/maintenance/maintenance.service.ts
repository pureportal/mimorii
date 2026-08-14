import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { Interval } from "@nestjs/schedule";
import {
  appRoutes,
  type IncidentResource,
  type MaintenanceRecurrence,
  type MaintenanceWindowSummary,
} from "@mimorii/contracts";
import { randomUUID } from "node:crypto";
import { AuditService } from "../common/audit.service.js";
import { DatabaseService } from "../database/database.service.js";
import { TeamAccessService } from "../teams/team-access.service.js";
import { NotificationsService } from "../notifications/notifications.service.js";
import type { CreateMaintenanceDto, UpdateMaintenanceDto } from "./maintenance.dto.js";

interface MaintenanceRow {
  id: string;
  team_id: string;
  name: string;
  starts_at: string;
  ends_at: string;
  recurrence: MaintenanceRecurrence;
  recurrence_until: string | null;
  suppress_notifications: number;
  cancelled_at: string | null;
  created_at: string;
}

interface Occurrence {
  startsAt: string;
  endsAt: string;
}

@Injectable()
export class MaintenanceService {
  constructor(
    private readonly database: DatabaseService,
    private readonly access: TeamAccessService,
    private readonly notifications: NotificationsService,
    private readonly audit: AuditService
  ) {}

  async list(userId: string, teamId: string): Promise<MaintenanceWindowSummary[]> {
    await this.access.require(userId, teamId, "viewer");
    const rows = await this.rows(teamId);
    return Promise.all(rows.map((row) => this.map(row)));
  }

  async get(userId: string, teamId: string, id: string): Promise<MaintenanceWindowSummary> {
    await this.access.require(userId, teamId, "viewer");
    return this.map(await this.requireRow(teamId, id));
  }

  async create(
    userId: string,
    teamId: string,
    input: CreateMaintenanceDto
  ): Promise<MaintenanceWindowSummary> {
    await this.access.require(userId, teamId, "member");
    const values = await this.validate(teamId, input);
    const id = randomUUID();
    const now = new Date().toISOString();
    await this.database.transaction(async () => {
      await this.database.run(
        `INSERT INTO maintenance_windows
         (id, team_id, name, starts_at, ends_at, recurrence, recurrence_until,
          suppress_notifications, created_by, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        id,
        teamId,
        input.name.trim(),
        values.startsAt,
        values.endsAt,
        values.recurrence,
        values.recurrenceUntil,
        input.suppressNotifications === false ? 0 : 1,
        userId,
        now,
        now
      );
      await this.replaceResources(id, values.resourceIds);
    });
    await this.audit.record({
      teamId,
      userId,
      action: "maintenance.created",
      subjectType: "maintenance",
      subjectId: id,
    });
    return this.get(userId, teamId, id);
  }

  async update(
    userId: string,
    teamId: string,
    id: string,
    input: UpdateMaintenanceDto
  ): Promise<MaintenanceWindowSummary> {
    await this.access.require(userId, teamId, "member");
    const current = await this.requireRow(teamId, id);
    if (current.cancelled_at)
      throw new BadRequestException("Cancelled maintenance cannot be edited");
    const currentResources = (await this.resources(id)).map((resource) => resource.id);
    const values = await this.validate(teamId, {
      name: input.name ?? current.name,
      startsAt: input.startsAt ?? current.starts_at,
      endsAt: input.endsAt ?? current.ends_at,
      recurrence: input.recurrence ?? current.recurrence,
      recurrenceUntil:
        input.recurrenceUntil === undefined ? current.recurrence_until : input.recurrenceUntil,
      suppressNotifications: input.suppressNotifications ?? Boolean(current.suppress_notifications),
      resourceIds: input.resourceIds ?? currentResources,
    });
    await this.database.transaction(async () => {
      await this.database.run(
        `UPDATE maintenance_windows SET name = ?, starts_at = ?, ends_at = ?, recurrence = ?,
         recurrence_until = ?, suppress_notifications = ?, updated_at = ?
         WHERE id = ? AND team_id = ?`,
        (input.name ?? current.name).trim(),
        values.startsAt,
        values.endsAt,
        values.recurrence,
        values.recurrenceUntil,
        (input.suppressNotifications ?? Boolean(current.suppress_notifications)) ? 1 : 0,
        new Date().toISOString(),
        id,
        teamId
      );
      await this.replaceResources(id, values.resourceIds);
    });
    await this.audit.record({
      teamId,
      userId,
      action: "maintenance.updated",
      subjectType: "maintenance",
      subjectId: id,
    });
    return this.get(userId, teamId, id);
  }

  async cancel(userId: string, teamId: string, id: string): Promise<MaintenanceWindowSummary> {
    await this.access.require(userId, teamId, "member");
    await this.requireRow(teamId, id);
    const now = new Date().toISOString();
    await this.database.run(
      "UPDATE maintenance_windows SET cancelled_at = ?, updated_at = ? WHERE id = ? AND team_id = ?",
      now,
      now,
      id,
      teamId
    );
    await this.audit.record({
      teamId,
      userId,
      action: "maintenance.cancelled",
      subjectType: "maintenance",
      subjectId: id,
    });
    return this.get(userId, teamId, id);
  }

  async remove(userId: string, teamId: string, id: string): Promise<void> {
    await this.access.require(userId, teamId, "admin");
    const result = await this.database.run(
      "DELETE FROM maintenance_windows WHERE id = ? AND team_id = ?",
      id,
      teamId
    );
    if (result.changes === 0) throw new NotFoundException("Maintenance window not found");
    await this.audit.record({
      teamId,
      userId,
      action: "maintenance.deleted",
      subjectType: "maintenance",
      subjectId: id,
    });
  }

  async isResourceActive(resourceId: string, at = new Date()): Promise<boolean> {
    const rows = await this.database.all<MaintenanceRow>(
      `SELECT mw.* FROM maintenance_windows mw
         JOIN maintenance_resources mr ON mr.maintenance_id = mw.id
         WHERE mr.resource_id = ? AND mw.cancelled_at IS NULL`,
      resourceId
    );
    return rows.some((row) => Boolean(this.currentOccurrence(row, at)));
  }

  async suppressesNotifications(resourceId: string, at = new Date()): Promise<boolean> {
    const rows = await this.database.all<MaintenanceRow>(
      `SELECT mw.* FROM maintenance_windows mw
         JOIN maintenance_resources mr ON mr.maintenance_id = mw.id
         WHERE mr.resource_id = ? AND mw.cancelled_at IS NULL AND mw.suppress_notifications = 1`,
      resourceId
    );
    return rows.some((row) => Boolean(this.currentOccurrence(row, at)));
  }

  async activeForResources(
    resourceIds: string[],
    at = new Date()
  ): Promise<MaintenanceWindowSummary[]> {
    if (resourceIds.length === 0) return [];
    const placeholders = resourceIds.map(() => "?").join(",");
    const rows = await this.database.all<MaintenanceRow>(
      `SELECT DISTINCT mw.* FROM maintenance_windows mw
       JOIN maintenance_resources mr ON mr.maintenance_id = mw.id
       WHERE mr.resource_id IN (${placeholders}) AND mw.cancelled_at IS NULL`,
      ...resourceIds
    );
    return Promise.all(
      rows.filter((row) => this.currentOccurrence(row, at)).map((row) => this.map(row, at))
    );
  }

  async visibleForResources(
    resourceIds: string[],
    until: Date,
    at = new Date()
  ): Promise<MaintenanceWindowSummary[]> {
    if (resourceIds.length === 0) return [];
    const placeholders = resourceIds.map(() => "?").join(",");
    const rows = await this.database.all<MaintenanceRow>(
      `SELECT DISTINCT mw.* FROM maintenance_windows mw
         JOIN maintenance_resources mr ON mr.maintenance_id = mw.id
         WHERE mr.resource_id IN (${placeholders}) AND mw.cancelled_at IS NULL`,
      ...resourceIds
    );
    const summaries = await Promise.all(rows.map((row) => this.map(row, at)));
    return summaries.filter(
      (window) =>
        window.status === "active" ||
        (window.status === "scheduled" &&
          window.nextStartsAt !== null &&
          new Date(window.nextStartsAt) <= until)
    );
  }

  currentOccurrence(row: MaintenanceRow, at = new Date()): Occurrence | null {
    return this.occurrences(row, at).current;
  }

  @Interval(30_000)
  async emitLifecycleEvents(): Promise<void> {
    if (process.env.MIMORII_SCHEDULER_ENABLED === "false") return;
    const at = new Date();
    const rows = await this.database.all<MaintenanceRow>(
      "SELECT * FROM maintenance_windows WHERE cancelled_at IS NULL"
    );
    for (const row of rows) {
      const current = this.currentOccurrence(row, at);
      if (current) await this.emitOccurrence(row, current, "started");
      const previous = this.latestCompletedOccurrence(row, at);
      if (previous) await this.emitOccurrence(row, previous, "completed");
    }
  }

  private rows(teamId: string): Promise<MaintenanceRow[]> {
    return this.database.all<MaintenanceRow>(
      "SELECT * FROM maintenance_windows WHERE team_id = ? ORDER BY starts_at DESC",
      teamId
    );
  }

  private async requireRow(teamId: string, id: string): Promise<MaintenanceRow> {
    const row = await this.database.get<MaintenanceRow>(
      "SELECT * FROM maintenance_windows WHERE id = ? AND team_id = ?",
      id,
      teamId
    );
    if (!row) throw new NotFoundException("Maintenance window not found");
    return row;
  }

  private async validate(teamId: string, input: CreateMaintenanceDto) {
    const starts = new Date(input.startsAt);
    const ends = new Date(input.endsAt);
    if (ends <= starts) throw new BadRequestException("End time must be after start time");
    if (ends.getTime() - starts.getTime() > 31 * 24 * 60 * 60 * 1000) {
      throw new BadRequestException("A maintenance occurrence cannot exceed 31 days");
    }
    const recurrence = input.recurrence ?? "none";
    const recurrenceUntil = input.recurrenceUntil
      ? new Date(input.recurrenceUntil).toISOString()
      : null;
    if (recurrenceUntil && new Date(recurrenceUntil) <= starts) {
      throw new BadRequestException("Recurrence end must be after the first occurrence");
    }
    const resourceIds = [...new Set(input.resourceIds)];
    if (resourceIds.length === 0) throw new BadRequestException("Select at least one resource");
    const placeholders = resourceIds.map(() => "?").join(",");
    const count = (await this.database.get<{ count: number }>(
      `SELECT COUNT(*) AS count FROM resources WHERE team_id = ? AND id IN (${placeholders})`,
      teamId,
      ...resourceIds
    ))!.count;
    if (count !== resourceIds.length) throw new BadRequestException("A resource is unavailable");
    return {
      startsAt: starts.toISOString(),
      endsAt: ends.toISOString(),
      recurrence,
      recurrenceUntil,
      resourceIds,
    };
  }

  private async replaceResources(id: string, resourceIds: string[]): Promise<void> {
    await this.database.run("DELETE FROM maintenance_resources WHERE maintenance_id = ?", id);
    for (const resourceId of resourceIds) {
      await this.database.run(
        "INSERT INTO maintenance_resources (maintenance_id, resource_id) VALUES (?, ?)",
        id,
        resourceId
      );
    }
  }

  private resources(id: string): Promise<IncidentResource[]> {
    return this.database.all<IncidentResource>(
      `SELECT r.id, r.name FROM resources r JOIN maintenance_resources mr ON mr.resource_id = r.id
       WHERE mr.maintenance_id = ? ORDER BY LOWER(r.name)`,
      id
    );
  }

  private async map(row: MaintenanceRow, at = new Date()): Promise<MaintenanceWindowSummary> {
    const occurrences = this.occurrences(row, at);
    const status = row.cancelled_at
      ? "cancelled"
      : occurrences.current
        ? "active"
        : occurrences.next
          ? "scheduled"
          : "completed";
    return {
      id: row.id,
      teamId: row.team_id,
      name: row.name,
      startsAt: row.starts_at,
      endsAt: row.ends_at,
      recurrence: row.recurrence,
      recurrenceUntil: row.recurrence_until,
      status,
      nextStartsAt: occurrences.current?.startsAt ?? occurrences.next?.startsAt ?? null,
      nextEndsAt: occurrences.current?.endsAt ?? occurrences.next?.endsAt ?? null,
      suppressNotifications: Boolean(row.suppress_notifications),
      resources: await this.resources(row.id),
      createdAt: row.created_at,
    };
  }

  private occurrences(
    row: MaintenanceRow,
    at: Date
  ): { current: Occurrence | null; next: Occurrence | null } {
    if (row.cancelled_at) return { current: null, next: null };
    const firstStart = new Date(row.starts_at);
    const duration = new Date(row.ends_at).getTime() - firstStart.getTime();
    const recurrenceUntil = row.recurrence_until ? new Date(row.recurrence_until).getTime() : null;
    if (row.recurrence === "none") {
      const occurrence = { startsAt: row.starts_at, endsAt: row.ends_at };
      if (at >= firstStart && at.getTime() < firstStart.getTime() + duration) {
        return { current: occurrence, next: null };
      }
      return { current: null, next: at < firstStart ? occurrence : null };
    }

    const approximateIndex = this.occurrenceIndex(firstStart, at, row.recurrence);
    for (let offset = -1; offset <= 2; offset += 1) {
      const index = Math.max(0, approximateIndex + offset);
      const start = this.addRecurrence(firstStart, row.recurrence, index);
      if (recurrenceUntil !== null && start.getTime() > recurrenceUntil) continue;
      const end = new Date(start.getTime() + duration);
      if (at >= start && at < end) {
        return {
          current: { startsAt: start.toISOString(), endsAt: end.toISOString() },
          next: null,
        };
      }
      if (start > at) {
        return {
          current: null,
          next: { startsAt: start.toISOString(), endsAt: end.toISOString() },
        };
      }
    }
    return { current: null, next: null };
  }

  private latestCompletedOccurrence(row: MaintenanceRow, at: Date): Occurrence | null {
    const firstStart = new Date(row.starts_at);
    const duration = new Date(row.ends_at).getTime() - firstStart.getTime();
    if (row.recurrence === "none") {
      return at.getTime() >= firstStart.getTime() + duration &&
        at.getTime() - (firstStart.getTime() + duration) <= 90_000
        ? { startsAt: row.starts_at, endsAt: row.ends_at }
        : null;
    }
    const index = this.occurrenceIndex(firstStart, at, row.recurrence);
    for (let offset = 0; offset >= -1; offset -= 1) {
      const candidateIndex = index + offset;
      if (candidateIndex < 0) continue;
      const start = this.addRecurrence(firstStart, row.recurrence, candidateIndex);
      if (row.recurrence_until && start > new Date(row.recurrence_until)) continue;
      const end = new Date(start.getTime() + duration);
      if (end <= at && at.getTime() - end.getTime() <= 90_000) {
        return { startsAt: start.toISOString(), endsAt: end.toISOString() };
      }
    }
    return null;
  }

  private async emitOccurrence(
    row: MaintenanceRow,
    occurrence: Occurrence,
    event: "started" | "completed"
  ): Promise<void> {
    await this.database.transaction(async () => {
      const created = await this.database.run(
        `INSERT INTO maintenance_occurrence_events
         (maintenance_id, occurrence_start, event, created_at) VALUES (?, ?, ?, ?)
         ON CONFLICT (maintenance_id, occurrence_start, event) DO NOTHING`,
        row.id,
        occurrence.startsAt,
        event,
        new Date().toISOString()
      );
      if (created.changes === 0) return;
      const resourceIds = (await this.resources(row.id)).map((resource) => resource.id);
      await this.notifications.enqueue(row.team_id, `maintenance.${event}`, {
        source: "maintenance",
        severity: "info",
        maintenanceId: row.id,
        title: row.name,
        resourceIds,
        resourceId: resourceIds[0],
        dedupeKey: `maintenance:${row.id}`,
        path: appRoutes.maintenance,
        startsAt: occurrence.startsAt,
        endsAt: occurrence.endsAt,
        occurredAt: event === "started" ? occurrence.startsAt : occurrence.endsAt,
      });
    });
  }

  private occurrenceIndex(start: Date, at: Date, recurrence: MaintenanceRecurrence): number {
    if (at <= start) return 0;
    if (recurrence === "monthly") {
      return Math.max(
        0,
        (at.getUTCFullYear() - start.getUTCFullYear()) * 12 + at.getUTCMonth() - start.getUTCMonth()
      );
    }
    const period = recurrence === "daily" ? 86_400_000 : 7 * 86_400_000;
    return Math.max(0, Math.floor((at.getTime() - start.getTime()) / period));
  }

  private addRecurrence(start: Date, recurrence: MaintenanceRecurrence, index: number): Date {
    if (recurrence === "monthly") {
      const targetMonth = start.getUTCMonth() + index;
      const targetYear = start.getUTCFullYear() + Math.floor(targetMonth / 12);
      const normalizedMonth = ((targetMonth % 12) + 12) % 12;
      const lastDay = new Date(Date.UTC(targetYear, normalizedMonth + 1, 0)).getUTCDate();
      return new Date(
        Date.UTC(
          targetYear,
          normalizedMonth,
          Math.min(start.getUTCDate(), lastDay),
          start.getUTCHours(),
          start.getUTCMinutes(),
          start.getUTCSeconds(),
          start.getUTCMilliseconds()
        )
      );
    }
    const period = recurrence === "daily" ? 86_400_000 : 7 * 86_400_000;
    return new Date(start.getTime() + index * period);
  }
}
