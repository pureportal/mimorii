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
import {
  HOURLY_MONITOR_OBSERVATIONS_CTE,
  MONITOR_OBSERVATIONS_CTE,
} from "../common/monitor-observations.js";
import { DatabaseService } from "../database/database.service.js";
import { MaintenanceService } from "../maintenance/maintenance.service.js";
import { TeamAccessService } from "../teams/team-access.service.js";

const HOUR_MS = 3_600_000;

interface OverviewCountsRow {
  resources: number;
  open_incidents: number;
  breached_objectives: number;
}

interface MonitorStatusRow {
  source: "check" | "heartbeat";
  type: CheckType | null;
  status: CheckStatus;
  agent_kind: AgentKind | null;
  agent_last_seen_at: string | null;
  agent_collection_interval_seconds: number | null;
  agent_timed_out: boolean;
}

interface OverviewAvailabilityRow {
  uptime_24h: number | null;
  uptime_30d: number | null;
  latency: number | null;
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
    private readonly maintenance: MaintenanceService
  ) {}

  async overview(userId: string, teamId: string): Promise<OverviewAnalytics> {
    await this.access.require(userId, teamId, "viewer");
    const currentHour = Math.floor(Date.now() / HOUR_MS) * HOUR_MS;
    const from24h = new Date(currentHour - 23 * HOUR_MS).toISOString();
    const from30d = new Date(currentHour - (30 * 24 - 1) * HOUR_MS).toISOString();
    const [counts, monitorRows, availability, timelineRows, activeMaintenance] = await Promise.all([
      this.database.get<OverviewCountsRow>(
        `SELECT
         (SELECT COUNT(*) FROM resources WHERE team_id = ?) AS resources,
         (SELECT COUNT(*) FROM incidents
          WHERE team_id = ? AND status != 'resolved') AS open_incidents,
         (SELECT COUNT(*) FROM service_level_objectives
          WHERE team_id = ? AND breach_state = 'breached') AS breached_objectives`,
        teamId,
        teamId,
        teamId
      ),
      this.database.all<MonitorStatusRow>(
        `SELECT 'check' AS source, c.type, c.current_status AS status,
         a.kind AS agent_kind, a.last_seen_at AS agent_last_seen_at,
         a.collection_interval_seconds AS agent_collection_interval_seconds,
         COALESCE((SELECT cr.metrics_json::jsonb @> '{"agentTimeout": true}'
          FROM check_results cr WHERE cr.check_id = c.id
          ORDER BY cr.checked_at DESC, cr.id DESC LIMIT 1), FALSE) AS agent_timed_out
         FROM checks c LEFT JOIN agents a ON a.id = c.agent_id WHERE c.team_id = ?
         UNION ALL
         SELECT 'heartbeat', NULL::text, hm.current_status,
         NULL::text, NULL::timestamptz, NULL::integer, FALSE
         FROM heartbeat_monitors hm WHERE hm.team_id = ?`,
        teamId,
        teamId
      ),
      this.database.get<OverviewAvailabilityRow>(
        `${HOURLY_MONITOR_OBSERVATIONS_CTE}, windowed AS (
           SELECT observed_at >= ? AS recent, up_count + degraded_count AS available,
             up_count + degraded_count + down_count AS total, latency_sum, latency_count
           FROM hourly_observations
           WHERE team_id = ? AND category = 'availability' AND observed_at >= ?
         ) SELECT
         100.0 * SUM(available) FILTER (WHERE recent)
           / NULLIF(SUM(total) FILTER (WHERE recent), 0) AS uptime_24h,
         100.0 * SUM(available) / NULLIF(SUM(total), 0) AS uptime_30d,
         SUM(latency_sum) FILTER (WHERE recent)
           / NULLIF(SUM(latency_count) FILTER (WHERE recent), 0) AS latency
         FROM windowed`,
        from24h,
        teamId,
        from30d
      ),
      this.database.all<OverviewTimelineRow>(
        `${HOURLY_MONITOR_OBSERVATIONS_CTE} SELECT
         TO_CHAR(bucket_start AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:00:00.000"Z"') AS bucket,
         SUM(up_count) AS up, SUM(degraded_count) AS degraded, SUM(down_count) AS down,
         ROUND((SUM(latency_sum) / NULLIF(SUM(latency_count), 0))::numeric, 1)::double precision
           AS "latencyMs"
         FROM hourly_observations
         WHERE team_id = ? AND category = 'availability' AND observed_at >= ?
         GROUP BY bucket_start ORDER BY bucket_start`,
        teamId,
        from24h
      ),
      this.maintenance.countActive(teamId),
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
        return resolveMonitorStatus(row.type, row.status, reporterOffline || row.agent_timed_out);
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
      activeMaintenance,
      breachedObjectives: counts.breached_objectives,
      statusTimeline,
      latencyTimeline,
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
