import {
  type LogContext,
  type LogLabelSummary,
  type LogQueryDirection,
  type LogQueryResult,
  type LogVolume,
} from "@mimorii/contracts";
import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { DatabaseService } from "../database/database.service.js";
import { logEntryColumns, mapLogEntry, type LogEntryRow } from "./log-entry-rows.js";
import { hasLogContentFilters, logEntryConditions, logLevelConditions } from "./log-query-sql.js";
import { LogSearchService, type LogSearchCursor } from "./log-search.service.js";
import { logTimeWindow, type LogRangeInput } from "./log-time-window.js";
import { assembleLogVolume, logVolumeSql, logVolumeStep, type LogVolumeRow } from "./log-volume.js";
import { LogsAccessService } from "./logs-access.service.js";

export interface LogEntriesInput extends LogRangeInput {
  limit?: number;
  direction?: LogQueryDirection;
  cursor?: string;
}

@Injectable()
export class LogsQueryService {
  constructor(
    private readonly database: DatabaseService,
    private readonly access: LogsAccessService,
    private readonly search: LogSearchService
  ) {}

  async entries(
    userId: string,
    teamId: string,
    input: LogEntriesInput,
    signal?: AbortSignal
  ): Promise<LogQueryResult> {
    const { query, window } = await this.search.prepare(userId, teamId, input);
    const limit = input.limit ?? 500;
    const entries = await this.search.entries(teamId, query, window, {
      limit,
      direction: input.direction ?? "backward",
      cursor: input.cursor ? parseCursor(input.cursor) : undefined,
      signal,
    });
    const last = entries.at(-1);
    return {
      entries,
      nextCursor: last && entries.length === limit ? `${last.timestamp}|${last.id}` : null,
    };
  }

  async volume(
    userId: string,
    teamId: string,
    input: LogRangeInput,
    signal?: AbortSignal
  ): Promise<LogVolume> {
    const { query, window } = await this.search.prepare(userId, teamId, input);
    const step = logVolumeStep(window);
    const selection = await this.search.streams(teamId, query, window, signal);
    if (selection.kind === "none") return assembleLogVolume(window, step, []);
    const volume = logVolumeSql(
      window,
      step,
      {
        teamId,
        streams: (column) => this.search.streamFilter(teamId, selection, column),
        rollupLevels: logLevelConditions(query, "v.level"),
        entries: logEntryConditions(query),
      },
      !hasLogContentFilters(query)
    );
    const rows = await this.search.all<LogVolumeRow>(volume.sql, volume.parameters, signal);
    return assembleLogVolume(window, step, rows);
  }

  async labels(userId: string, teamId: string, input: LogRangeInput): Promise<LogLabelSummary[]> {
    await this.access.require(userId, teamId, "viewer");
    const window = logTimeWindow(input);
    const rows = await this.database.all<{ name: string; value: string; streams: number }>(
      `SELECT label.key AS name, label.value, COUNT(*) AS streams
       FROM log_streams s, jsonb_each_text(s.labels) label
       WHERE s.team_id = ? AND s.last_seen_at >= ? AND s.first_seen_at <= ?
       GROUP BY label.key, label.value
       ORDER BY label.key, streams DESC, label.value
       LIMIT 10000`,
      teamId,
      window.from.toISOString(),
      window.to.toISOString()
    );
    const labels = new Map<string, LogLabelSummary>();
    for (const row of rows) {
      const label = labels.get(row.name) ?? { name: row.name, valueCount: 0, values: [] };
      label.valueCount += 1;
      if (label.values.length < 100) label.values.push({ value: row.value, streams: row.streams });
      labels.set(row.name, label);
    }
    return [...labels.values()];
  }

  async context(userId: string, teamId: string, entryId: string, limit = 25): Promise<LogContext> {
    await this.access.require(userId, teamId, "viewer");
    if (!/^\d{1,18}$/.test(entryId)) throw new NotFoundException("Log entry not found");
    const row = await this.database.get<LogEntryRow>(
      `SELECT ${logEntryColumns} FROM log_entries e JOIN log_streams s ON s.id = e.stream_id
       WHERE e.id = ? AND e.team_id = ?`,
      entryId,
      teamId
    );
    if (!row) throw new NotFoundException("Log entry not found");
    const entry = mapLogEntry(row);
    const surrounding = (comparison: "<" | ">", order: "ASC" | "DESC") =>
      this.database.all<LogEntryRow>(
        `SELECT ${logEntryColumns} FROM log_entries e JOIN log_streams s ON s.id = e.stream_id
         WHERE e.stream_id = ? AND (e.occurred_at, e.id) ${comparison} (?::timestamptz, ?::bigint)
         ORDER BY e.occurred_at ${order}, e.id ${order} LIMIT ?`,
        entry.streamId,
        entry.timestamp,
        entry.id,
        limit
      );
    const [before, after] = await Promise.all([surrounding("<", "DESC"), surrounding(">", "ASC")]);
    return {
      before: before.map(mapLogEntry).toReversed(),
      entry,
      after: after.map(mapLogEntry),
    };
  }
}

function parseCursor(value: string): LogSearchCursor {
  const separator = value.lastIndexOf("|");
  const timestamp = value.slice(0, separator);
  const id = value.slice(separator + 1);
  if (separator < 1 || !Number.isFinite(new Date(timestamp).getTime()) || !/^\d{1,18}$/.test(id)) {
    throw new BadRequestException("Log cursor is invalid");
  }
  return { timestamp, id };
}
