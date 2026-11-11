import type { LogEntry, LogQuery, LogQueryDirection, TeamRole } from "@mimorii/contracts";
import { Injectable } from "@nestjs/common";
import { settleInOrder } from "../common/promises.js";
import { DatabaseService } from "../database/database.service.js";
import { logEntryColumns, mapLogEntry, type LogEntryRow } from "./log-entry-rows.js";
import {
  logEntryConditions,
  logQueryRegexPatterns,
  logStreamConditions,
  logStreamMatchers,
  parseLogQueryInput,
  sqlAnd,
  withLogQueryErrors,
  type SqlConditions,
} from "./log-query-sql.js";
import { LogSearchDatabase } from "./log-search-database.js";
import { logTimeWindow, type LogRangeInput } from "./log-time-window.js";
import { LogsAccessService } from "./logs-access.service.js";

export interface LogSearchWindow {
  from: Date;
  to: Date;
}

export interface LogSearchCursor {
  timestamp: string;
  id: string;
}

export type LogStreamSelection =
  | { kind: "all" }
  | { kind: "none" }
  | { kind: "ids"; ids: string[] }
  | { kind: "matched"; conditions: SqlConditions; window: LogSearchWindow };

export interface LogSearchScope {
  where: string;
  parameters: unknown[];
}

export interface LogSearchEntriesOptions {
  limit: number;
  direction: LogQueryDirection;
  cursor?: LogSearchCursor;
  signal?: AbortSignal;
}

const resolvedStreamLimit = 1_000;

@Injectable()
export class LogSearchService {
  constructor(
    private readonly database: DatabaseService,
    private readonly searchDatabase: LogSearchDatabase,
    private readonly access: LogsAccessService
  ) {}

  async prepare(
    userId: string,
    teamId: string,
    input: LogRangeInput,
    minimum: TeamRole = "viewer"
  ): Promise<{ query: LogQuery; window: LogSearchWindow }> {
    const query = parseLogQueryInput(input.query);
    const window = logTimeWindow(input);
    await settleInOrder(this.access.require(userId, teamId, minimum), this.validate(query));
    return { query, window };
  }

  async streams(
    teamId: string,
    query: LogQuery,
    window: LogSearchWindow,
    signal?: AbortSignal
  ): Promise<LogStreamSelection> {
    const matchers = logStreamMatchers(query);
    if (!matchers.length) return { kind: "all" };
    const conditions = logStreamConditions(matchers, "s.labels");
    const rows = await this.searchDatabase.all<{ id: string }>(
      `SELECT s.id FROM log_streams s
       WHERE s.team_id = ? AND s.last_seen_at >= ? AND s.first_seen_at <= ? ${sqlAnd(conditions)}
       LIMIT ?`,
      [
        teamId,
        window.from.toISOString(),
        window.to.toISOString(),
        ...conditions.parameters,
        resolvedStreamLimit + 1,
      ],
      signal
    );
    if (!rows.length) return { kind: "none" };
    if (rows.length > resolvedStreamLimit) return { kind: "matched", conditions, window };
    return { kind: "ids", ids: rows.map((row) => row.id) };
  }

  streamFilter(teamId: string, selection: LogStreamSelection, column: string): SqlConditions {
    if (selection.kind === "ids") {
      return { clauses: [`${column} IN (?)`], parameters: [selection.ids] };
    }
    if (selection.kind === "matched") {
      return {
        clauses: [
          `${column} IN (SELECT s.id FROM log_streams s
            WHERE s.team_id = ? AND s.last_seen_at >= ? AND s.first_seen_at <= ?
            ${sqlAnd(selection.conditions)})`,
        ],
        parameters: [
          teamId,
          selection.window.from.toISOString(),
          selection.window.to.toISOString(),
          ...selection.conditions.parameters,
        ],
      };
    }
    return { clauses: [], parameters: [] };
  }

  async scope(
    teamId: string,
    query: LogQuery,
    window: LogSearchWindow,
    signal?: AbortSignal
  ): Promise<LogSearchScope | null> {
    const selection = await this.streams(teamId, query, window, signal);
    if (selection.kind === "none") return null;
    const streams = this.streamFilter(teamId, selection, "e.stream_id");
    const entries = logEntryConditions(query);
    return {
      where: `e.team_id = ? AND e.occurred_at >= ? AND e.occurred_at <= ?
        ${sqlAnd(streams)} ${sqlAnd(entries)}`,
      parameters: [
        teamId,
        window.from.toISOString(),
        window.to.toISOString(),
        ...streams.parameters,
        ...entries.parameters,
      ],
    };
  }

  async entries(
    teamId: string,
    query: LogQuery,
    window: LogSearchWindow,
    options: LogSearchEntriesOptions
  ): Promise<LogEntry[]> {
    const scope = await this.scope(teamId, query, window, options.signal);
    if (!scope) return [];
    const backward = options.direction === "backward";
    const cursorClause = options.cursor
      ? `AND (e.occurred_at, e.id) ${backward ? "<" : ">"} (?::timestamptz, ?::bigint)`
      : "";
    const order = backward ? "DESC" : "ASC";
    const rows = await this.searchDatabase.all<LogEntryRow>(
      `SELECT ${logEntryColumns} FROM log_entries e JOIN log_streams s ON s.id = e.stream_id
       WHERE ${scope.where} ${cursorClause}
       ORDER BY e.occurred_at ${order}, e.id ${order} LIMIT ?`,
      [
        ...scope.parameters,
        ...(options.cursor ? [options.cursor.timestamp, options.cursor.id] : []),
        options.limit,
      ],
      options.signal
    );
    return rows.map(mapLogEntry);
  }

  async count(
    teamId: string,
    query: LogQuery,
    window: LogSearchWindow,
    cap: number
  ): Promise<number> {
    const scope = await this.scope(teamId, query, window);
    if (!scope) return 0;
    const [row] = await this.searchDatabase.all<{ count: number }>(
      `SELECT COUNT(*) AS count FROM (SELECT 1 FROM log_entries e WHERE ${scope.where} LIMIT ?) matched`,
      [...scope.parameters, cap]
    );
    return row?.count ?? 0;
  }

  all<T>(sql: string, parameters: unknown[], signal?: AbortSignal): Promise<T[]> {
    return this.searchDatabase.all<T>(sql, parameters, signal);
  }

  async validate(query: LogQuery): Promise<void> {
    const patterns = logQueryRegexPatterns(query);
    if (!patterns.length) return;
    await withLogQueryErrors(() =>
      this.database.get(`SELECT ${patterns.map(() => "'' ~ ?").join(", ")}`, ...patterns)
    );
  }
}
