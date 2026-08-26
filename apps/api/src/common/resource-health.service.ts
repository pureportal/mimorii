import { Injectable } from "@nestjs/common";
import type {
  AgentKind,
  AgentStatus,
  CheckStatus,
  CheckType,
  MonitorStatus,
} from "@mimorii/contracts";
import { DatabaseService } from "../database/database.service.js";
import { resolveAgentStatus } from "./agent-status.js";
import {
  resolveHeartbeatStatus,
  resolveMonitorStatus,
  resolveResourceStatus,
} from "./health-status.js";

interface ResourceHealthRow {
  resource_id: string;
  source: "resource" | "check" | "heartbeat";
  status: CheckStatus | null;
  check_type: CheckType | null;
  agent_kind: AgentKind | null;
  agent_last_seen_at: string | null;
  agent_collection_interval_seconds: number | null;
  latest_metrics_json: string | null;
}

interface ResourceHealthInput {
  agentStatus: AgentStatus | null;
  monitorStatuses: MonitorStatus[];
}

@Injectable()
export class ResourceHealthService {
  constructor(private readonly database: DatabaseService) {}

  async forResources(
    teamId: string,
    resourceIds: readonly string[]
  ): Promise<Map<string, MonitorStatus>> {
    const ids = [...new Set(resourceIds)];
    if (ids.length === 0) return new Map();
    const placeholders = ids.map(() => "?").join(",");
    const rows = await this.database.all<ResourceHealthRow>(
      `SELECT r.id AS resource_id, 'resource' AS source, NULL::text AS status,
         NULL::text AS check_type,
         a.kind AS agent_kind, a.last_seen_at AS agent_last_seen_at,
         a.collection_interval_seconds AS agent_collection_interval_seconds,
         NULL::text AS latest_metrics_json
       FROM resources r
       LEFT JOIN agents a ON a.resource_id = r.id AND a.revoked_at IS NULL
       WHERE r.team_id = ? AND r.id IN (${placeholders})
       UNION ALL
       SELECT c.resource_id, 'check', c.current_status, c.type,
         a.kind, a.last_seen_at, a.collection_interval_seconds,
         (SELECT cr.metrics_json FROM check_results cr WHERE cr.check_id = c.id
          ORDER BY cr.checked_at DESC, cr.id DESC LIMIT 1)
       FROM checks c
       LEFT JOIN agents a ON a.id = c.agent_id
       WHERE c.team_id = ? AND c.resource_id IN (${placeholders})
       UNION ALL
       SELECT hm.resource_id, 'heartbeat', hm.current_status, NULL::text,
         NULL::text, NULL::timestamptz, NULL::integer, NULL::text
       FROM heartbeat_monitors hm
       WHERE hm.team_id = ? AND hm.resource_id IN (${placeholders})`,
      teamId,
      ...ids,
      teamId,
      ...ids,
      teamId,
      ...ids
    );
    const inputs = new Map<string, ResourceHealthInput>(
      ids.map((id) => [id, { agentStatus: null, monitorStatuses: [] }])
    );

    for (const row of rows) {
      const input = inputs.get(row.resource_id);
      if (!input) continue;
      if (row.source === "resource") {
        input.agentStatus = this.agentStatus(row);
        continue;
      }
      if (!row.status) throw new Error(`Resource health ${row.source} status is missing`);
      if (row.source === "heartbeat") {
        input.monitorStatuses.push(resolveHeartbeatStatus(row.status));
        continue;
      }
      if (!row.check_type) throw new Error("Resource health check type is missing");
      input.monitorStatuses.push(
        resolveMonitorStatus(row.check_type, row.status, this.reportingDown(row))
      );
    }

    return new Map(
      [...inputs].map(([id, input]) => [
        id,
        resolveResourceStatus(input.monitorStatuses, input.agentStatus),
      ])
    );
  }

  private reportingDown(row: ResourceHealthRow): boolean {
    if (row.status !== "pending" && row.latest_metrics_json) {
      const metrics: unknown = JSON.parse(row.latest_metrics_json);
      if (
        typeof metrics === "object" &&
        metrics !== null &&
        "agentTimeout" in metrics &&
        metrics.agentTimeout === true
      ) {
        return true;
      }
    }
    return this.agentStatus(row) === "offline";
  }

  private agentStatus(row: ResourceHealthRow): AgentStatus | null {
    if (!row.agent_kind) return null;
    return resolveAgentStatus({
      kind: row.agent_kind,
      collectionIntervalSeconds: row.agent_collection_interval_seconds ?? 30,
      lastSeenAt: row.agent_last_seen_at,
    });
  }
}
