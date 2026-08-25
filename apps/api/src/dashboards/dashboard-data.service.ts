import { Injectable } from "@nestjs/common";
import type {
  DashboardIncidentsItem,
  DashboardItem,
  DashboardMetricItem,
  DashboardMetricViewItem,
  DashboardStatusItem,
  DashboardStatusViewItem,
  DashboardUptimeItem,
  DashboardUptimeViewItem,
  DashboardView,
  DashboardViewItem,
  IncidentImpact,
  IncidentStatus,
  ResourceMetricName,
} from "@mimorii/contracts";
import { resourceMetricNames } from "@mimorii/contracts";
import { MONITOR_OBSERVATIONS_CTE } from "../common/monitor-observations.js";
import { ResourceHealthService } from "../common/resource-health.service.js";
import { ResourceTelemetryService } from "../common/resource-telemetry.service.js";
import { DatabaseService } from "../database/database.service.js";

interface IncidentRow {
  id: string;
  title: string;
  impact: IncidentImpact;
  status: IncidentStatus;
  started_at: string;
  resolved_at: string | null;
}

@Injectable()
export class DashboardDataService {
  constructor(
    private readonly database: DatabaseService,
    private readonly telemetry: ResourceTelemetryService,
    private readonly health: ResourceHealthService
  ) {}

  async render(
    teamId: string,
    dashboard: { name: string; slug: string; updatedAt: string },
    items: DashboardItem[]
  ): Promise<DashboardView> {
    const resourceNames = await this.resourceNames(
      teamId,
      items.flatMap((item) => (item.resourceId ? [item.resourceId] : []))
    );
    return {
      name: dashboard.name,
      slug: dashboard.slug,
      items: await Promise.all(
        items.map(async (item, index) => ({
          ...(await this.resolveItem(teamId, item, resourceNames)),
          id: `item-${index + 1}`,
        }))
      ),
      updatedAt: dashboard.updatedAt,
    };
  }

  private resolveItem(
    teamId: string,
    item: DashboardItem,
    resourceNames: Map<string, string>
  ): Promise<DashboardViewItem> {
    switch (item.type) {
      case "metric":
        return this.metric(
          teamId,
          item,
          item.resourceId ? resourceNames.get(item.resourceId)! : null
        );
      case "uptime":
        return this.uptime(teamId, item, resourceNames.get(item.resourceId)!);
      case "status":
        return this.status(teamId, item, resourceNames.get(item.resourceId)!);
      case "incidents":
        return this.incidents(teamId, item, resourceNames);
      default:
        return unreachable(item);
    }
  }

  private async metric(
    teamId: string,
    item: DashboardMetricItem,
    resourceName: string | null
  ): Promise<DashboardMetricViewItem> {
    if (item.metric === "monitorCount") {
      const resourceScope = item.resourceId ? "AND resource_id = ?" : "";
      const parameters = item.resourceId ? [teamId, item.resourceId] : [teamId];
      const row = await this.database.get<{ value: number }>(
        `SELECT
         (SELECT COUNT(*) FROM checks WHERE team_id = ? ${resourceScope}) +
         (SELECT COUNT(*) FROM heartbeat_monitors WHERE team_id = ? ${resourceScope}) AS value`,
        ...parameters,
        ...parameters
      );
      return {
        ...this.viewBase(item),
        metric: item.metric,
        windowDays: item.windowDays,
        resourceName,
        value: row?.value ?? 0,
        format: "count",
        series: [],
      };
    }

    if (item.metric === "openIncidents") {
      const row = item.resourceId
        ? await this.database.get<{ value: number }>(
            `SELECT COUNT(DISTINCT i.id) AS value FROM incidents i
             JOIN incident_resources ir ON ir.incident_id = i.id
             WHERE i.team_id = ? AND i.status != 'resolved' AND ir.resource_id = ?`,
            teamId,
            item.resourceId
          )
        : await this.database.get<{ value: number }>(
            "SELECT COUNT(*) AS value FROM incidents WHERE team_id = ? AND status != 'resolved'",
            teamId
          );
      return {
        ...this.viewBase(item),
        metric: item.metric,
        windowDays: item.windowDays,
        resourceName,
        value: row?.value ?? 0,
        format: "count",
        series: [],
      };
    }

    if (resourceMetricNames.includes(item.metric as ResourceMetricName)) {
      const from = new Date(Date.now() - item.windowDays * 86_400_000).toISOString();
      const series = (
        await this.telemetry.series(item.resourceId!, from, new Date().toISOString(), [
          item.metric as ResourceMetricName,
        ])
      )[0]!.points;
      return {
        ...this.viewBase(item),
        metric: item.metric,
        windowDays: item.windowDays,
        resourceName,
        value: series.at(-1)?.value ?? null,
        format: item.metric.endsWith("Percent") ? "percent" : "number",
        series,
      };
    }

    const resourceScope = item.resourceId ? "AND o.resource_id = ?" : "";
    const from = new Date(Date.now() - item.windowDays * 86_400_000).toISOString();
    const row = await this.database.get<{ value: number | null }>(
      `${MONITOR_OBSERVATIONS_CTE} SELECT AVG(${
        item.metric === "uptime"
          ? "CASE WHEN o.status = 'down' THEN 0.0 ELSE 100.0 END"
          : "CASE WHEN o.status != 'down' THEN o.latency_ms END"
      }) AS value
       FROM observations o WHERE o.team_id = ? AND o.observed_at >= ? ${resourceScope}`,
      teamId,
      from,
      ...(item.resourceId ? [item.resourceId] : [])
    );
    const series = await this.database.all<{ observedAt: string; value: number }>(
      `${MONITOR_OBSERVATIONS_CTE} SELECT o.observed_at AS "observedAt", ${
        item.metric === "uptime"
          ? "CASE WHEN o.status = 'down' THEN 0.0 ELSE 100.0 END"
          : "o.latency_ms"
      } AS value
       FROM observations o WHERE o.team_id = ? AND o.observed_at >= ? ${resourceScope}
       AND ${item.metric === "uptime" ? "TRUE" : "o.latency_ms IS NOT NULL"}
       ORDER BY o.observed_at`,
      teamId,
      from,
      ...(item.resourceId ? [item.resourceId] : [])
    );
    return {
      ...this.viewBase(item),
      metric: item.metric,
      windowDays: item.windowDays,
      resourceName,
      value: row?.value ?? null,
      format: item.metric === "uptime" ? "percent" : "milliseconds",
      series,
    };
  }

  private async uptime(
    teamId: string,
    item: DashboardUptimeItem,
    resourceName: string
  ): Promise<DashboardUptimeViewItem> {
    const from = this.startOfWindow(item.windowDays);
    const aggregate = await this.database.get<{ uptime: number | null }>(
      `${MONITOR_OBSERVATIONS_CTE} SELECT
       AVG(CASE WHEN status = 'down' THEN 0.0 ELSE 100.0 END) AS uptime
       FROM observations WHERE team_id = ? AND resource_id = ? AND observed_at >= ?`,
      teamId,
      item.resourceId,
      from.toISOString()
    );
    const rows = await this.database.all<{ date: string; uptime: number }>(
      `${MONITOR_OBSERVATIONS_CTE} SELECT
       TO_CHAR(observed_at AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS date,
       AVG(CASE WHEN status = 'down' THEN 0.0 ELSE 100.0 END) AS uptime
       FROM observations WHERE team_id = ? AND resource_id = ? AND observed_at >= ?
       GROUP BY TO_CHAR(observed_at AT TIME ZONE 'UTC', 'YYYY-MM-DD')`,
      teamId,
      item.resourceId,
      from.toISOString()
    );
    const byDate = new Map(rows.map((row) => [row.date, row.uptime]));
    return {
      ...this.viewBase(item),
      windowDays: item.windowDays,
      resourceName,
      uptime: aggregate?.uptime ?? null,
      dailyUptime: Array.from({ length: item.windowDays }, (_, index) => {
        const date = new Date(from);
        date.setUTCDate(date.getUTCDate() + index);
        const key = date.toISOString().slice(0, 10);
        return { date: key, uptime: byDate.get(key) ?? null };
      }),
    };
  }

  private async status(
    teamId: string,
    item: DashboardStatusItem,
    resourceName: string
  ): Promise<DashboardStatusViewItem> {
    const statuses = await this.health.forResources(teamId, [item.resourceId]);
    return {
      ...this.viewBase(item),
      resourceName,
      status: statuses.get(item.resourceId) ?? "pending",
    };
  }

  private async incidents(
    teamId: string,
    item: DashboardIncidentsItem,
    resourceNames: Map<string, string>
  ): Promise<DashboardViewItem> {
    const rows = await this.database.all<IncidentRow>(
      `SELECT i.id, i.title, i.impact, i.status, i.started_at, i.resolved_at
       FROM incidents i WHERE i.team_id = ?
       ${
         item.resourceId
           ? "AND EXISTS (SELECT 1 FROM incident_resources ir WHERE ir.incident_id = i.id AND ir.resource_id = ?)"
           : ""
       }
       ORDER BY i.started_at DESC LIMIT ?`,
      teamId,
      ...(item.resourceId ? [item.resourceId] : []),
      item.limit
    );
    return {
      ...this.viewBase(item),
      resourceName: item.resourceId ? resourceNames.get(item.resourceId)! : null,
      incidents: await Promise.all(
        rows.map(async (row, index) => ({
          id: `incident-${index + 1}`,
          title: row.title,
          impact: row.impact,
          status: row.status,
          startedAt: row.started_at,
          resolvedAt: row.resolved_at,
          resources: item.resourceId
            ? [resourceNames.get(item.resourceId)!]
            : await this.incidentResources(row.id),
        }))
      ),
    };
  }

  private async resourceNames(teamId: string, resourceIds: string[]): Promise<Map<string, string>> {
    const ids = [...new Set(resourceIds)];
    if (ids.length === 0) return new Map();
    const rows = await this.database.all<{ id: string; name: string }>(
      `SELECT id, name FROM resources WHERE team_id = ? AND id IN (${ids.map(() => "?").join(",")})`,
      teamId,
      ...ids
    );
    return new Map(rows.map((row) => [row.id, row.name]));
  }

  private async incidentResources(incidentId: string): Promise<string[]> {
    const rows = await this.database.all<{ name: string }>(
      `SELECT r.name FROM resources r JOIN incident_resources ir ON ir.resource_id = r.id
       WHERE ir.incident_id = ? ORDER BY LOWER(r.name)`,
      incidentId
    );
    return rows.map((row) => row.name);
  }

  private startOfWindow(days: number): Date {
    const from = new Date();
    from.setUTCDate(from.getUTCDate() - days + 1);
    from.setUTCHours(0, 0, 0, 0);
    return from;
  }

  private viewBase<T extends DashboardItem>(item: T): Pick<T, "id" | "type" | "title" | "width"> {
    return { id: item.id, type: item.type, title: item.title, width: item.width };
  }
}

function unreachable(_value: never): never {
  throw new Error("Unsupported dashboard item");
}
