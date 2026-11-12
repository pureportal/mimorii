import { Injectable } from "@nestjs/common";
import { DatabaseService } from "../../database/database.service.js";
import { ExportDataset, type ExportRequest, type ExportRow } from "../export-dataset.js";

interface IncidentRow {
  id: string;
  title: string;
  status: string;
  impact: string;
  source: string;
  check_name: string | null;
  resource_names: string | null;
  started_at: string;
  acknowledged_at: string | null;
  resolved_at: string | null;
  update_count: number;
}

interface AuditRow {
  id: string;
  created_at: string;
  actor_name: string | null;
  action: string;
  subject_type: string;
  subject_id: string | null;
  metadata_json: string;
}

@Injectable()
export class IncidentsExport extends ExportDataset {
  readonly id = "incidents";
  readonly label = "Incidents";
  override readonly usesTimeRange = true;
  override readonly filters = ["resourceId", "checkId"];
  readonly columns = [
    { key: "id", label: "ID" },
    { key: "title", label: "Title" },
    { key: "status", label: "Status" },
    { key: "impact", label: "Impact" },
    { key: "source", label: "Source" },
    { key: "resources", label: "Resources" },
    { key: "check", label: "Check" },
    { key: "startedAt", label: "Started" },
    { key: "acknowledgedAt", label: "Acknowledged" },
    { key: "resolvedAt", label: "Resolved" },
    { key: "timeToAcknowledgeSeconds", label: "Time to acknowledge (s)" },
    { key: "durationSeconds", label: "Duration (s)" },
    { key: "updates", label: "Updates" },
  ];

  constructor(private readonly database: DatabaseService) {
    super();
  }

  async *rows(request: ExportRequest): AsyncIterable<ExportRow> {
    const { checkId, resourceId } = request.filters;
    const scope = checkId
      ? { sql: "AND i.check_id = ?", parameters: [checkId] }
      : resourceId
        ? {
            sql: "AND EXISTS (SELECT 1 FROM incident_resources x WHERE x.incident_id = i.id AND x.resource_id = ?)",
            parameters: [resourceId],
          }
        : { sql: "", parameters: [] };
    const rows = await this.database.all<IncidentRow>(
      `SELECT i.id, i.title, i.status, i.impact, i.source, c.name AS check_name,
       i.started_at, i.acknowledged_at, i.resolved_at,
       (SELECT STRING_AGG(r.name, ', ' ORDER BY LOWER(r.name)) FROM incident_resources ir
        JOIN resources r ON r.id = ir.resource_id WHERE ir.incident_id = i.id) AS resource_names,
       (SELECT COUNT(*) FROM incident_updates iu WHERE iu.incident_id = i.id) AS update_count
       FROM incidents i LEFT JOIN checks c ON c.id = i.check_id
       WHERE i.team_id = ? AND i.started_at >= ? AND i.started_at <= ? ${scope.sql}
       ORDER BY i.started_at DESC, i.id`,
      request.teamId,
      request.from.toISOString(),
      request.to.toISOString(),
      ...scope.parameters
    );
    const now = Date.now();
    for (const row of rows) {
      const started = new Date(row.started_at).getTime();
      const ended = row.resolved_at ? new Date(row.resolved_at).getTime() : now;
      yield {
        id: row.id,
        title: row.title,
        status: row.status,
        impact: row.impact,
        source: row.source,
        resources: row.resource_names,
        check: row.check_name,
        startedAt: new Date(row.started_at).toISOString(),
        acknowledgedAt: row.acknowledged_at ? new Date(row.acknowledged_at).toISOString() : null,
        resolvedAt: row.resolved_at ? new Date(row.resolved_at).toISOString() : null,
        timeToAcknowledgeSeconds: row.acknowledged_at
          ? Math.round((new Date(row.acknowledged_at).getTime() - started) / 1_000)
          : null,
        durationSeconds: Math.round((ended - started) / 1_000),
        updates: row.update_count,
      };
    }
  }
}

@Injectable()
export class AuditLogExport extends ExportDataset {
  readonly id = "audit-log";
  readonly label = "Audit log";
  override readonly minimumRole = "admin";
  override readonly usesTimeRange = true;
  readonly columns = [
    { key: "createdAt", label: "Time" },
    { key: "actor", label: "Actor" },
    { key: "action", label: "Action" },
    { key: "subjectType", label: "Subject type" },
    { key: "subjectId", label: "Subject ID" },
    { key: "metadata", label: "Details" },
  ];

  constructor(private readonly database: DatabaseService) {
    super();
  }

  async *rows(request: ExportRequest): AsyncIterable<ExportRow> {
    const events = this.pages<AuditRow, { createdAt: string; id: string }>(
      (cursor, limit) =>
        this.database.all<AuditRow>(
          `SELECT a.id, a.created_at, u.name AS actor_name, a.action, a.subject_type, a.subject_id,
           a.metadata_json
           FROM audit_events a LEFT JOIN users u ON u.id = a.user_id
           WHERE a.team_id = ? AND a.created_at >= ? AND a.created_at <= ?
           ${cursor ? "AND (a.created_at, a.id) < (?::timestamptz, ?)" : ""}
           ORDER BY a.created_at DESC, a.id DESC LIMIT ?`,
          request.teamId,
          request.from.toISOString(),
          request.to.toISOString(),
          ...(cursor ? [cursor.createdAt, cursor.id] : []),
          limit
        ),
      (row) => ({ createdAt: new Date(row.created_at).toISOString(), id: row.id })
    );
    for await (const row of events) {
      yield {
        createdAt: new Date(row.created_at).toISOString(),
        actor: row.actor_name,
        action: row.action,
        subjectType: row.subject_type,
        subjectId: row.subject_id,
        metadata: row.metadata_json === "{}" ? null : row.metadata_json,
      };
    }
  }
}
