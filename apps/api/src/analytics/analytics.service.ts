import { BadRequestException, Injectable } from "@nestjs/common";
import type {
  AgentKind,
  AnalyticsReport,
  CheckStatus,
  CheckType,
  OverviewAnalytics,
} from "@mimorii/contracts";
import { resolveAgentStatus } from "../common/agent-status.js";
import {
  isHealthCheckType,
  resolveHeartbeatStatus,
  resolveMonitorStatus,
  summarizeMonitorStatuses,
} from "../common/health-status.js";
import { MONITOR_OBSERVATIONS_CTE } from "../common/monitor-observations.js";
import { DatabaseService } from "../database/database.service.js";
import { IncidentsService } from "../incidents/incidents.service.js";
import { MaintenanceService } from "../maintenance/maintenance.service.js";
import { ObjectivesService } from "../objectives/objectives.service.js";
import { TeamAccessService } from "../teams/team-access.service.js";

interface MonitorStatusRow {
  source: "check" | "heartbeat";
  type: CheckType | null;
  status: CheckStatus;
  agent_kind: AgentKind | null;
  agent_last_seen_at: string | null;
  agent_collection_interval_seconds: number | null;
  latest_metrics_json: string | null;
}

@Injectable()
export class AnalyticsService {
  constructor(
    private readonly database: DatabaseService,
    private readonly access: TeamAccessService,
    private readonly incidents: IncidentsService,
    private readonly maintenance: MaintenanceService,
    private readonly objectives: ObjectivesService
  ) {}

  async overview(userId: string, teamId: string): Promise<OverviewAnalytics> {
    await this.access.require(userId, teamId, "viewer");
    const now = Date.now();
    const from24h = new Date(now - 24 * 60 * 60 * 1000).toISOString();
    const from30d = new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString();
    const resources = (await this.database.get<{ count: number }>(
      "SELECT COUNT(*) AS count FROM resources WHERE team_id = ?",
      teamId
    ))!.count;
    const monitorRows = await this.database.all<MonitorStatusRow>(
      `SELECT 'check' AS source, c.type, c.current_status AS status,
       a.kind AS agent_kind, a.last_seen_at AS agent_last_seen_at,
       a.collection_interval_seconds AS agent_collection_interval_seconds,
       (SELECT cr.metrics_json FROM check_results cr WHERE cr.check_id = c.id
        ORDER BY cr.checked_at DESC, cr.id DESC LIMIT 1) AS latest_metrics_json
       FROM checks c LEFT JOIN agents a ON a.id = c.agent_id WHERE c.team_id = ?
       UNION ALL
       SELECT 'heartbeat', NULL::text, hm.current_status,
       NULL::text, NULL::timestamptz, NULL::integer, NULL::text
       FROM heartbeat_monitors hm WHERE hm.team_id = ?`,
      teamId,
      teamId
    );
    const monitorCounts = summarizeMonitorStatuses(
      monitorRows.map((row) => {
        if (row.source === "heartbeat") return resolveHeartbeatStatus(row.status);
        if (!row.type) throw new Error("Overview check type is missing");
        const reporterOffline =
          row.agent_kind !== null &&
          resolveAgentStatus({
            kind: row.agent_kind,
            collectionIntervalSeconds: row.agent_collection_interval_seconds ?? 30,
            lastSeenAt: row.agent_last_seen_at,
          }) === "offline";
        const latestMetrics: unknown = row.latest_metrics_json
          ? JSON.parse(row.latest_metrics_json)
          : null;
        const agentTimedOut =
          typeof latestMetrics === "object" &&
          latestMetrics !== null &&
          "agentTimeout" in latestMetrics &&
          latestMetrics.agentTimeout === true;
        return resolveMonitorStatus(row.type, row.status, reporterOffline || agentTimedOut);
      })
    );
    const checks = monitorRows.filter((row) => row.source === "check").length;
    const heartbeats = monitorRows.length - checks;
    const availability = (await this.database.get<{
      uptime_24h: number | null;
      uptime_30d: number | null;
      latency: number | null;
    }>(
      `${MONITOR_OBSERVATIONS_CTE} SELECT
       AVG(CASE WHEN observed_at >= ? THEN CASE WHEN status = 'down' THEN 0.0 ELSE 100.0 END END) AS uptime_24h,
       AVG(CASE WHEN observed_at >= ? THEN CASE WHEN status = 'down' THEN 0.0 ELSE 100.0 END END) AS uptime_30d,
       AVG(CASE WHEN observed_at >= ? AND status != 'down' THEN latency_ms END) AS latency
       FROM observations WHERE team_id = ? AND category = 'availability'`,
      from24h,
      from30d,
      from24h,
      teamId
    ))!;
    const statusTimeline = await this.database.all<{
      bucket: string;
      up: number;
      degraded: number;
      down: number;
    }>(
      `${MONITOR_OBSERVATIONS_CTE} SELECT TO_CHAR(observed_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:00:00.000"Z"') AS bucket,
       SUM(CASE WHEN status = 'up' THEN 1 ELSE 0 END) AS up,
       SUM(CASE WHEN status = 'degraded' THEN 1 ELSE 0 END) AS degraded,
       SUM(CASE WHEN status = 'down' THEN 1 ELSE 0 END) AS down
       FROM observations WHERE team_id = ? AND category = 'availability' AND observed_at >= ?
       GROUP BY TO_CHAR(observed_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:00:00.000"Z"')
       ORDER BY bucket`,
      teamId,
      from24h
    );
    const latencyTimeline = await this.database.all<{ bucket: string; latencyMs: number }>(
      `${MONITOR_OBSERVATIONS_CTE} SELECT
       TO_CHAR(o.observed_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:00:00.000"Z"') AS bucket,
       ROUND(AVG(o.latency_ms)::numeric, 1)::double precision AS "latencyMs"
       FROM observations o WHERE o.team_id = ? AND o.category = 'availability'
       AND o.observed_at >= ? AND o.latency_ms IS NOT NULL AND o.status != 'down'
       GROUP BY TO_CHAR(o.observed_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:00:00.000"Z"')
       ORDER BY bucket`,
      teamId,
      from24h
    );
    const incidents = await this.incidents.list(userId, teamId, { limit: 20 });
    const openIncidents = (await this.database.get<{ count: number }>(
      "SELECT COUNT(*) AS count FROM incidents WHERE team_id = ? AND status != 'resolved'",
      teamId
    ))!.count;
    const activeMaintenance = (await this.maintenance.list(userId, teamId)).filter(
      (window) => window.status === "active"
    ).length;
    const breachedObjectives = (await this.objectives.list(userId, teamId)).filter(
      (objective) => objective.status === "breached"
    ).length;

    return {
      resources,
      checks,
      heartbeats,
      ...monitorCounts,
      uptime24h: availability.uptime_24h,
      uptime30d: availability.uptime_30d,
      averageLatencyMs: availability.latency,
      openIncidents,
      activeMaintenance,
      breachedObjectives,
      statusTimeline,
      latencyTimeline,
      incidents,
    };
  }

  async report(
    userId: string,
    teamId: string,
    options: { from?: string; to?: string; resourceId?: string; checkId?: string }
  ): Promise<AnalyticsReport> {
    await this.access.require(userId, teamId, "viewer");
    const to = options.to ? new Date(options.to) : new Date();
    const from = options.from ? new Date(options.from) : new Date(to.getTime() - 30 * 86_400_000);
    if (!Number.isFinite(from.getTime()) || !Number.isFinite(to.getTime()) || from >= to) {
      throw new BadRequestException("Report time range is invalid");
    }
    if (to.getTime() - from.getTime() > 366 * 86_400_000) {
      throw new BadRequestException("Report range cannot exceed 366 days");
    }
    const scope = await this.reportScope(teamId, options.resourceId, options.checkId);
    const parameters = [teamId, from.toISOString(), to.toISOString(), ...scope.parameters];
    const aggregate = (await this.database.get<{
      total: number;
      availability: number | null;
      degraded: number | null;
    }>(
      `${MONITOR_OBSERVATIONS_CTE} SELECT COUNT(*) AS total,
       AVG(CASE WHEN o.status = 'down' THEN 0.0 ELSE 100.0 END) AS availability,
       AVG(CASE WHEN o.status = 'degraded' THEN 100.0 ELSE 0.0 END) AS degraded
       FROM observations o
       WHERE o.team_id = ? AND o.category = 'availability'
       AND o.observed_at >= ? AND o.observed_at <= ? ${scope.sql}`,
      ...parameters
    ))!;
    const daily = await this.database.all<AnalyticsReport["daily"][number]>(
      `${MONITOR_OBSERVATIONS_CTE} SELECT TO_CHAR(o.observed_at AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS date,
       SUM(CASE WHEN o.status = 'up' THEN 1 ELSE 0 END) AS up,
       SUM(CASE WHEN o.status = 'degraded' THEN 1 ELSE 0 END) AS degraded,
       SUM(CASE WHEN o.status = 'down' THEN 1 ELSE 0 END) AS down,
       AVG(CASE WHEN o.status = 'down' THEN 0.0 ELSE 100.0 END) AS "availabilityPercent",
       AVG(CASE WHEN o.status != 'down' THEN o.latency_ms END) AS "averageLatencyMs"
       FROM observations o
       WHERE o.team_id = ? AND o.category = 'availability'
       AND o.observed_at >= ? AND o.observed_at <= ? ${scope.sql}
       GROUP BY TO_CHAR(o.observed_at AT TIME ZONE 'UTC', 'YYYY-MM-DD') ORDER BY date`,
      ...parameters
    );
    const incidentScope = options.checkId
      ? "AND i.check_id = ?"
      : options.resourceId
        ? "AND ir.resource_id = ?"
        : "";
    const incidentParameter = options.checkId ?? options.resourceId;
    const incidentValues = incidentParameter
      ? [teamId, from.toISOString(), to.toISOString(), incidentParameter]
      : [teamId, from.toISOString(), to.toISOString()];
    const recovery = (await this.database.get<{ count: number; mttr: number | null }>(
      `SELECT COUNT(DISTINCT i.id) AS count,
       AVG(CASE WHEN i.resolved_at IS NOT NULL
         THEN EXTRACT(EPOCH FROM (i.resolved_at::timestamptz - i.started_at::timestamptz)) END) AS mttr
       FROM incidents i LEFT JOIN incident_resources ir ON ir.incident_id = i.id
       WHERE i.team_id = ? AND i.started_at >= ? AND i.started_at <= ? ${incidentScope}`,
      ...incidentValues
    ))!;
    const betweenFailures = (
      await this.database.get<{ mtbf: number | null }>(
        `WITH failures AS (
         SELECT DISTINCT i.id, i.started_at FROM incidents i
         LEFT JOIN incident_resources ir ON ir.incident_id = i.id
         WHERE i.team_id = ? AND i.started_at >= ? AND i.started_at <= ? ${incidentScope}
       ), intervals AS (
         SELECT EXTRACT(EPOCH FROM (started_at::timestamptz - LAG(started_at::timestamptz)
           OVER (ORDER BY started_at))) AS seconds
         FROM failures
       ) SELECT AVG(seconds) AS mtbf FROM intervals WHERE seconds IS NOT NULL`,
        ...incidentValues
      )
    )?.mtbf;
    return {
      from: from.toISOString(),
      to: to.toISOString(),
      totalResults: aggregate.total,
      availabilityPercent: aggregate.availability,
      degradedPercent: aggregate.degraded,
      latencyP50Ms: await this.percentile(0.5, parameters, scope.sql),
      latencyP95Ms: await this.percentile(0.95, parameters, scope.sql),
      latencyP99Ms: await this.percentile(0.99, parameters, scope.sql),
      meanTimeToRecoverySeconds: recovery.mttr,
      meanTimeBetweenFailuresSeconds: betweenFailures ?? null,
      incidentCount: recovery.count,
      daily,
    };
  }

  private async reportScope(teamId: string, resourceId?: string, checkId?: string) {
    if (checkId) {
      const check = await this.database.get<{ type: CheckType }>(
        "SELECT type FROM checks WHERE id = ? AND team_id = ?",
        checkId,
        teamId
      );
      if (!check) throw new BadRequestException("Check is unavailable");
      if (isHealthCheckType(check.type)) {
        throw new BadRequestException("Availability reports require an availability check");
      }
      return { sql: "AND o.check_id = ?", parameters: [checkId] };
    }
    if (resourceId) {
      if (
        !(await this.database.get(
          "SELECT id FROM resources WHERE id = ? AND team_id = ?",
          resourceId,
          teamId
        ))
      ) {
        throw new BadRequestException("Resource is unavailable");
      }
      return { sql: "AND o.resource_id = ?", parameters: [resourceId] };
    }
    return { sql: "", parameters: [] as string[] };
  }

  private async percentile(
    percentile: number,
    parameters: string[],
    scopeSql: string
  ): Promise<number | null> {
    return (
      (
        await this.database.get<{ latency: number }>(
          `${MONITOR_OBSERVATIONS_CTE}, ordered AS (
           SELECT o.latency_ms AS latency,
            ROW_NUMBER() OVER (ORDER BY o.latency_ms) AS position,
            COUNT(*) OVER () AS total
           FROM observations o
           WHERE o.team_id = ? AND o.category = 'availability'
           AND o.observed_at >= ? AND o.observed_at <= ?
           AND o.latency_ms IS NOT NULL AND o.status != 'down' ${scopeSql}
         ) SELECT latency FROM ordered WHERE position >= total * ? ORDER BY position LIMIT 1`,
          ...parameters,
          percentile
        )
      )?.latency ?? null
    );
  }
}
