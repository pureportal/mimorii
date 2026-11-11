import {
  parseLogQuery,
  type IncidentImpact,
  type LogAlertComparison,
  type LogAlertPreview,
  type LogAlertRuleSummary,
  type LogEntry,
  type LogQuery,
} from "@mimorii/contracts";
import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  type OnModuleDestroy,
} from "@nestjs/common";
import { Interval } from "@nestjs/schedule";
import { randomUUID } from "node:crypto";
import { AuditService } from "../common/audit.service.js";
import { DatabaseService } from "../database/database.service.js";
import { IncidentsService } from "../incidents/incidents.service.js";
import { parseLogQueryInput } from "./log-query-sql.js";
import { LogSearchService, type LogSearchWindow } from "./log-search.service.js";
import type {
  CreateLogAlertRuleDto,
  PreviewLogAlertRuleDto,
  UpdateLogAlertRuleDto,
} from "./logs.dto.js";
import { LogsAccessService } from "./logs-access.service.js";

interface LogAlertRuleRow {
  id: string;
  team_id: string;
  resource_id: string | null;
  name: string;
  query: string;
  window_seconds: number;
  comparison: LogAlertComparison;
  threshold: number;
  pending_seconds: number;
  impact: IncidentImpact;
  auto_resolve: boolean;
  enabled: boolean;
  pending_since: string | null;
  firing_since: string | null;
  last_error: string | null;
  last_evaluated_at: string | null;
  last_match_count: number | null;
  last_matched_at: string | null;
  created_at: string;
  updated_at: string;
}

interface LogAlertRuleSummaryRow extends LogAlertRuleRow {
  resource_name: string | null;
  open_incident_id: string | null;
}

interface LogAlertMeasurement {
  matchCount: number;
  conditionMet: boolean;
  latest: LogEntry | undefined;
}

const ruleLimit = 200;
const matchCountCap = 100_000;
const summarySelect = `SELECT lar.*, r.name AS resource_name, i.id AS open_incident_id
  FROM log_alert_rules lar
  LEFT JOIN resources r ON r.id = lar.resource_id
  LEFT JOIN incidents i ON i.log_alert_rule_id = lar.id AND i.status != 'resolved'`;

@Injectable()
export class LogAlertsService implements OnModuleDestroy {
  private readonly logger = new Logger(LogAlertsService.name);
  private readonly scheduledTeams = new Set<string>();
  private scheduleTimer: NodeJS.Timeout | null = null;
  private evaluation: Promise<void> = Promise.resolve();

  constructor(
    private readonly database: DatabaseService,
    private readonly access: LogsAccessService,
    private readonly search: LogSearchService,
    private readonly incidents: IncidentsService,
    private readonly audit: AuditService
  ) {}

  onModuleDestroy(): void {
    if (this.scheduleTimer) clearTimeout(this.scheduleTimer);
    this.scheduleTimer = null;
  }

  async list(userId: string, teamId: string): Promise<LogAlertRuleSummary[]> {
    await this.access.require(userId, teamId, "viewer");
    const rows = await this.database.all<LogAlertRuleSummaryRow>(
      `${summarySelect} WHERE lar.team_id = ? ORDER BY LOWER(lar.name), lar.created_at`,
      teamId
    );
    return rows.map(mapRule);
  }

  async preview(
    userId: string,
    teamId: string,
    input: PreviewLogAlertRuleDto
  ): Promise<LogAlertPreview> {
    await this.access.require(userId, teamId, "viewer");
    const query = parseLogQueryInput(input.query);
    await this.search.validate(query);
    const window = alertWindow(input.windowSeconds, new Date());
    const measurement = await this.measure(teamId, query, input, window);
    const samples = measurement.matchCount
      ? await this.search.entries(teamId, query, window, { limit: 5, direction: "backward" })
      : [];
    return {
      matchCount: measurement.matchCount,
      conditionMet: measurement.conditionMet,
      samples,
    };
  }

  async create(
    userId: string,
    teamId: string,
    input: CreateLogAlertRuleDto
  ): Promise<LogAlertRuleSummary> {
    await this.access.require(userId, teamId, "member");
    const count = (await this.database.get<{ count: number }>(
      "SELECT COUNT(*) AS count FROM log_alert_rules WHERE team_id = ?",
      teamId
    ))!.count;
    if (count >= ruleLimit) throw new BadRequestException("Log alert rule limit reached");
    const query = await this.validatedQuery(input.query);
    const resourceId = await this.validatedResource(teamId, input.resourceId ?? null);
    const id = randomUUID();
    const now = new Date().toISOString();
    await this.database.run(
      `INSERT INTO log_alert_rules
       (id, team_id, resource_id, name, query, window_seconds, comparison, threshold,
        pending_seconds, impact, auto_resolve, enabled, created_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      id,
      teamId,
      resourceId,
      input.name.trim(),
      query,
      input.windowSeconds,
      input.comparison,
      input.threshold,
      input.pendingSeconds ?? 0,
      input.impact,
      input.autoResolve ?? true,
      input.enabled ?? true,
      userId,
      now,
      now
    );
    await this.audit.record({
      teamId,
      userId,
      action: "log_alert.created",
      subjectType: "log_alert",
      subjectId: id,
    });
    this.scheduleTeam(teamId);
    return this.requireSummary(teamId, id);
  }

  async update(
    userId: string,
    teamId: string,
    id: string,
    input: UpdateLogAlertRuleDto
  ): Promise<LogAlertRuleSummary> {
    await this.access.require(userId, teamId, "member");
    const current = await this.requireSummary(teamId, id);
    const query =
      input.query === undefined ? current.query : await this.validatedQuery(input.query);
    const resourceId =
      input.resourceId === undefined
        ? current.resourceId
        : await this.validatedResource(teamId, input.resourceId);
    const next = {
      name: input.name?.trim() ?? current.name,
      query,
      windowSeconds: input.windowSeconds ?? current.windowSeconds,
      comparison: input.comparison ?? current.comparison,
      threshold: input.threshold ?? current.threshold,
      pendingSeconds: input.pendingSeconds ?? current.pendingSeconds,
      impact: input.impact ?? current.impact,
      autoResolve: input.autoResolve ?? current.autoResolve,
      enabled: input.enabled ?? current.enabled,
    };
    const definitionChanged =
      next.query !== current.query ||
      next.windowSeconds !== current.windowSeconds ||
      next.comparison !== current.comparison ||
      next.threshold !== current.threshold ||
      next.pendingSeconds !== current.pendingSeconds;
    const reset = definitionChanged || !next.enabled;
    const now = new Date().toISOString();
    await this.database.transaction(async () => {
      if (reset) {
        await this.incidents.resolveForLogAlert(
          id,
          now,
          next.enabled ? "The log alert rule changed." : "The log alert rule was paused."
        );
      }
      await this.database.run(
        `UPDATE log_alert_rules SET resource_id = ?, name = ?, query = ?, window_seconds = ?,
         comparison = ?, threshold = ?, pending_seconds = ?, impact = ?, auto_resolve = ?,
         enabled = ?,
         pending_since = CASE WHEN ? THEN NULL ELSE pending_since END,
         firing_since = CASE WHEN ? THEN NULL ELSE firing_since END,
         last_match_count = CASE WHEN ? THEN NULL ELSE last_match_count END,
         last_error = CASE WHEN ? THEN NULL ELSE last_error END,
         updated_at = ?
         WHERE id = ? AND team_id = ?`,
        resourceId,
        next.name,
        next.query,
        next.windowSeconds,
        next.comparison,
        next.threshold,
        next.pendingSeconds,
        next.impact,
        next.autoResolve,
        next.enabled,
        reset,
        reset,
        reset,
        reset,
        now,
        id,
        teamId
      );
    });
    await this.audit.record({
      teamId,
      userId,
      action: "log_alert.updated",
      subjectType: "log_alert",
      subjectId: id,
    });
    if (next.enabled) this.scheduleTeam(teamId);
    return this.requireSummary(teamId, id);
  }

  async remove(userId: string, teamId: string, id: string): Promise<void> {
    await this.access.require(userId, teamId, "admin");
    await this.requireSummary(teamId, id);
    await this.database.transaction(async () => {
      await this.incidents.resolveForLogAlert(
        id,
        new Date().toISOString(),
        "The log alert rule was deleted."
      );
      await this.database.run(
        "DELETE FROM log_alert_rules WHERE id = ? AND team_id = ?",
        id,
        teamId
      );
    });
    await this.audit.record({
      teamId,
      userId,
      action: "log_alert.deleted",
      subjectType: "log_alert",
      subjectId: id,
    });
  }

  scheduleTeam(teamId: string): void {
    if (process.env.MIMORII_SCHEDULER_ENABLED === "false") return;
    this.scheduledTeams.add(teamId);
    this.scheduleTimer ??= setTimeout(() => {
      this.scheduleTimer = null;
      const teams = [...this.scheduledTeams];
      this.scheduledTeams.clear();
      for (const scheduledTeamId of teams) void this.evaluate(scheduledTeamId);
    }, 1_000);
  }

  @Interval(15_000)
  async evaluateScheduled(): Promise<void> {
    if (process.env.MIMORII_SCHEDULER_ENABLED === "false") return;
    await this.evaluate();
  }

  evaluate(teamId?: string): Promise<void> {
    this.evaluation = this.evaluation
      .then(() => this.evaluateRules(teamId))
      .catch((error: unknown) => {
        this.logger.error(`Log alert evaluation failed: ${errorMessage(error)}`);
      });
    return this.evaluation;
  }

  async suspendTeam(teamId: string, suspendedAt: string): Promise<void> {
    const open = await this.database.all<{ log_alert_rule_id: string }>(
      `SELECT log_alert_rule_id FROM incidents
       WHERE team_id = ? AND log_alert_rule_id IS NOT NULL AND status != 'resolved'`,
      teamId
    );
    for (const incident of open) {
      await this.incidents.resolveForLogAlert(
        incident.log_alert_rule_id,
        suspendedAt,
        "Logs were disabled for this team."
      );
    }
    await this.database.run(
      "UPDATE log_alert_rules SET firing_since = NULL, pending_since = NULL WHERE team_id = ?",
      teamId
    );
  }

  private async evaluateRules(teamId?: string): Promise<void> {
    const rows = await this.database.all<LogAlertRuleRow>(
      `SELECT lar.* FROM log_alert_rules lar
       JOIN team_log_settings tls ON tls.team_id = lar.team_id AND tls.enabled = TRUE
       WHERE lar.enabled = TRUE ${teamId ? "AND lar.team_id = ?" : ""}
       ORDER BY lar.last_evaluated_at NULLS FIRST`,
      ...(teamId ? [teamId] : [])
    );
    for (const row of rows) {
      try {
        await this.evaluateRule(row);
      } catch (error) {
        const message = errorMessage(error);
        this.logger.warn(`Log alert rule ${row.id} could not be evaluated: ${message}`);
        await this.database.run(
          "UPDATE log_alert_rules SET last_error = ?, last_evaluated_at = ? WHERE id = ?",
          message.slice(0, 500),
          new Date().toISOString(),
          row.id
        );
      }
    }
  }

  private async evaluateRule(rule: LogAlertRuleRow): Promise<void> {
    const now = new Date();
    const measurement = await this.measure(
      rule.team_id,
      parseLogQuery(rule.query),
      { comparison: rule.comparison, threshold: rule.threshold },
      alertWindow(rule.window_seconds, now)
    );
    const observedLongEnough =
      rule.comparison === "atLeast" ||
      now.getTime() - new Date(rule.updated_at).getTime() >= rule.window_seconds * 1_000;
    const conditionMet = measurement.conditionMet && observedLongEnough;
    const evaluatedAt = now.toISOString();
    await this.database.transaction(async () => {
      const current = await this.database.get<LogAlertRuleRow>(
        "SELECT * FROM log_alert_rules WHERE id = ? FOR UPDATE",
        rule.id
      );
      if (!current?.enabled || current.updated_at !== rule.updated_at) return;
      const firing = Boolean(current.firing_since);
      const pendingSince = conditionMet ? (current.pending_since ?? evaluatedAt) : null;
      const pendingElapsed =
        pendingSince !== null &&
        now.getTime() - new Date(pendingSince).getTime() >= current.pending_seconds * 1_000;
      const firesNow = conditionMet && (firing || pendingElapsed);
      await this.database.run(
        `UPDATE log_alert_rules SET last_evaluated_at = ?, last_match_count = ?,
         last_matched_at = COALESCE(?, last_matched_at), pending_since = ?, firing_since = ?,
         last_error = NULL
         WHERE id = ?`,
        evaluatedAt,
        measurement.matchCount,
        measurement.latest?.timestamp ?? null,
        firesNow ? null : pendingSince,
        firesNow ? (current.firing_since ?? evaluatedAt) : null,
        rule.id
      );
      if (firesNow && !firing) {
        await this.incidents.openForLogAlert(
          rule.id,
          incidentMessage(rule, measurement),
          evaluatedAt
        );
      } else if (!conditionMet && firing && current.auto_resolve) {
        await this.incidents.resolveForLogAlert(
          rule.id,
          evaluatedAt,
          "The log alert condition cleared."
        );
      }
    });
  }

  private async measure(
    teamId: string,
    query: LogQuery,
    condition: { comparison: LogAlertComparison; threshold: number },
    window: LogSearchWindow
  ): Promise<LogAlertMeasurement> {
    const matchCount = await this.search.count(teamId, query, window, matchCountCap);
    const latest = matchCount
      ? (await this.search.entries(teamId, query, window, { limit: 1, direction: "backward" }))[0]
      : undefined;
    return {
      matchCount,
      conditionMet:
        condition.comparison === "atLeast"
          ? matchCount >= condition.threshold
          : matchCount < condition.threshold,
      latest,
    };
  }

  private async validatedQuery(input: string): Promise<string> {
    await this.search.validate(parseLogQueryInput(input));
    return input.trim();
  }

  private async validatedResource(
    teamId: string,
    resourceId: string | null
  ): Promise<string | null> {
    if (!resourceId) return null;
    const resource = await this.database.get(
      "SELECT id FROM resources WHERE id = ? AND team_id = ?",
      resourceId,
      teamId
    );
    if (!resource) throw new BadRequestException("Resource is unavailable");
    return resourceId;
  }

  private async requireSummary(teamId: string, id: string): Promise<LogAlertRuleSummary> {
    const row = await this.database.get<LogAlertRuleSummaryRow>(
      `${summarySelect} WHERE lar.team_id = ? AND lar.id = ?`,
      teamId,
      id
    );
    if (!row) throw new NotFoundException("Log alert rule not found");
    return mapRule(row);
  }
}

function alertWindow(windowSeconds: number, now: Date): LogSearchWindow {
  return { from: new Date(now.getTime() - windowSeconds * 1_000), to: now };
}

function incidentMessage(rule: LogAlertRuleRow, measurement: LogAlertMeasurement): string {
  const window = formatWindow(rule.window_seconds);
  const count =
    measurement.matchCount >= matchCountCap
      ? `More than ${matchCountCap.toLocaleString("en-US")}`
      : measurement.matchCount.toLocaleString("en-US");
  const lines = measurement.matchCount === 1 ? "line" : "lines";
  if (rule.comparison === "below") {
    return `${count} matching log ${lines} in the last ${window}; expected at least ${rule.threshold.toLocaleString("en-US")}.`;
  }
  const latest = measurement.latest
    ? ` Latest: ${measurement.latest.message.replace(/\s+/g, " ").trim().slice(0, 400)}`
    : "";
  return `${count} matching log ${lines} in the last ${window}.${latest}`;
}

function formatWindow(seconds: number): string {
  if (seconds % 3_600 === 0) {
    const hours = seconds / 3_600;
    return hours === 1 ? "hour" : `${hours} hours`;
  }
  const minutes = Math.round(seconds / 60);
  return minutes === 1 ? "minute" : `${minutes} minutes`;
}

function mapRule(row: LogAlertRuleSummaryRow): LogAlertRuleSummary {
  return {
    id: row.id,
    name: row.name,
    query: row.query,
    windowSeconds: row.window_seconds,
    comparison: row.comparison,
    threshold: row.threshold,
    pendingSeconds: row.pending_seconds,
    impact: row.impact,
    resourceId: row.resource_id,
    resourceName: row.resource_name,
    autoResolve: row.auto_resolve,
    enabled: row.enabled,
    state: !row.enabled
      ? "paused"
      : row.firing_since
        ? "firing"
        : row.pending_since
          ? "pending"
          : "normal",
    pendingSince: optionalIso(row.pending_since),
    firingSince: optionalIso(row.firing_since),
    lastError: row.last_error,
    lastEvaluatedAt: optionalIso(row.last_evaluated_at),
    lastMatchCount: row.last_match_count,
    lastMatchedAt: optionalIso(row.last_matched_at),
    openIncidentId: row.open_incident_id,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

function optionalIso(value: string | null): string | null {
  return value ? new Date(value).toISOString() : null;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
