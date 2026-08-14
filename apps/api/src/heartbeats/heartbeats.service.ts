import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { Interval } from "@nestjs/schedule";
import type {
  CreatedHeartbeatMonitor,
  HeartbeatEventSummary,
  HeartbeatEventType,
  HeartbeatMonitorSummary,
} from "@mimorii/contracts";
import { randomUUID } from "node:crypto";
import { AuditService } from "../common/audit.service.js";
import { createSecret, hashSecret } from "../common/crypto.js";
import { DatabaseService } from "../database/database.service.js";
import { IncidentsService } from "../incidents/incidents.service.js";
import { TeamAccessService } from "../teams/team-access.service.js";
import type {
  CreateHeartbeatMonitorDto,
  HeartbeatSignalDto,
  UpdateHeartbeatMonitorDto,
} from "./heartbeats.dto.js";

interface HeartbeatRow {
  id: string;
  team_id: string;
  resource_id: string;
  resource_name: string;
  name: string;
  interval_seconds: number;
  grace_seconds: number;
  max_runtime_seconds: number | null;
  enabled: number;
  current_status: HeartbeatMonitorSummary["status"];
  last_ping_at: string | null;
  last_started_at: string | null;
  running_since: string | null;
  next_expected_at: string | null;
  last_duration_ms: number | null;
  last_message: string | null;
  created_at: string;
}

interface HeartbeatSummaryRow extends HeartbeatRow {
  runs_30d: number;
  successful_runs_30d: number;
  success_rate_30d: number | null;
  average_duration_ms_30d: number | null;
}

interface HeartbeatEventRow {
  id: string;
  heartbeat_id: string;
  type: HeartbeatEventType;
  duration_ms: number | null;
  message: string | null;
  metadata_json: string;
  occurred_at: string;
  received_at: string;
}

type SignalType = Exclude<HeartbeatEventType, "missed">;

@Injectable()
export class HeartbeatsService {
  private sweeping = false;

  constructor(
    private readonly database: DatabaseService,
    private readonly access: TeamAccessService,
    private readonly incidents: IncidentsService,
    private readonly audit: AuditService
  ) {}

  async list(
    userId: string,
    teamId: string,
    resourceId?: string
  ): Promise<HeartbeatMonitorSummary[]> {
    await this.access.require(userId, teamId, "viewer");
    const rows = resourceId
      ? await this.rows("WHERE hm.team_id = ? AND hm.resource_id = ?", teamId, resourceId)
      : await this.rows("WHERE hm.team_id = ?", teamId);
    return rows.map((row) => this.map(row));
  }

  async get(userId: string, teamId: string, id: string): Promise<HeartbeatMonitorSummary> {
    await this.access.require(userId, teamId, "viewer");
    return this.map(await this.requireRow(teamId, id));
  }

  async create(
    userId: string,
    teamId: string,
    input: CreateHeartbeatMonitorDto
  ): Promise<CreatedHeartbeatMonitor> {
    await this.access.require(userId, teamId, "member");
    const count = (await this.database.get<{ count: number }>(
      "SELECT COUNT(*) AS count FROM heartbeat_monitors WHERE team_id = ?",
      teamId
    ))!.count;
    if (count >= 1_000) throw new BadRequestException("Heartbeat monitor limit reached");
    await this.requireResource(teamId, input.resourceId);
    const id = randomUUID();
    const token = createSecret("mim_hb");
    const now = new Date();
    const createdAt = now.toISOString();
    const enabled = input.enabled !== false;
    const nextExpectedAt = enabled
      ? new Date(now.getTime() + input.intervalSeconds * 1_000).toISOString()
      : null;
    await this.database.run(
      `INSERT INTO heartbeat_monitors
       (id, team_id, resource_id, name, token_hash, interval_seconds, grace_seconds,
        max_runtime_seconds, enabled, current_status, next_expected_at, created_by,
        created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      id,
      teamId,
      input.resourceId,
      input.name.trim(),
      hashSecret(token),
      input.intervalSeconds,
      input.graceSeconds ?? 60,
      input.maxRuntimeSeconds ?? null,
      enabled ? 1 : 0,
      enabled ? "pending" : "paused",
      nextExpectedAt,
      userId,
      createdAt,
      createdAt
    );
    await this.audit.record({
      teamId,
      userId,
      action: "heartbeat.created",
      subjectType: "heartbeat",
      subjectId: id,
    });
    return this.createdResult(await this.requireRow(teamId, id), token);
  }

  async update(
    userId: string,
    teamId: string,
    id: string,
    input: UpdateHeartbeatMonitorDto
  ): Promise<HeartbeatMonitorSummary> {
    await this.access.require(userId, teamId, "member");
    const current = await this.requireRow(teamId, id);
    const resourceId = input.resourceId ?? current.resource_id;
    await this.requireResource(teamId, resourceId);
    const intervalSeconds = input.intervalSeconds ?? current.interval_seconds;
    const enabled = input.enabled ?? Boolean(current.enabled);
    const resourceChanged = resourceId !== current.resource_id;
    const restarting = enabled && (!current.enabled || resourceChanged);
    const rescheduled = enabled && input.intervalSeconds !== undefined;
    const now = new Date();
    const updatedAt = now.toISOString();
    const status = enabled ? (restarting ? "pending" : current.current_status) : "paused";
    const nextExpectedAt = enabled
      ? restarting || rescheduled
        ? new Date(now.getTime() + intervalSeconds * 1_000).toISOString()
        : current.next_expected_at
      : null;
    if ((!enabled || resourceChanged) && current.current_status === "down") {
      await this.incidents.resolveForHeartbeat(
        id,
        updatedAt,
        enabled ? "Heartbeat monitor moved to another resource." : "Heartbeat monitoring paused."
      );
    }
    await this.database.run(
      `UPDATE heartbeat_monitors SET resource_id = ?, name = ?, interval_seconds = ?,
       grace_seconds = ?, max_runtime_seconds = ?, enabled = ?, current_status = ?,
       running_since = ?, next_expected_at = ?, updated_at = ?
       WHERE id = ? AND team_id = ?`,
      resourceId,
      input.name?.trim() ?? current.name,
      intervalSeconds,
      input.graceSeconds ?? current.grace_seconds,
      input.maxRuntimeSeconds === undefined ? current.max_runtime_seconds : input.maxRuntimeSeconds,
      enabled ? 1 : 0,
      status,
      restarting || !enabled ? null : current.running_since,
      nextExpectedAt,
      updatedAt,
      id,
      teamId
    );
    await this.audit.record({
      teamId,
      userId,
      action: "heartbeat.updated",
      subjectType: "heartbeat",
      subjectId: id,
    });
    return this.map(await this.requireRow(teamId, id));
  }

  async rotateToken(userId: string, teamId: string, id: string): Promise<CreatedHeartbeatMonitor> {
    await this.access.require(userId, teamId, "member");
    const current = await this.requireRow(teamId, id);
    const token = createSecret("mim_hb");
    await this.database.run(
      "UPDATE heartbeat_monitors SET token_hash = ?, updated_at = ? WHERE id = ?",
      hashSecret(token),
      new Date().toISOString(),
      id
    );
    await this.audit.record({
      teamId,
      userId,
      action: "heartbeat.token_rotated",
      subjectType: "heartbeat",
      subjectId: id,
    });
    return this.createdResult(current, token);
  }

  async remove(userId: string, teamId: string, id: string): Promise<void> {
    await this.access.require(userId, teamId, "admin");
    const current = await this.requireRow(teamId, id);
    if (current.current_status === "down") {
      await this.incidents.resolveForHeartbeat(
        id,
        new Date().toISOString(),
        "Heartbeat monitor deleted."
      );
    }
    await this.database.run(
      "DELETE FROM heartbeat_monitors WHERE id = ? AND team_id = ?",
      id,
      teamId
    );
    await this.audit.record({
      teamId,
      userId,
      action: "heartbeat.deleted",
      subjectType: "heartbeat",
      subjectId: id,
    });
  }

  async history(
    userId: string,
    teamId: string,
    id: string,
    limit = 200
  ): Promise<HeartbeatEventSummary[]> {
    await this.access.require(userId, teamId, "viewer");
    await this.requireRow(teamId, id);
    const rows = await this.database.all<HeartbeatEventRow>(
      `SELECT * FROM heartbeat_events WHERE heartbeat_id = ?
         ORDER BY occurred_at DESC, id DESC LIMIT ?`,
      id,
      Math.min(Math.max(limit, 1), 1_000)
    );
    return rows.map((row) => this.mapEvent(row));
  }

  async signal(token: string, type: SignalType, input: HeartbeatSignalDto = {}) {
    const row = await this.requireToken(token);
    const now = new Date();
    const occurredAt = now.toISOString();
    const metadata = this.signalMetadata(input.metadata);
    let nextExpectedAt = occurredAt;

    await this.database.transaction(async () => {
      const current = await this.database.get<HeartbeatRow>(
        "SELECT * FROM heartbeat_monitors WHERE id = ? FOR UPDATE",
        row.id
      );
      if (!current || !current.enabled) throw new NotFoundException("Heartbeat monitor not found");
      const durationMs =
        input.durationMs ??
        (type !== "started" && current.running_since
          ? Math.max(0, now.getTime() - new Date(current.running_since).getTime())
          : null);
      const message =
        input.message?.trim() || (type === "failed" ? "Heartbeat reported a failure." : null);
      nextExpectedAt = new Date(now.getTime() + current.interval_seconds * 1_000).toISOString();
      await this.database.run(
        `INSERT INTO heartbeat_events
         (id, heartbeat_id, type, duration_ms, message, metadata_json, occurred_at, received_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        randomUUID(),
        row.id,
        type,
        durationMs,
        message,
        JSON.stringify(metadata),
        occurredAt,
        occurredAt
      );
      if (type === "started") {
        await this.database.run(
          `UPDATE heartbeat_monitors SET current_status = 'up', last_ping_at = ?,
           last_started_at = ?, running_since = ?, next_expected_at = ?, last_message = ?,
           updated_at = ? WHERE id = ?`,
          occurredAt,
          occurredAt,
          occurredAt,
          nextExpectedAt,
          message,
          occurredAt,
          row.id
        );
      } else if (type === "succeeded") {
        await this.database.run(
          `UPDATE heartbeat_monitors SET current_status = 'up', last_ping_at = ?,
           running_since = NULL, next_expected_at = ?, last_duration_ms = ?, last_message = ?,
           updated_at = ? WHERE id = ?`,
          occurredAt,
          nextExpectedAt,
          durationMs,
          message,
          occurredAt,
          row.id
        );
      } else {
        await this.database.run(
          `UPDATE heartbeat_monitors SET current_status = 'down', last_ping_at = ?,
           running_since = NULL, next_expected_at = ?, last_duration_ms = ?, last_message = ?,
           updated_at = ? WHERE id = ?`,
          occurredAt,
          nextExpectedAt,
          durationMs,
          message,
          occurredAt,
          row.id
        );
      }
      if (type === "failed") {
        await this.incidents.openForHeartbeat(row.id, message, occurredAt);
      } else if (current.current_status === "down") {
        await this.incidents.resolveForHeartbeat(row.id, occurredAt, "Heartbeat recovered.");
      }
    });
    return {
      accepted: true,
      type,
      receivedAt: occurredAt,
      status: type === "failed" ? "down" : "up",
      nextExpectedAt,
    };
  }

  @Interval(5_000)
  async sweep(): Promise<void> {
    if (process.env.MIMORII_SCHEDULER_ENABLED === "false" || this.sweeping) return;
    this.sweeping = true;
    try {
      const now = new Date();
      const rows = await this.baseRows(
        `WHERE hm.enabled = 1 AND hm.current_status != 'down'
         AND (hm.running_since IS NOT NULL OR hm.next_expected_at <= ?)`,
        now.toISOString()
      );
      for (const row of rows) {
        const deadline = this.deadline(row);
        if (!deadline || deadline.getTime() > now.getTime()) continue;
        await this.recordMiss(row, now.toISOString());
      }
    } finally {
      this.sweeping = false;
    }
  }

  private async recordMiss(row: HeartbeatRow, occurredAt: string): Promise<void> {
    await this.database.transaction(async () => {
      const current = await this.database.get<HeartbeatRow>(
        "SELECT * FROM heartbeat_monitors WHERE id = ? FOR UPDATE",
        row.id
      );
      if (!current || !current.enabled || current.current_status === "down") return;
      const deadline = this.deadline(current);
      if (!deadline || deadline.getTime() > Date.parse(occurredAt)) return;
      const message = current.running_since
        ? "Heartbeat did not complete before its deadline."
        : "Heartbeat was not received before its deadline.";
      await this.database.run(
        `INSERT INTO heartbeat_events
         (id, heartbeat_id, type, message, occurred_at, received_at)
         VALUES (?, ?, 'missed', ?, ?, ?)`,
        randomUUID(),
        row.id,
        message,
        occurredAt,
        occurredAt
      );
      await this.database.run(
        `UPDATE heartbeat_monitors SET current_status = 'down', running_since = NULL,
         last_message = ?, updated_at = ? WHERE id = ? AND current_status != 'down'`,
        message,
        occurredAt,
        row.id
      );
      await this.incidents.openForHeartbeat(row.id, message, occurredAt);
    });
  }

  private rows(where: string, ...parameters: string[]): Promise<HeartbeatSummaryRow[]> {
    return this.database.all<HeartbeatSummaryRow>(
      `SELECT hm.*, r.name AS resource_name,
       COALESCE(hs.runs, 0) AS runs_30d,
       COALESCE(hs.successful_runs, 0) AS successful_runs_30d,
       CASE WHEN COALESCE(hs.runs, 0) = 0 THEN NULL
         ELSE hs.successful_runs * 100.0 / hs.runs END AS success_rate_30d,
       hs.average_duration_ms AS average_duration_ms_30d
       FROM heartbeat_monitors hm JOIN resources r ON r.id = hm.resource_id
       LEFT JOIN (
         SELECT heartbeat_id, COUNT(*) AS runs,
          SUM(CASE WHEN type = 'succeeded' THEN 1 ELSE 0 END) AS successful_runs,
          AVG(CASE WHEN type IN ('succeeded', 'failed') THEN duration_ms END) AS average_duration_ms
         FROM heartbeat_events WHERE type != 'started' AND occurred_at >= ?
         GROUP BY heartbeat_id
       ) hs ON hs.heartbeat_id = hm.id ${where}
       ORDER BY LOWER(hm.name)`,
      new Date(Date.now() - 30 * 86_400_000).toISOString(),
      ...parameters
    );
  }

  private baseRows(where: string, ...parameters: string[]): Promise<HeartbeatRow[]> {
    return this.database.all<HeartbeatRow>(
      `SELECT hm.*, r.name AS resource_name FROM heartbeat_monitors hm
       JOIN resources r ON r.id = hm.resource_id ${where}
       ORDER BY LOWER(hm.name)`,
      ...parameters
    );
  }

  private async requireRow(teamId: string, id: string): Promise<HeartbeatSummaryRow> {
    const row = (await this.rows("WHERE hm.team_id = ? AND hm.id = ?", teamId, id))[0];
    if (!row) throw new NotFoundException("Heartbeat monitor not found");
    return row;
  }

  private async requireToken(token: string): Promise<HeartbeatRow> {
    const row = (
      await this.baseRows("WHERE hm.token_hash = ? AND hm.enabled = 1", hashSecret(token))
    )[0];
    if (!row) throw new NotFoundException("Heartbeat monitor not found");
    return row;
  }

  private async requireResource(teamId: string, resourceId: string): Promise<void> {
    if (
      !(await this.database.get(
        "SELECT id FROM resources WHERE id = ? AND team_id = ?",
        resourceId,
        teamId
      ))
    ) {
      throw new BadRequestException("Resource is unavailable");
    }
  }

  private deadline(row: HeartbeatRow): Date | null {
    if (row.running_since) {
      const runtime = row.max_runtime_seconds ?? row.interval_seconds;
      return new Date(
        new Date(row.running_since).getTime() + (runtime + row.grace_seconds) * 1_000
      );
    }
    return row.next_expected_at
      ? new Date(new Date(row.next_expected_at).getTime() + row.grace_seconds * 1_000)
      : null;
  }

  private signalMetadata(
    input: Record<string, unknown> | undefined
  ): Record<string, string | number | boolean | null> {
    const entries = Object.entries(input ?? {});
    if (entries.length > 20) throw new BadRequestException("Heartbeat metadata is too large");
    const metadata: Record<string, string | number | boolean | null> = {};
    for (const [key, value] of entries) {
      if (!key.trim() || key.length > 64) {
        throw new BadRequestException("Heartbeat metadata key is invalid");
      }
      if (
        value !== null &&
        typeof value !== "string" &&
        typeof value !== "number" &&
        typeof value !== "boolean"
      ) {
        throw new BadRequestException("Heartbeat metadata values must be primitive");
      }
      if (typeof value === "string" && value.length > 500) {
        throw new BadRequestException("Heartbeat metadata value is too long");
      }
      metadata[key] = value;
    }
    if (Buffer.byteLength(JSON.stringify(metadata)) > 8_192) {
      throw new BadRequestException("Heartbeat metadata is too large");
    }
    return metadata;
  }

  private map(row: HeartbeatSummaryRow): HeartbeatMonitorSummary {
    return {
      id: row.id,
      teamId: row.team_id,
      resourceId: row.resource_id,
      resourceName: row.resource_name,
      name: row.name,
      status: row.current_status,
      enabled: Boolean(row.enabled),
      intervalSeconds: row.interval_seconds,
      graceSeconds: row.grace_seconds,
      maxRuntimeSeconds: row.max_runtime_seconds,
      lastPingAt: row.last_ping_at,
      lastStartedAt: row.last_started_at,
      runningSince: row.running_since,
      nextExpectedAt: row.next_expected_at,
      nextDeadlineAt: this.deadline(row)?.toISOString() ?? null,
      lastDurationMs: row.last_duration_ms,
      lastMessage: row.last_message,
      runs30d: row.runs_30d,
      successfulRuns30d: row.successful_runs_30d,
      successRate30d: row.success_rate_30d,
      averageDurationMs30d: row.average_duration_ms_30d,
      createdAt: row.created_at,
    };
  }

  private mapEvent(row: HeartbeatEventRow): HeartbeatEventSummary {
    return {
      id: row.id,
      heartbeatId: row.heartbeat_id,
      type: row.type,
      durationMs: row.duration_ms,
      message: row.message,
      metadata: JSON.parse(row.metadata_json) as HeartbeatEventSummary["metadata"],
      occurredAt: row.occurred_at,
      receivedAt: row.received_at,
    };
  }

  private createdResult(row: HeartbeatSummaryRow, token: string): CreatedHeartbeatMonitor {
    const baseUrl = (process.env.MIMORII_PUBLIC_URL ?? "http://localhost:4310").replace(/\/$/, "");
    const apiBase = baseUrl.endsWith("/api") ? baseUrl : `${baseUrl}/api`;
    return {
      heartbeat: this.map(row),
      pingToken: token,
      pingUrl: `${apiBase}/heartbeats/${encodeURIComponent(token)}`,
    };
  }
}
