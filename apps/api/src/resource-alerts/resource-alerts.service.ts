import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type {
  ResourceAlertMetric,
  ResourceAlertOperator,
  ResourceAlertRuleSummary,
  AgentKind,
} from "@mimorii/contracts";
import { randomUUID } from "node:crypto";
import { AuditService } from "../common/audit.service.js";
import { DatabaseService } from "../database/database.service.js";
import { NotificationsService } from "../notifications/notifications.service.js";
import { TeamAccessService } from "../teams/team-access.service.js";
import type { CreateResourceAlertDto, UpdateResourceAlertDto } from "./resource-alerts.dto.js";

interface AlertRow {
  id: string;
  team_id: string;
  resource_id: string;
  resource_name?: string;
  name: string;
  metric: ResourceAlertMetric;
  operator: ResourceAlertOperator;
  threshold_json: number | boolean | string;
  recovery_threshold_json: number | boolean | string | null;
  required_samples: number;
  enabled: boolean | number;
  active: boolean | number;
  consecutive_matches: number;
  consecutive_recoveries: number;
  last_evaluated_at: string | null;
  triggered_at: string | null;
  created_at: string;
}

@Injectable()
export class ResourceAlertsService {
  constructor(
    private readonly database: DatabaseService,
    private readonly access: TeamAccessService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService
  ) {}

  async list(
    userId: string,
    teamId: string,
    resourceId: string
  ): Promise<ResourceAlertRuleSummary[]> {
    await this.requireResource(userId, teamId, resourceId, "viewer");
    const rows = await this.database.all<AlertRow>(
      `SELECT * FROM resource_alert_rules WHERE team_id = ? AND resource_id = ?
       ORDER BY LOWER(name)`,
      teamId,
      resourceId
    );
    return rows.map((row) => this.map(row));
  }

  async create(
    userId: string,
    teamId: string,
    resourceId: string,
    input: CreateResourceAlertDto
  ): Promise<ResourceAlertRuleSummary> {
    const resource = await this.requireResource(userId, teamId, resourceId, "admin");
    this.validateResourceMetric(input.metric, resource.agent_kind);
    this.validate(input.metric, input.operator, input.threshold, input.recoveryThreshold ?? null);
    const id = randomUUID();
    const now = new Date().toISOString();
    await this.database.run(
      `INSERT INTO resource_alert_rules
       (id, team_id, resource_id, name, metric, operator, threshold_json,
        recovery_threshold_json, required_samples, enabled, created_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?::jsonb, ?::jsonb, ?, ?, ?, ?, ?)`,
      id,
      teamId,
      resourceId,
      input.name.trim(),
      input.metric,
      input.operator,
      JSON.stringify(input.threshold),
      input.recoveryThreshold === undefined || input.recoveryThreshold === null
        ? null
        : JSON.stringify(input.recoveryThreshold),
      input.requiredSamples ?? 1,
      input.enabled ?? true,
      userId,
      now,
      now
    );
    await this.audit.record({
      teamId,
      userId,
      action: "resource_alert.created",
      subjectType: "resource_alert",
      subjectId: id,
      metadata: { resourceId },
    });
    return this.map(await this.requireRow(teamId, resourceId, id));
  }

  async update(
    userId: string,
    teamId: string,
    resourceId: string,
    id: string,
    input: UpdateResourceAlertDto
  ): Promise<ResourceAlertRuleSummary> {
    const resource = await this.requireResource(userId, teamId, resourceId, "admin");
    const row = await this.requireRow(teamId, resourceId, id);
    const metric = input.metric ?? row.metric;
    const operator = input.operator ?? row.operator;
    const threshold = input.threshold ?? parseValue(row.threshold_json);
    const recoveryThreshold =
      input.recoveryThreshold === undefined
        ? parseNullableValue(row.recovery_threshold_json)
        : input.recoveryThreshold;
    this.validateResourceMetric(metric, resource.agent_kind);
    this.validate(metric, operator, threshold, recoveryThreshold);
    const enabled = input.enabled ?? Boolean(row.enabled);
    await this.database.run(
      `UPDATE resource_alert_rules SET name = ?, metric = ?, operator = ?, threshold_json = ?::jsonb,
       recovery_threshold_json = ?::jsonb, required_samples = ?, enabled = ?,
       active = CASE WHEN ? THEN active ELSE FALSE END,
       consecutive_matches = 0, consecutive_recoveries = 0, updated_at = ?
       WHERE id = ? AND team_id = ? AND resource_id = ?`,
      (input.name ?? row.name).trim(),
      metric,
      operator,
      JSON.stringify(threshold),
      recoveryThreshold === null ? null : JSON.stringify(recoveryThreshold),
      input.requiredSamples ?? row.required_samples,
      enabled,
      enabled,
      new Date().toISOString(),
      id,
      teamId,
      resourceId
    );
    await this.audit.record({
      teamId,
      userId,
      action: "resource_alert.updated",
      subjectType: "resource_alert",
      subjectId: id,
    });
    return this.map(await this.requireRow(teamId, resourceId, id));
  }

  async remove(userId: string, teamId: string, resourceId: string, id: string): Promise<void> {
    await this.requireResource(userId, teamId, resourceId, "admin");
    const result = await this.database.run(
      "DELETE FROM resource_alert_rules WHERE id = ? AND team_id = ? AND resource_id = ?",
      id,
      teamId,
      resourceId
    );
    if (result.changes === 0) throw new NotFoundException("Alert condition not found");
    await this.audit.record({
      teamId,
      userId,
      action: "resource_alert.deleted",
      subjectType: "resource_alert",
      subjectId: id,
    });
  }

  async evaluate(
    teamId: string,
    resourceId: string,
    values: Partial<Record<ResourceAlertMetric, number | boolean>>,
    observedAt: string
  ): Promise<void> {
    await this.database.transaction(async () => {
      const rows = await this.database.all<AlertRow>(
        `SELECT rar.*, r.name AS resource_name FROM resource_alert_rules rar
         JOIN resources r ON r.id = rar.resource_id
         WHERE rar.team_id = ? AND rar.resource_id = ? AND rar.enabled = TRUE FOR UPDATE`,
        teamId,
        resourceId
      );
      for (const row of rows) {
        if (
          row.last_evaluated_at &&
          new Date(observedAt).getTime() <= new Date(row.last_evaluated_at).getTime()
        ) {
          continue;
        }
        const value = values[row.metric];
        if (value === undefined) continue;
        const threshold = parseValue(row.threshold_json);
        const recoveryThreshold = parseNullableValue(row.recovery_threshold_json);
        const active = Boolean(row.active);
        const matching = compare(row.operator, value, threshold);
        const recovered = active && isRecovered(row.operator, value, threshold, recoveryThreshold);
        const matches = active ? 0 : matching ? row.consecutive_matches + 1 : 0;
        const recoveries = active ? (recovered ? row.consecutive_recoveries + 1 : 0) : 0;
        const nextActive = active
          ? recoveries < row.required_samples
          : matches >= row.required_samples;
        await this.database.run(
          `UPDATE resource_alert_rules SET active = ?, consecutive_matches = ?,
           consecutive_recoveries = ?, last_evaluated_at = ?, triggered_at = ?, updated_at = ?
           WHERE id = ?`,
          nextActive,
          nextActive ? 0 : matches,
          nextActive ? recoveries : 0,
          observedAt,
          !active && nextActive ? observedAt : nextActive ? row.triggered_at : null,
          observedAt,
          row.id
        );
        if (active !== nextActive) {
          const event = nextActive
            ? ("resource.alert.triggered" as const)
            : ("resource.alert.recovered" as const);
          await this.notifications.enqueue(teamId, event, {
            title: row.name,
            message: `${row.resource_name}: ${row.metric} ${value}`,
            severity: nextActive ? "warning" : "info",
            resourceId,
            resourceIds: [resourceId],
            alertRuleId: row.id,
            metric: row.metric,
            value,
            occurredAt: observedAt,
            dedupeKey: `${row.id}:${nextActive ? "active" : "recovered"}:${observedAt}`,
          });
        }
      }
    });
  }

  private async requireResource(
    userId: string,
    teamId: string,
    resourceId: string,
    role: "viewer" | "admin"
  ): Promise<{ id: string; agent_kind: AgentKind | null }> {
    await this.access.require(userId, teamId, role);
    const row = await this.database.get<{ id: string; agent_kind: AgentKind | null }>(
      `SELECT r.id, a.kind AS agent_kind FROM resources r
       LEFT JOIN agents a ON a.resource_id = r.id AND a.revoked_at IS NULL
       WHERE r.id = ? AND r.team_id = ?`,
      resourceId,
      teamId
    );
    if (!row) throw new NotFoundException("Resource not found");
    return row;
  }

  private async requireRow(teamId: string, resourceId: string, id: string): Promise<AlertRow> {
    const row = await this.database.get<AlertRow>(
      "SELECT * FROM resource_alert_rules WHERE id = ? AND team_id = ? AND resource_id = ?",
      id,
      teamId,
      resourceId
    );
    if (!row) throw new NotFoundException("Alert condition not found");
    return row;
  }

  private validate(
    metric: ResourceAlertMetric,
    operator: ResourceAlertOperator,
    threshold: number | boolean,
    recoveryThreshold: number | boolean | null
  ): void {
    const booleanMetric = new Set<ResourceAlertMetric>([
      "internetAvailable",
      "lowMemory",
      "backgroundRestricted",
    ]).has(metric);
    if (
      (booleanMetric &&
        (operator !== "equals" ||
          typeof threshold !== "boolean" ||
          (recoveryThreshold !== null && typeof recoveryThreshold !== "boolean"))) ||
      (!booleanMetric &&
        (typeof threshold !== "number" ||
          !Number.isFinite(threshold) ||
          (recoveryThreshold !== null &&
            (typeof recoveryThreshold !== "number" || !Number.isFinite(recoveryThreshold)))))
    ) {
      throw new BadRequestException("Alert condition is invalid for this metric");
    }
    if (
      typeof threshold === "number" &&
      typeof recoveryThreshold === "number" &&
      (((operator === "greaterThan" || operator === "greaterThanOrEqual") &&
        recoveryThreshold > threshold) ||
        ((operator === "lessThan" || operator === "lessThanOrEqual") &&
          recoveryThreshold < threshold))
    ) {
      throw new BadRequestException("Recovery threshold must return the metric past the trigger");
    }
  }

  private validateResourceMetric(metric: ResourceAlertMetric, kind: AgentKind | null): void {
    const desktop = new Set<ResourceAlertMetric>([
      "cpuPercent",
      "memoryPercent",
      "storagePercent",
      "loadAverage",
      "containerCount",
      "unhealthyContainerCount",
    ]);
    const mobile = new Set<ResourceAlertMetric>([
      "batteryPercent",
      "batteryTemperatureCelsius",
      "memoryPercent",
      "storagePercent",
      "internetAvailable",
      "lowMemory",
      "backgroundRestricted",
    ]);
    const supported = kind === "desktop" ? desktop : kind === "mobile" ? mobile : null;
    if (supported?.has(metric)) return;
    throw new BadRequestException("Alert metric is unavailable for this resource");
  }

  private map(row: AlertRow): ResourceAlertRuleSummary {
    return {
      id: row.id,
      resourceId: row.resource_id,
      name: row.name,
      metric: row.metric,
      operator: row.operator,
      threshold: parseValue(row.threshold_json),
      recoveryThreshold: parseNullableValue(row.recovery_threshold_json),
      requiredSamples: row.required_samples,
      enabled: Boolean(row.enabled),
      active: Boolean(row.active),
      lastEvaluatedAt: row.last_evaluated_at,
      triggeredAt: row.triggered_at,
      createdAt: row.created_at,
    };
  }
}

function compare(
  operator: ResourceAlertOperator,
  actual: number | boolean,
  expected: number | boolean
): boolean {
  if (operator === "equals") return actual === expected;
  if (typeof actual !== "number" || typeof expected !== "number") return false;
  if (operator === "greaterThan") return actual > expected;
  if (operator === "greaterThanOrEqual") return actual >= expected;
  if (operator === "lessThan") return actual < expected;
  return actual <= expected;
}

function isRecovered(
  operator: ResourceAlertOperator,
  actual: number | boolean,
  threshold: number | boolean,
  recoveryThreshold: number | boolean | null
): boolean {
  if (operator === "equals") {
    return recoveryThreshold === null ? actual !== threshold : actual === recoveryThreshold;
  }
  return !compare(operator, actual, recoveryThreshold ?? threshold);
}

function parseValue(value: number | boolean | string): number | boolean {
  return typeof value === "string" ? (JSON.parse(value) as number | boolean) : value;
}

function parseNullableValue(value: number | boolean | string | null): number | boolean | null {
  return value === null ? null : parseValue(value);
}
