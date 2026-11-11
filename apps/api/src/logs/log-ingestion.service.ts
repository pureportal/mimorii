import {
  logIngestionLimits,
  logsDisabledMessage,
  type LogIngestionRejection,
  type LogIngestionResult,
} from "@mimorii/contracts";
import {
  ForbiddenException,
  HttpException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { hashSecret } from "../common/crypto.js";
import { DatabaseService } from "../database/database.service.js";
import { LogAlertsService } from "./log-alerts.service.js";
import {
  prepareLogBatch,
  type PreparedLogEntry,
  type PreparedLogStream,
} from "./log-entry-preparation.js";
import { LogIngestionLimiter, LogIngestionRateLimitError } from "./log-ingestion-limiter.js";
import type { ParsedLogPayload } from "./log-ingestion-payloads.js";
import { logVolumeResolutions } from "./log-volume.js";

interface IngestionSourceRow {
  id: string;
  team_id: string;
  labels: Record<string, string> | string;
  enabled: boolean;
  retention_days: number;
}

const insertChunkSize = 500;
const sourceSelect = `SELECT ls.id, ls.team_id, ls.labels, COALESCE(tls.enabled, FALSE) AS enabled,
  tls.retention_days
  FROM log_sources ls LEFT JOIN team_log_settings tls ON tls.team_id = ls.team_id`;
const reportedErrors = 20;

@Injectable()
export class LogIngestionService {
  constructor(
    private readonly database: DatabaseService,
    private readonly alerts: LogAlertsService,
    private readonly limiter: LogIngestionLimiter
  ) {}

  async ingest(
    token: string | undefined,
    readPayload: () => ParsedLogPayload,
    bytes: number
  ): Promise<LogIngestionResult> {
    const source = await this.authenticate(token);
    let payload: ParsedLogPayload;
    try {
      payload = readPayload();
    } catch (error) {
      if (error instanceof HttpException) {
        await this.recordStats(source.id, new Date(), {
          accepted: 0,
          rejected: 1,
          bytes,
          error: error.message.slice(0, 500),
        });
      }
      throw error;
    }
    return this.ingestForSource(source, payload, bytes);
  }

  async sendTestEntry(
    teamId: string,
    sourceId: string,
    senderName: string
  ): Promise<LogIngestionResult> {
    const source = await this.database.get<IngestionSourceRow>(
      `${sourceSelect} WHERE ls.id = ? AND ls.team_id = ?`,
      sourceId,
      teamId
    );
    if (!source) throw new NotFoundException("Log source not found");
    if (!source.enabled) throw new ForbiddenException(logsDisabledMessage);
    const message = `Test log from Mimorii, sent by ${senderName}`;
    return this.ingestForSource(
      source,
      {
        entries: [
          {
            index: 0,
            labels: {},
            timestamp: null,
            level: "info",
            message,
            attributes: { mimorii_test: true },
          },
        ],
        rejected: [],
      },
      Buffer.byteLength(message)
    );
  }

  private async ingestForSource(
    source: IngestionSourceRow,
    payload: ParsedLogPayload,
    bytes: number
  ): Promise<LogIngestionResult> {
    const receivedAt = new Date();
    try {
      this.limiter.take(source.team_id, payload.entries.length);
    } catch (error) {
      if (error instanceof LogIngestionRateLimitError) {
        await this.recordStats(source.id, receivedAt, {
          accepted: 0,
          rejected: payload.entries.length + payload.rejected.length,
          bytes,
          error: error.message,
        });
      }
      throw error;
    }
    const batch = prepareLogBatch(payload.entries, {
      sourceLabels: parseLabels(source.labels),
      retentionDays: source.retention_days,
      receivedAt,
    });
    const rejected = [...payload.rejected, ...batch.rejected];
    let accepted = 0;
    let attempted = 0;
    await this.database.transaction(async () => {
      const streamIds = await this.upsertStreams(source.team_id, batch.streams);
      const insertable = batch.entries.filter((entry) => {
        if (streamIds.has(entry.streamHash)) return true;
        rejected.push({ index: entry.index, reason: "The team's stream limit is reached" });
        return false;
      });
      attempted = insertable.length;
      accepted = await this.insertEntries(source.team_id, insertable, streamIds, receivedAt);
    });
    rejected.sort((left, right) => left.index - right.index);
    await this.recordStats(source.id, receivedAt, {
      accepted,
      rejected: rejected.length,
      bytes,
      error: rejected.length
        ? rejectionSummary(rejected, payload.entries.length + payload.rejected.length)
        : null,
    });
    if (accepted) this.alerts.scheduleTeam(source.team_id);
    return {
      accepted,
      duplicates: attempted - accepted,
      rejected: rejected.length,
      truncated: batch.truncated,
      errors: rejected.slice(0, reportedErrors),
    };
  }

  private async authenticate(token: string | undefined): Promise<IngestionSourceRow> {
    if (!token?.startsWith("mim_log_")) {
      throw new UnauthorizedException("A log source token is required");
    }
    const source = await this.database.get<IngestionSourceRow>(
      `${sourceSelect} WHERE ls.token_hash = ?`,
      hashSecret(token)
    );
    if (!source) throw new UnauthorizedException("The log source token is invalid");
    if (!source.enabled) throw new ForbiddenException(logsDisabledMessage);
    return source;
  }

  private async upsertStreams(
    teamId: string,
    streams: Map<string, PreparedLogStream>
  ): Promise<Map<string, string>> {
    const all = [...streams.values()];
    if (!all.length) return new Map();
    const hashes = all.map((stream) => stream.hash);
    const existing = await this.database.all<{ labels_hash: string }>(
      "SELECT labels_hash FROM log_streams WHERE team_id = ? AND labels_hash IN (?)",
      teamId,
      hashes
    );
    const knownHashes = new Set(existing.map((stream) => stream.labels_hash));
    const known = all.filter((stream) => knownHashes.has(stream.hash));
    let created = all.filter((stream) => !knownHashes.has(stream.hash));
    if (created.length) {
      const count = (await this.database.get<{ count: number }>(
        "SELECT COUNT(*) AS count FROM log_streams WHERE team_id = ?",
        teamId
      ))!.count;
      created = created.slice(0, Math.max(0, logIngestionLimits.streamsPerTeam - count));
    }
    if (created.length) {
      await this.database.run(
        `INSERT INTO log_streams (id, team_id, labels, labels_hash, first_seen_at, last_seen_at)
         VALUES ${created.map(() => "(?, ?, ?::jsonb, ?, ?, ?)").join(", ")}
         ON CONFLICT (team_id, labels_hash) DO NOTHING`,
        ...created.flatMap((stream) => [
          randomUUID(),
          teamId,
          JSON.stringify(stream.labels),
          stream.hash,
          stream.firstSeenAt,
          stream.lastSeenAt,
        ])
      );
    }
    if (known.length) {
      await this.database.run(
        `UPDATE log_streams s SET
         first_seen_at = LEAST(s.first_seen_at, v.first_seen_at::timestamptz),
         last_seen_at = GREATEST(s.last_seen_at, v.last_seen_at::timestamptz)
         FROM (VALUES ${known.map(() => "(?, ?, ?)").join(", ")})
           AS v(labels_hash, first_seen_at, last_seen_at)
         WHERE s.team_id = ? AND s.labels_hash = v.labels_hash`,
        ...known.flatMap((stream) => [stream.hash, stream.firstSeenAt, stream.lastSeenAt]),
        teamId
      );
    }
    const rows = await this.database.all<{ id: string; labels_hash: string }>(
      "SELECT id, labels_hash FROM log_streams WHERE team_id = ? AND labels_hash IN (?)",
      teamId,
      [...known, ...created].map((stream) => stream.hash)
    );
    return new Map(rows.map((row) => [row.labels_hash, row.id]));
  }

  private async insertEntries(
    teamId: string,
    entries: PreparedLogEntry[],
    streamIds: Map<string, string>,
    receivedAt: Date
  ): Promise<number> {
    let inserted = 0;
    const receivedAtText = receivedAt.toISOString();
    for (let offset = 0; offset < entries.length; offset += insertChunkSize) {
      const chunk = entries.slice(offset, offset + insertChunkSize);
      const result = await this.database.get<{ inserted: number }>(
        `WITH inserted AS (
           INSERT INTO log_entries
           (team_id, stream_id, occurred_at, received_at, level, message, attributes)
           VALUES ${chunk.map(() => "(?, ?, ?, ?, ?, ?, ?::jsonb)").join(", ")}
           ON CONFLICT (stream_id, occurred_at, (md5(message))) DO NOTHING
           RETURNING team_id, stream_id, occurred_at, level
         ), volume AS (
           INSERT INTO log_volume (team_id, resolution_seconds, bucket_start, stream_id, level, entries)
           SELECT i.team_id, r.seconds,
             date_bin(r.seconds * INTERVAL '1 second', i.occurred_at, TIMESTAMPTZ 'epoch'),
             i.stream_id, i.level, COUNT(*)
           FROM inserted i CROSS JOIN (VALUES ${logVolumeResolutions.map(() => "(?::integer)").join(", ")}) AS r(seconds)
           GROUP BY 1, 2, 3, 4, 5
           ORDER BY 1, 2, 3, 4, 5
           ON CONFLICT (team_id, resolution_seconds, bucket_start, stream_id, level)
           DO UPDATE SET entries = log_volume.entries + EXCLUDED.entries
         )
         SELECT COUNT(*) AS inserted FROM inserted`,
        ...chunk.flatMap((entry) => [
          teamId,
          streamIds.get(entry.streamHash),
          entry.timestamp,
          receivedAtText,
          entry.level,
          entry.message,
          entry.attributes,
        ]),
        ...logVolumeResolutions
      );
      inserted += result?.inserted ?? 0;
    }
    return inserted;
  }

  private async recordStats(
    sourceId: string,
    receivedAt: Date,
    stats: { accepted: number; rejected: number; bytes: number; error: string | null }
  ): Promise<void> {
    const bucket = new Date(Math.floor(receivedAt.getTime() / 3_600_000) * 3_600_000).toISOString();
    const receivedAtText = receivedAt.toISOString();
    await this.database.transaction(async () => {
      await this.database.run(
        `INSERT INTO log_source_stats (source_id, bucket_start, accepted, rejected, bytes)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT (source_id, bucket_start) DO UPDATE SET
         accepted = log_source_stats.accepted + EXCLUDED.accepted,
         rejected = log_source_stats.rejected + EXCLUDED.rejected,
         bytes = log_source_stats.bytes + EXCLUDED.bytes`,
        sourceId,
        bucket,
        stats.accepted,
        stats.rejected,
        stats.bytes
      );
      await this.database.run(
        `UPDATE log_sources SET last_received_at = ?,
         last_error = COALESCE(?, last_error),
         last_error_at = CASE WHEN ? IS NULL THEN last_error_at ELSE ? END
         WHERE id = ?`,
        receivedAtText,
        stats.error,
        stats.error,
        receivedAtText,
        sourceId
      );
    });
  }
}

function rejectionSummary(rejected: LogIngestionRejection[], total: number): string {
  const reasons = new Map<string, number>();
  for (const item of rejected) reasons.set(item.reason, (reasons.get(item.reason) ?? 0) + 1);
  const [reason] = [...reasons.entries()].sort((left, right) => right[1] - left[1])[0]!;
  return `${rejected.length} of ${total} entries rejected: ${reason}`.slice(0, 500);
}

function parseLabels(value: Record<string, string> | string): Record<string, string> {
  return typeof value === "string" ? (JSON.parse(value) as Record<string, string>) : value;
}
