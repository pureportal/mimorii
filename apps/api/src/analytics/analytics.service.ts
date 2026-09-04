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

interface OverviewTimelineRow {
  bucket: string;
  up: number;
  degraded: number;
  down: number;
  latencyMs: number | null;
}

interface ReportAggregateRow {
  total: number;
  availability: number | null;
  degraded: number | null;
  latency_percentiles: number[] | null;
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
    const [counts, monitorRows, availability, timelineRows, incidents, maintenance, objectives] =
      await Promise.all([
        this.database.get<{ resources: number; open_incidents: number }>(
          `SELECT
           (SELECT COUNT(*) FROM resources WHERE team_id = ?) AS resources,
           (SELECT COUNT(*) FROM incidents
            WHERE team_id = ? AND status != 'resolved') AS open_incidents`,
          teamId,
          teamId
        ),
        this.database.all<MonitorStatusRow>(
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
        ),
        this.database.get<{
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
        ),
        this.database.all<OverviewTimelineRow>(
          `${MONITOR_OBSERVATIONS_CTE} SELECT
           TO_CHAR(observed_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:00:00.000"Z"') AS bucket,
           SUM(CASE WHEN status = 'up' THEN 1 ELSE 0 END) AS up,
           SUM(CASE WHEN status = 'degraded' THEN 1 ELSE 0 END) AS degraded,
           SUM(CASE WHEN status = 'down' THEN 1 ELSE 0 END) AS down,
           ROUND(AVG(CASE WHEN status != 'down' THEN latency_ms END)::numeric, 1)::double precision AS "latencyMs"
           FROM observations WHERE team_id = ? AND category = 'availability' AND observed_at >= ?
           GROUP BY TO_CHAR(observed_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:00:00.000"Z"')
           ORDER BY bucket`,
          teamId,
          from24h
        ),
        this.incidents.list(userId, teamId, { limit: 20 }),
        this.maintenance.list(userId, teamId),
        this.objectives.list(userId, teamId),
      ]);
    if (!counts || !availability) throw new Error("Overview aggregation failed");
    let checks = 0;
    const monitorCounts = summarizeMonitorStatuses(
      monitorRows.map((row) => {
        if (row.source === "heartbeat") return resolveHeartbeatStatus(row.status);
        checks += 1;
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
    const heartbeats = monitorRows.length - checks;
    const statusTimeline: OverviewAnalytics["statusTimeline"] = [];
    const latencyTimeline: OverviewAnalytics["latencyTimeline"] = [];
    for (const row of timelineRows) {
      statusTimeline.push({
        bucket: row.bucket,
        up: row.up,
        degraded: row.degraded,
        down: row.down,
      });
      if (row.latencyMs !== null) {
        latencyTimeline.push({ bucket: row.bucket, latencyMs: row.latencyMs });
      }
    }

    return {
      resources: counts.resources,
      checks,
      heartbeats,
      ...monitorCounts,
      uptime24h: availability.uptime_24h,
      uptime30d: availability.uptime_30d,
      averageLatencyMs: availability.latency,
      openIncidents: counts.open_incidents,
      activeMaintenance: maintenance.filter((window) => window.status === "active").length,
      breachedObjectives: objectives.filter((objective) => objective.status === "breached").length,
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
    const incidentScope = options.checkId
      ? "AND i.check_id = ?"
      : options.resourceId
        ? "AND ir.resource_id = ?"
        : "";
    const incidentParameter = options.checkId ?? options.resourceId;
    const incidentValues = incidentParameter
      ? [teamId, from.toISOString(), to.toISOString(), incidentParameter]
      : [teamId, from.toISOString(), to.toISOString()];
    const [aggregate, daily, recovery] = await Promise.all([
      this.database.get<ReportAggregateRow>(
        `${MONITOR_OBSERVATIONS_CTE} SELECT COUNT(*) AS total,
         AVG(CASE WHEN o.status = 'down' THEN 0.0 ELSE 100.0 END) AS availability,
         AVG(CASE WHEN o.status = 'degraded' THEN 100.0 ELSE 0.0 END) AS degraded,
         PERCENTILE_DISC(ARRAY[0.5, 0.95, 0.99]) WITHIN GROUP (ORDER BY o.latency_ms)
           FILTER (WHERE o.latency_ms IS NOT NULL AND o.status != 'down') AS latency_percentiles
         FROM observations o
         WHERE o.team_id = ? AND o.category = 'availability'
         AND o.observed_at >= ? AND o.observed_at <= ? ${scope.sql}`,
        ...parameters
      ),
      this.database.all<AnalyticsReport["daily"][number]>(
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
      ),
      this.database.get<{ count: number; mttr: number | null; mtbf: number | null }>(
        `WITH matching_incidents AS (
           SELECT i.id, i.started_at, i.resolved_at FROM incidents i
           LEFT JOIN incident_resources ir ON ir.incident_id = i.id
           WHERE i.team_id = ? AND i.started_at >= ? AND i.started_at <= ? ${incidentScope}
         ), failures AS (
           SELECT DISTINCT id, started_at FROM matching_incidents
         ), intervals AS (
           SELECT EXTRACT(EPOCH FROM (started_at::timestamptz - LAG(started_at::timestamptz)
             OVER (ORDER BY started_at))) AS seconds
           FROM failures
         ) SELECT
           (SELECT COUNT(DISTINCT id) FROM matching_incidents) AS count,
           (SELECT AVG(CASE WHEN resolved_at IS NOT NULL
             THEN EXTRACT(EPOCH FROM (resolved_at::timestamptz - started_at::timestamptz)) END)
             FROM matching_incidents) AS mttr,
           (SELECT AVG(seconds) FROM intervals WHERE seconds IS NOT NULL) AS mtbf`,
        ...incidentValues
      ),
    ]);
    if (!aggregate || !recovery) throw new Error("Report aggregation failed");
    const [latencyP50Ms = null, latencyP95Ms = null, latencyP99Ms = null] =
      aggregate.latency_percentiles ?? [];
    return {
      from: from.toISOString(),
      to: to.toISOString(),
      totalResults: aggregate.total,
      availabilityPercent: aggregate.availability,
      degradedPercent: aggregate.degraded,
      latencyP50Ms,
      latencyP95Ms,
      latencyP99Ms,
      meanTimeToRecoverySeconds: recovery.mttr,
      meanTimeBetweenFailuresSeconds: recovery.mtbf,
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
}
