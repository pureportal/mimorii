import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { Interval } from "@nestjs/schedule";
import { appRoutes, type ServiceLevelObjectiveSummary } from "@mimorii/contracts";
import { randomUUID } from "node:crypto";
import { AuditService } from "../common/audit.service.js";
import { MONITOR_OBSERVATIONS_CTE } from "../common/monitor-observations.js";
import { DatabaseService } from "../database/database.service.js";
import { NotificationsService } from "../notifications/notifications.service.js";
import { TeamAccessService } from "../teams/team-access.service.js";
import type { CreateObjectiveDto, UpdateObjectiveDto } from "./objectives.dto.js";

interface ObjectiveRow {
  id: string;
  team_id: string;
  resource_id: string | null;
  check_id: string | null;
  name: string;
  target_percent: number;
  window_days: 7 | 30 | 90;
  latency_target_ms: number | null;
  breach_state: ServiceLevelObjectiveSummary["status"];
  created_at: string;
  resource_name: string | null;
  check_name: string | null;
}

@Injectable()
export class ObjectivesService {
  private evaluating = false;

  constructor(
    private readonly database: DatabaseService,
    private readonly access: TeamAccessService,
    private readonly notifications: NotificationsService,
    private readonly audit: AuditService
  ) {}

  async list(userId: string, teamId: string): Promise<ServiceLevelObjectiveSummary[]> {
    await this.access.require(userId, teamId, "viewer");
    const rows = await this.rows("slo.team_id = ?", teamId);
    return Promise.all(rows.map((row) => this.calculate(row)));
  }

  async create(
    userId: string,
    teamId: string,
    input: CreateObjectiveDto
  ): Promise<ServiceLevelObjectiveSummary> {
    await this.access.require(userId, teamId, "admin");
    const scope = await this.validateScope(teamId, input.resourceId ?? null, input.checkId ?? null);
    const id = randomUUID();
    const now = new Date().toISOString();
    await this.database.run(
      `INSERT INTO service_level_objectives
       (id, team_id, resource_id, check_id, name, target_percent, window_days,
        latency_target_ms, created_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      id,
      teamId,
      scope.resourceId,
      scope.checkId,
      input.name.trim(),
      input.targetPercent,
      input.windowDays,
      input.latencyTargetMs ?? null,
      userId,
      now,
      now
    );
    await this.audit.record({
      teamId,
      userId,
      action: "objective.created",
      subjectType: "objective",
      subjectId: id,
    });
    return this.calculate(await this.requireRow(teamId, id));
  }

  async update(
    userId: string,
    teamId: string,
    id: string,
    input: UpdateObjectiveDto
  ): Promise<ServiceLevelObjectiveSummary> {
    await this.access.require(userId, teamId, "admin");
    const current = await this.requireRow(teamId, id);
    const scope = await this.validateScope(
      teamId,
      input.resourceId === undefined ? current.resource_id : input.resourceId,
      input.checkId === undefined ? current.check_id : input.checkId
    );
    await this.database.run(
      `UPDATE service_level_objectives SET resource_id = ?, check_id = ?, name = ?,
       target_percent = ?, window_days = ?, latency_target_ms = ?, updated_at = ?
       WHERE id = ? AND team_id = ?`,
      scope.resourceId,
      scope.checkId,
      input.name?.trim() ?? current.name,
      input.targetPercent ?? current.target_percent,
      input.windowDays ?? current.window_days,
      input.latencyTargetMs === undefined ? current.latency_target_ms : input.latencyTargetMs,
      new Date().toISOString(),
      id,
      teamId
    );
    await this.audit.record({
      teamId,
      userId,
      action: "objective.updated",
      subjectType: "objective",
      subjectId: id,
    });
    return this.calculate(await this.requireRow(teamId, id));
  }

  async remove(userId: string, teamId: string, id: string): Promise<void> {
    await this.access.require(userId, teamId, "admin");
    const result = await this.database.run(
      "DELETE FROM service_level_objectives WHERE id = ? AND team_id = ?",
      id,
      teamId
    );
    if (result.changes === 0) throw new NotFoundException("Objective not found");
    await this.audit.record({
      teamId,
      userId,
      action: "objective.deleted",
      subjectType: "objective",
      subjectId: id,
    });
  }

  @Interval(60_000)
  async evaluate(): Promise<void> {
    if (process.env.MIMORII_SCHEDULER_ENABLED === "false" || this.evaluating) return;
    this.evaluating = true;
    try {
      const rows = await this.rows("1 = 1");
      for (const row of rows) {
        await this.evaluateRow(row.id);
      }
    } finally {
      this.evaluating = false;
    }
  }

  private async evaluateRow(id: string): Promise<void> {
    await this.database.transaction(async () => {
      const row = await this.database.get<ObjectiveRow>(
        `SELECT slo.*, r.name AS resource_name, c.name AS check_name
         FROM service_level_objectives slo
         LEFT JOIN resources r ON r.id = slo.resource_id
         LEFT JOIN checks c ON c.id = slo.check_id
         WHERE slo.id = ? FOR UPDATE OF slo`,
        id
      );
      if (!row) return;
      const objective = await this.calculate(row);
      const evaluatedAt = new Date().toISOString();
      if (objective.status === "breached" && row.breach_state !== "breached") {
        await this.notifications.enqueue(row.team_id, "slo.breached", {
          source: "objective",
          severity: "warning",
          objectiveId: row.id,
          title: `${row.name} breached`,
          message: `${objective.availabilityPercent?.toFixed(3) ?? "No"}% availability`,
          resourceIds: row.resource_id ? [row.resource_id] : [],
          resourceId: row.resource_id,
          dedupeKey: `objective:${row.id}`,
          path: appRoutes.serviceGoals,
          occurredAt: evaluatedAt,
        });
      }
      await this.database.run(
        `UPDATE service_level_objectives SET breach_state = ?, last_evaluated_at = ? WHERE id = ?`,
        objective.status,
        evaluatedAt,
        row.id
      );
    });
  }

  private async validateScope(teamId: string, resourceId: string | null, checkId: string | null) {
    if (!resourceId && !checkId) throw new BadRequestException("Select a resource or check");
    if (checkId) {
      const check = await this.database.get<{ resource_id: string }>(
        "SELECT resource_id FROM checks WHERE id = ? AND team_id = ?",
        checkId,
        teamId
      );
      if (!check) throw new BadRequestException("Check is unavailable");
      if (resourceId && resourceId !== check.resource_id) {
        throw new BadRequestException("Check does not belong to the selected resource");
      }
      return { resourceId: resourceId ?? check.resource_id, checkId };
    }
    if (
      !(await this.database.get(
        "SELECT id FROM resources WHERE id = ? AND team_id = ?",
        resourceId,
        teamId
      ))
    ) {
      throw new BadRequestException("Resource is unavailable");
    }
    return { resourceId, checkId: null };
  }

  private rows(where: string, ...parameters: string[]): Promise<ObjectiveRow[]> {
    return this.database.all<ObjectiveRow>(
      `SELECT slo.*, r.name AS resource_name, c.name AS check_name
       FROM service_level_objectives slo
       LEFT JOIN resources r ON r.id = slo.resource_id
       LEFT JOIN checks c ON c.id = slo.check_id
       WHERE ${where} ORDER BY LOWER(slo.name)`,
      ...parameters
    );
  }

  private async requireRow(teamId: string, id: string): Promise<ObjectiveRow> {
    const row = await this.database.get<ObjectiveRow>(
      `SELECT slo.*, r.name AS resource_name, c.name AS check_name
       FROM service_level_objectives slo
       LEFT JOIN resources r ON r.id = slo.resource_id
       LEFT JOIN checks c ON c.id = slo.check_id
       WHERE slo.team_id = ? AND slo.id = ?`,
      teamId,
      id
    );
    if (!row) throw new NotFoundException("Objective not found");
    return row;
  }

  private async calculate(row: ObjectiveRow): Promise<ServiceLevelObjectiveSummary> {
    const from = new Date(Date.now() - row.window_days * 86_400_000).toISOString();
    const scope = row.check_id ? "o.check_id = ?" : "o.resource_id = ?";
    const scopeId = row.check_id ?? row.resource_id!;
    const availability = (await this.database.get<{
      total: number;
      availability: number | null;
      down: number;
    }>(
      `${MONITOR_OBSERVATIONS_CTE} SELECT COUNT(*) AS total,
       AVG(CASE WHEN o.status = 'down' THEN 0.0 ELSE 100.0 END) AS availability,
       SUM(CASE WHEN o.status = 'down' THEN 1 ELSE 0 END) AS down
       FROM observations o WHERE ${scope} AND o.observed_at >= ?`,
      scopeId,
      from
    ))!;
    const latencyP95 = (
      await this.database.get<{ latency: number }>(
        `${MONITOR_OBSERVATIONS_CTE}, ordered AS (
         SELECT o.latency_ms AS latency,
          ROW_NUMBER() OVER (ORDER BY o.latency_ms) AS position,
          COUNT(*) OVER () AS total
         FROM observations o
         WHERE ${scope} AND o.observed_at >= ? AND o.latency_ms IS NOT NULL AND o.status != 'down'
       ) SELECT latency FROM ordered WHERE position >= total * 0.95 ORDER BY position LIMIT 1`,
        scopeId,
        from
      )
    )?.latency;
    const windowMinutes = row.window_days * 24 * 60;
    const errorBudgetMinutes = windowMinutes * (1 - row.target_percent / 100);
    const availabilityPercent = availability.availability;
    const consumedBudgetMinutes =
      availabilityPercent === null ? 0 : windowMinutes * (1 - availabilityPercent / 100);
    const remainingBudgetMinutes = errorBudgetMinutes - consumedBudgetMinutes;
    const burnRate = errorBudgetMinutes > 0 ? consumedBudgetMinutes / errorBudgetMinutes : 0;
    const latencyBreached =
      row.latency_target_ms !== null &&
      latencyP95 !== undefined &&
      latencyP95 > row.latency_target_ms;
    const status =
      availability.total === 0
        ? "no-data"
        : remainingBudgetMinutes < 0 || latencyBreached
          ? "breached"
          : burnRate >= 0.8
            ? "at-risk"
            : "met";
    return {
      id: row.id,
      teamId: row.team_id,
      resourceId: row.resource_id,
      resourceName: row.resource_name,
      checkId: row.check_id,
      checkName: row.check_name,
      name: row.name,
      targetPercent: row.target_percent,
      windowDays: row.window_days,
      latencyTargetMs: row.latency_target_ms,
      availabilityPercent,
      latencyP95Ms: latencyP95 ?? null,
      errorBudgetMinutes,
      consumedBudgetMinutes,
      remainingBudgetMinutes,
      burnRate,
      status,
      createdAt: row.created_at,
    };
  }
}
