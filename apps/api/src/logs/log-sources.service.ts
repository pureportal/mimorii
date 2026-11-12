import type {
  CreatedLogSource,
  LogIngestionEndpoints,
  LogSourceList,
  LogSourceSummary,
} from "@mimorii/contracts";
import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { AuditService } from "../common/audit.service.js";
import { createSecret, hashSecret } from "../common/crypto.js";
import { DatabaseService } from "../database/database.service.js";
import { LogIngestionService } from "./log-ingestion.service.js";
import { reservedLogLabel, validateLogLabels } from "./log-labels.js";
import type { CreateLogSourceDto, UpdateLogSourceDto } from "./logs.dto.js";
import { LogsAccessService } from "./logs-access.service.js";
import { publicBaseUrl } from "../common/public-url.js";

interface LogSourceRow {
  id: string;
  name: string;
  labels: Record<string, string> | string;
  token_prefix: string;
  last_received_at: string | null;
  last_error: string | null;
  last_error_at: string | null;
  accepted_24h: number;
  rejected_24h: number;
  bytes_24h: number;
  created_at: string;
}

const sourceLimit = 50;
const sourceSelect = `SELECT ls.id, ls.name, ls.labels, ls.token_prefix, ls.last_received_at,
  ls.last_error, ls.last_error_at, ls.created_at,
  COALESCE(stats.accepted, 0) AS accepted_24h, COALESCE(stats.rejected, 0) AS rejected_24h,
  COALESCE(stats.bytes, 0) AS bytes_24h
  FROM log_sources ls
  LEFT JOIN (
    SELECT source_id, SUM(accepted) AS accepted, SUM(rejected) AS rejected, SUM(bytes) AS bytes
    FROM log_source_stats WHERE bucket_start >= ? GROUP BY source_id
  ) stats ON stats.source_id = ls.id`;

@Injectable()
export class LogSourcesService {
  constructor(
    private readonly database: DatabaseService,
    private readonly access: LogsAccessService,
    private readonly audit: AuditService,
    private readonly ingestion: LogIngestionService
  ) {}

  async sendTest(
    userId: string,
    userName: string,
    teamId: string,
    id: string
  ): Promise<LogSourceSummary> {
    await this.access.require(userId, teamId, "admin");
    const result = await this.ingestion.sendTestEntry(teamId, id, userName);
    if (!result.accepted) {
      throw new BadRequestException(result.errors[0]?.reason ?? "The test log was not stored");
    }
    return this.requireSource(teamId, id);
  }

  async list(userId: string, teamId: string): Promise<LogSourceList> {
    await this.access.require(userId, teamId, "admin");
    const rows = await this.database.all<LogSourceRow>(
      `${sourceSelect} WHERE ls.team_id = ? ORDER BY LOWER(ls.name), ls.created_at`,
      statsSince(),
      teamId
    );
    return { sources: rows.map(mapSource), endpoints: ingestionEndpoints() };
  }

  async create(
    userId: string,
    teamId: string,
    input: CreateLogSourceDto
  ): Promise<CreatedLogSource> {
    await this.access.require(userId, teamId, "admin");
    const count = (await this.database.get<{ count: number }>(
      "SELECT COUNT(*) AS count FROM log_sources WHERE team_id = ?",
      teamId
    ))!.count;
    if (count >= sourceLimit) throw new BadRequestException("Log source limit reached");
    const labels = sourceLabels(input.labels ?? {});
    const id = randomUUID();
    const token = createSecret("mim_log");
    const now = new Date().toISOString();
    await this.database.run(
      `INSERT INTO log_sources
       (id, team_id, name, labels, token_prefix, token_hash, created_by, created_at, updated_at)
       VALUES (?, ?, ?, ?::jsonb, ?, ?, ?, ?, ?)`,
      id,
      teamId,
      input.name.trim(),
      JSON.stringify(labels),
      token.slice(0, 16),
      hashSecret(token),
      userId,
      now,
      now
    );
    await this.audit.record({
      teamId,
      userId,
      action: "log_source.created",
      subjectType: "log_source",
      subjectId: id,
    });
    return { source: await this.requireSource(teamId, id), token, endpoints: ingestionEndpoints() };
  }

  async update(
    userId: string,
    teamId: string,
    id: string,
    input: UpdateLogSourceDto
  ): Promise<LogSourceSummary> {
    await this.access.require(userId, teamId, "admin");
    const current = await this.requireSource(teamId, id);
    const labels = input.labels ? sourceLabels(input.labels) : current.labels;
    await this.database.run(
      `UPDATE log_sources SET name = ?, labels = ?::jsonb, updated_at = ?
       WHERE id = ? AND team_id = ?`,
      input.name?.trim() ?? current.name,
      JSON.stringify(labels),
      new Date().toISOString(),
      id,
      teamId
    );
    await this.audit.record({
      teamId,
      userId,
      action: "log_source.updated",
      subjectType: "log_source",
      subjectId: id,
    });
    return this.requireSource(teamId, id);
  }

  async rotateToken(userId: string, teamId: string, id: string): Promise<CreatedLogSource> {
    await this.access.require(userId, teamId, "admin");
    await this.requireSource(teamId, id);
    const token = createSecret("mim_log");
    await this.database.run(
      `UPDATE log_sources SET token_prefix = ?, token_hash = ?, updated_at = ?
       WHERE id = ? AND team_id = ?`,
      token.slice(0, 16),
      hashSecret(token),
      new Date().toISOString(),
      id,
      teamId
    );
    await this.audit.record({
      teamId,
      userId,
      action: "log_source.token_rotated",
      subjectType: "log_source",
      subjectId: id,
    });
    return { source: await this.requireSource(teamId, id), token, endpoints: ingestionEndpoints() };
  }

  async remove(userId: string, teamId: string, id: string): Promise<void> {
    await this.access.require(userId, teamId, "admin");
    const result = await this.database.run(
      "DELETE FROM log_sources WHERE id = ? AND team_id = ?",
      id,
      teamId
    );
    if (result.changes === 0) throw new NotFoundException("Log source not found");
    await this.audit.record({
      teamId,
      userId,
      action: "log_source.deleted",
      subjectType: "log_source",
      subjectId: id,
    });
  }

  async requireSource(teamId: string, id: string): Promise<LogSourceSummary> {
    const row = await this.database.get<LogSourceRow>(
      `${sourceSelect} WHERE ls.id = ? AND ls.team_id = ?`,
      statsSince(),
      id,
      teamId
    );
    if (!row) throw new NotFoundException("Log source not found");
    return mapSource(row);
  }
}

function sourceLabels(labels: Record<string, unknown>): Record<string, string> {
  if (reservedLogLabel in labels) {
    throw new BadRequestException(`"${reservedLogLabel}" is set from each log entry`);
  }
  return validateLogLabels(labels);
}

function statsSince(): string {
  return new Date(Date.now() - 24 * 3_600_000).toISOString();
}

function ingestionEndpoints(): LogIngestionEndpoints {
  const baseUrl = publicBaseUrl();
  const apiBase = baseUrl.endsWith("/api") ? baseUrl : `${baseUrl}/api`;
  return {
    native: `${apiBase}/logs/push`,
    loki: `${apiBase}/loki/api/v1/push`,
    otlp: `${apiBase}/otlp/v1/logs`,
  };
}

function mapSource(row: LogSourceRow): LogSourceSummary {
  return {
    id: row.id,
    name: row.name,
    labels:
      typeof row.labels === "string"
        ? (JSON.parse(row.labels) as Record<string, string>)
        : row.labels,
    tokenPrefix: row.token_prefix,
    lastReceivedAt: optionalIso(row.last_received_at),
    accepted24h: Number(row.accepted_24h),
    rejected24h: Number(row.rejected_24h),
    bytes24h: Number(row.bytes_24h),
    lastError: row.last_error,
    lastErrorAt: optionalIso(row.last_error_at),
    createdAt: new Date(row.created_at).toISOString(),
  };
}

function optionalIso(value: string | null): string | null {
  return value ? new Date(value).toISOString() : null;
}
