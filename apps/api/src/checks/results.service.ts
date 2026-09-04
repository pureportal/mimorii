import { Injectable, NotFoundException } from "@nestjs/common";
import { appRoutes, type CheckResult } from "@mimorii/contracts";
import { randomUUID } from "node:crypto";
import { DatabaseService } from "../database/database.service.js";
import { IncidentsService } from "../incidents/incidents.service.js";
import { MaintenanceService } from "../maintenance/maintenance.service.js";
import { NotificationsService } from "../notifications/notifications.service.js";
import { TechnologiesService } from "../technologies/technologies.service.js";
import { nextCheckState } from "./check-state.js";
import type { CheckRow, ExecutedCheckResult } from "./checks.types.js";

interface RecordedCheckRow extends CheckRow {
  resource_name: string;
}

interface ResultRow {
  id: string;
  check_id: string;
  triggered_incident_id: string | null;
  status: CheckResult["status"];
  latency_ms: number | null;
  status_code: number | null;
  message: string | null;
  metrics_json: string;
  checked_at: string;
}

@Injectable()
export class ResultsService {
  constructor(
    private readonly database: DatabaseService,
    private readonly incidents: IncidentsService,
    private readonly maintenance: MaintenanceService,
    private readonly notifications: NotificationsService,
    private readonly technologies: TechnologiesService
  ) {}

  async record(checkId: string, result: ExecutedCheckResult): Promise<CheckResult> {
    const id = randomUUID();
    const now = new Date().toISOString();
    let recordedCheck: RecordedCheckRow | undefined;
    let stateApplied = false;
    let triggeredIncidentId: string | null = null;

    await this.database.transaction(async () => {
      const check = await this.database.get<RecordedCheckRow>(
        `SELECT c.*, r.name AS resource_name FROM checks c
         JOIN resources r ON r.id = c.resource_id WHERE c.id = ? FOR UPDATE`,
        checkId
      );
      if (!check) throw new NotFoundException("Check not found");
      recordedCheck = check;
      await this.database.run(
        `INSERT INTO check_results
         (id, check_id, status, latency_ms, status_code, message, metrics_json, checked_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        id,
        checkId,
        result.status,
        result.latencyMs,
        result.statusCode,
        result.message?.slice(0, 500) ?? null,
        JSON.stringify(result.metrics),
        result.checkedAt
      );
      if (!newerThan(result.checkedAt, check.last_checked_at)) return;
      stateApplied = true;
      const state = nextCheckState(check, result.status);
      await this.database.run(
        `UPDATE checks SET current_status = ?, consecutive_failures = ?, consecutive_successes = ?,
         last_latency_ms = ?, last_checked_at = ?, updated_at = ? WHERE id = ?`,
        state.status,
        state.failures,
        state.successes,
        result.latencyMs,
        result.checkedAt,
        now,
        checkId
      );

      if (check.current_status !== "down" && state.status === "down") {
        triggeredIncidentId =
          (await this.incidents.openForCheck(checkId, id, result.message, result.checkedAt, {
            previousStatus: check.current_status,
            metrics: result.metrics,
            latencyMs: result.latencyMs,
            statusCode: result.statusCode,
          })) ?? null;
      }
      if (
        state.status === "degraded" &&
        check.current_status !== "degraded" &&
        !(await this.maintenance.suppressesNotifications(
          check.resource_id,
          new Date(result.checkedAt)
        ))
      ) {
        await this.notifications.enqueue(
          check.team_id,
          "check.degraded",
          this.transitionPayload(check, result, "degraded", "warning")
        );
      }
      if (
        state.status === "up" &&
        (check.current_status === "down" || check.current_status === "degraded")
      ) {
        const incidentResolved = await this.incidents.resolveForCheck(
          checkId,
          id,
          result.checkedAt,
          {
            previousStatus: check.current_status,
            metrics: result.metrics,
            latencyMs: result.latencyMs,
            statusCode: result.statusCode,
          }
        );
        if (
          !incidentResolved &&
          !(await this.maintenance.suppressesNotifications(
            check.resource_id,
            new Date(result.checkedAt)
          ))
        ) {
          await this.notifications.enqueue(
            check.team_id,
            "check.recovered",
            this.transitionPayload(check, result, "up", "info")
          );
        }
      }
    });

    if (!recordedCheck) throw new NotFoundException("Check not found");
    if (stateApplied) {
      await this.technologies.observeHttp(checkId, result.metrics, result.checkedAt);
    }

    return {
      id,
      checkId,
      triggeredIncidentId,
      status: result.status,
      latencyMs: result.latencyMs,
      statusCode: result.statusCode,
      message: result.message,
      metrics: result.metrics,
      checkedAt: result.checkedAt,
    };
  }

  async history(checkId: string, from?: string, to?: string, limit = 500): Promise<CheckResult[]> {
    const clauses = ["check_id = ?"];
    const parameters: Array<string | number> = [checkId];
    if (from) {
      clauses.push("checked_at >= ?");
      parameters.push(from);
    }
    if (to) {
      clauses.push("checked_at <= ?");
      parameters.push(to);
    }
    parameters.push(Math.min(Math.max(limit, 1), 1_000));
    const rows = await this.database.all<ResultRow>(
      `SELECT cr.*, i.id AS triggered_incident_id FROM check_results cr
       LEFT JOIN incidents i ON i.opening_result_id = cr.id
       WHERE ${clauses.map((clause) => `cr.${clause}`).join(" AND ")}
       ORDER BY cr.checked_at DESC LIMIT ?`,
      ...parameters
    );
    return rows.map((row) => ({
      id: row.id,
      checkId: row.check_id,
      triggeredIncidentId: row.triggered_incident_id,
      status: row.status,
      latencyMs: row.latency_ms,
      statusCode: row.status_code,
      message: row.message,
      metrics: JSON.parse(row.metrics_json) as CheckResult["metrics"],
      checkedAt: row.checked_at,
    }));
  }

  private transitionPayload(
    check: RecordedCheckRow,
    result: ExecutedCheckResult,
    status: "up" | "degraded",
    severity: "warning" | "info"
  ): Record<string, unknown> {
    const title = `${check.resource_name}: ${check.name}`;
    return {
      source: "check",
      severity,
      checkId: check.id,
      checkType: check.type,
      title,
      message:
        status === "up"
          ? "The check returned to normal."
          : result.message || "The check is degraded.",
      status,
      previousStatus: check.current_status,
      metrics: result.metrics,
      latencyMs: result.latencyMs,
      statusCode: result.statusCode,
      resourceId: check.resource_id,
      resourceIds: [check.resource_id],
      dedupeKey: `check:${check.id}`,
      path: appRoutes.resource(check.resource_id),
      occurredAt: result.checkedAt,
    };
  }
}

function newerThan(current: string, previous: string | null): boolean {
  if (!previous) return true;
  const previousTime = Date.parse(previous);
  return Number.isNaN(previousTime) || Date.parse(current) > previousTime;
}
