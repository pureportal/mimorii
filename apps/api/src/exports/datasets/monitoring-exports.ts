import { Injectable } from "@nestjs/common";
import { ResourceHealthService } from "../../common/resource-health.service.js";
import { DatabaseService } from "../../database/database.service.js";
import { ExportDataset, type ExportRequest, type ExportRow } from "../export-dataset.js";

interface ResourceRow {
  id: string;
  name: string;
  kind: string;
  description: string | null;
  tags_json: string;
  check_count: number;
  heartbeat_count: number;
  created_at: string;
}

interface CheckRow {
  id: string;
  name: string;
  type: string;
  resource_name: string;
  current_status: string;
  enabled: number;
  interval_seconds: number;
  timeout_ms: number;
  last_latency_ms: number | null;
  last_checked_at: string | null;
  created_at: string;
}

interface CheckResultRow {
  id: string;
  checked_at: string;
  check_name: string;
  resource_name: string;
  status: string;
  latency_ms: number | null;
  status_code: number | null;
  message: string | null;
}

interface AvailabilityRow {
  day: string;
  check_id: string;
  check_name: string;
  resource_name: string;
  up: number;
  degraded: number;
  down: number;
  average_latency_ms: number | null;
}

@Injectable()
export class ResourcesExport extends ExportDataset {
  readonly id = "resources";
  readonly label = "Resources";
  readonly columns = [
    { key: "id", label: "ID" },
    { key: "name", label: "Name" },
    { key: "kind", label: "Kind" },
    { key: "status", label: "Status" },
    { key: "description", label: "Description" },
    { key: "tags", label: "Tags" },
    { key: "checks", label: "Checks" },
    { key: "heartbeats", label: "Heartbeats" },
    { key: "createdAt", label: "Created" },
  ];

  constructor(
    private readonly database: DatabaseService,
    private readonly health: ResourceHealthService
  ) {
    super();
  }

  async *rows(request: ExportRequest): AsyncIterable<ExportRow> {
    const rows = await this.database.all<ResourceRow>(
      `SELECT r.id, r.name, r.kind, r.description, r.tags_json, r.created_at,
       (SELECT COUNT(*) FROM checks c WHERE c.resource_id = r.id) AS check_count,
       (SELECT COUNT(*) FROM heartbeat_monitors hm WHERE hm.resource_id = r.id) AS heartbeat_count
       FROM resources r WHERE r.team_id = ? ORDER BY LOWER(r.name), r.id`,
      request.teamId
    );
    const statuses = await this.health.forResources(
      request.teamId,
      rows.map((row) => row.id)
    );
    for (const row of rows) {
      yield {
        id: row.id,
        name: row.name,
        kind: row.kind,
        status: statuses.get(row.id) ?? "pending",
        description: row.description,
        tags: (JSON.parse(row.tags_json) as string[]).join(", "),
        checks: row.check_count,
        heartbeats: row.heartbeat_count,
        createdAt: new Date(row.created_at).toISOString(),
      };
    }
  }
}

@Injectable()
export class ChecksExport extends ExportDataset {
  readonly id = "checks";
  readonly label = "Checks";
  override readonly filters = ["resourceId"];
  readonly columns = [
    { key: "id", label: "ID" },
    { key: "name", label: "Name" },
    { key: "type", label: "Type" },
    { key: "resource", label: "Resource" },
    { key: "status", label: "Status" },
    { key: "enabled", label: "Enabled" },
    { key: "intervalSeconds", label: "Interval (s)" },
    { key: "timeoutMs", label: "Timeout (ms)" },
    { key: "lastLatencyMs", label: "Last latency (ms)" },
    { key: "lastCheckedAt", label: "Last checked" },
    { key: "createdAt", label: "Created" },
  ];

  constructor(private readonly database: DatabaseService) {
    super();
  }

  async *rows(request: ExportRequest): AsyncIterable<ExportRow> {
    const resourceId = request.filters.resourceId;
    const rows = await this.database.all<CheckRow>(
      `SELECT c.id, c.name, c.type, r.name AS resource_name, c.current_status, c.enabled,
       c.interval_seconds, c.timeout_ms, c.last_latency_ms, c.last_checked_at, c.created_at
       FROM checks c JOIN resources r ON r.id = c.resource_id
       WHERE c.team_id = ? ${resourceId ? "AND c.resource_id = ?" : ""}
       ORDER BY LOWER(r.name), LOWER(c.name), c.id`,
      request.teamId,
      ...(resourceId ? [resourceId] : [])
    );
    for (const row of rows) {
      yield {
        id: row.id,
        name: row.name,
        type: row.type,
        resource: row.resource_name,
        status: row.enabled ? row.current_status : "paused",
        enabled: Boolean(row.enabled),
        intervalSeconds: row.interval_seconds,
        timeoutMs: row.timeout_ms,
        lastLatencyMs: row.last_latency_ms === null ? null : Math.round(row.last_latency_ms),
        lastCheckedAt: row.last_checked_at ? new Date(row.last_checked_at).toISOString() : null,
        createdAt: new Date(row.created_at).toISOString(),
      };
    }
  }
}

@Injectable()
export class CheckResultsExport extends ExportDataset {
  readonly id = "check-results";
  readonly label = "Check results";
  override readonly usesTimeRange = true;
  override readonly filters = ["resourceId", "checkId"];
  readonly columns = [
    { key: "checkedAt", label: "Checked" },
    { key: "check", label: "Check" },
    { key: "resource", label: "Resource" },
    { key: "status", label: "Status" },
    { key: "latencyMs", label: "Latency (ms)" },
    { key: "statusCode", label: "Status code" },
    { key: "message", label: "Message" },
  ];

  constructor(private readonly database: DatabaseService) {
    super();
  }

  async *rows(request: ExportRequest): AsyncIterable<ExportRow> {
    const scope = checkScope(request);
    const results = this.pages<CheckResultRow, { checkedAt: string; id: string }>(
      (cursor, limit) =>
        this.database.all<CheckResultRow>(
          `SELECT cr.id, cr.checked_at, c.name AS check_name, r.name AS resource_name, cr.status,
           cr.latency_ms, cr.status_code, cr.message
           FROM check_results cr JOIN checks c ON c.id = cr.check_id
           JOIN resources r ON r.id = c.resource_id
           WHERE c.team_id = ? AND cr.checked_at >= ? AND cr.checked_at <= ? ${scope.sql}
           ${cursor ? "AND (cr.checked_at, cr.id) > (?::timestamptz, ?)" : ""}
           ORDER BY cr.checked_at, cr.id LIMIT ?`,
          request.teamId,
          request.from.toISOString(),
          request.to.toISOString(),
          ...scope.parameters,
          ...(cursor ? [cursor.checkedAt, cursor.id] : []),
          limit
        ),
      (row) => ({ checkedAt: new Date(row.checked_at).toISOString(), id: row.id })
    );
    for await (const row of results) {
      yield {
        checkedAt: new Date(row.checked_at).toISOString(),
        check: row.check_name,
        resource: row.resource_name,
        status: row.status,
        latencyMs: row.latency_ms === null ? null : Math.round(row.latency_ms),
        statusCode: row.status_code,
        message: row.message,
      };
    }
  }
}

@Injectable()
export class AvailabilityExport extends ExportDataset {
  readonly id = "availability";
  readonly label = "Daily availability";
  override readonly usesTimeRange = true;
  override readonly filters = ["resourceId", "checkId"];
  readonly columns = [
    { key: "date", label: "Date" },
    { key: "check", label: "Check" },
    { key: "resource", label: "Resource" },
    { key: "availabilityPercent", label: "Availability (%)" },
    { key: "up", label: "Up" },
    { key: "degraded", label: "Degraded" },
    { key: "down", label: "Down" },
    { key: "averageLatencyMs", label: "Average latency (ms)" },
  ];

  constructor(private readonly database: DatabaseService) {
    super();
  }

  async *rows(request: ExportRequest): AsyncIterable<ExportRow> {
    const scope = checkScope(request);
    const rows = await this.database.all<AvailabilityRow>(
      `SELECT TO_CHAR(cr.checked_at AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS day, c.id AS check_id,
       c.name AS check_name, r.name AS resource_name,
       COUNT(*) FILTER (WHERE cr.status = 'up') AS up,
       COUNT(*) FILTER (WHERE cr.status = 'degraded') AS degraded,
       COUNT(*) FILTER (WHERE cr.status = 'down') AS down,
       AVG(cr.latency_ms) FILTER (WHERE cr.status != 'down') AS average_latency_ms
       FROM check_results cr JOIN checks c ON c.id = cr.check_id
       JOIN resources r ON r.id = c.resource_id
       WHERE c.team_id = ? AND cr.checked_at >= ? AND cr.checked_at <= ? ${scope.sql}
       GROUP BY 1, c.id, c.name, r.name
       ORDER BY 1, LOWER(r.name), LOWER(c.name)`,
      request.teamId,
      request.from.toISOString(),
      request.to.toISOString(),
      ...scope.parameters
    );
    for (const row of rows) {
      const total = row.up + row.degraded + row.down;
      yield {
        date: row.day,
        check: row.check_name,
        resource: row.resource_name,
        availabilityPercent: total
          ? Math.round(((row.up + row.degraded) / total) * 10_000) / 100
          : null,
        up: row.up,
        degraded: row.degraded,
        down: row.down,
        averageLatencyMs:
          row.average_latency_ms === null ? null : Math.round(row.average_latency_ms),
      };
    }
  }
}

function checkScope(request: ExportRequest): { sql: string; parameters: string[] } {
  const { checkId, resourceId } = request.filters;
  if (checkId) return { sql: "AND c.id = ?", parameters: [checkId] };
  if (resourceId) return { sql: "AND c.resource_id = ?", parameters: [resourceId] };
  return { sql: "", parameters: [] };
}
