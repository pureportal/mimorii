import type {
  LogAttributeValue,
  LogFieldSummary,
  LogFieldsResult,
  LogLevel,
  LogPatternsResult,
} from "@mimorii/contracts";
import { Injectable } from "@nestjs/common";
import { microsecondTimestamp } from "./log-entry-rows.js";
import { extractLogPatterns } from "./log-patterns.js";
import { LogSearchService } from "./log-search.service.js";
import type { LogRangeInput } from "./log-time-window.js";

const patternSampleSize = 5_000;
const fieldSampleSize = 2_000;
const fieldValueLimit = 15;
const fieldLimit = 100;

@Injectable()
export class LogInsightsService {
  constructor(private readonly search: LogSearchService) {}

  async patterns(
    userId: string,
    teamId: string,
    input: LogRangeInput & { limit?: number },
    signal?: AbortSignal
  ): Promise<LogPatternsResult> {
    const { query, window } = await this.search.prepare(userId, teamId, input);
    const scope = await this.search.scope(teamId, query, window, signal);
    const rows = scope
      ? await this.search.all<{ message: string; level: LogLevel; occurred_at: string }>(
          `SELECT e.message, e.level, ${microsecondTimestamp("e.occurred_at")} AS occurred_at
           FROM log_entries e WHERE ${scope.where}
           ORDER BY e.occurred_at DESC, e.id DESC LIMIT ?`,
          [...scope.parameters, patternSampleSize],
          signal
        )
      : [];
    return {
      sampled: rows.length,
      limited: rows.length === patternSampleSize,
      patterns: extractLogPatterns(
        rows.map((row) => ({
          message: row.message,
          level: row.level,
          timestamp: Date.parse(row.occurred_at),
        })),
        { from: window.from.getTime(), to: window.to.getTime() },
        { limit: Math.min(Math.max(input.limit ?? 50, 1), 200), trendBuckets: 24 }
      ),
    };
  }

  async fields(
    userId: string,
    teamId: string,
    input: LogRangeInput,
    signal?: AbortSignal
  ): Promise<LogFieldsResult> {
    const { query, window } = await this.search.prepare(userId, teamId, input);
    const scope = await this.search.scope(teamId, query, window, signal);
    const rows = scope
      ? await this.search.all<{ attributes: Record<string, LogAttributeValue> | string }>(
          `SELECT e.attributes FROM log_entries e WHERE ${scope.where}
           ORDER BY e.occurred_at DESC, e.id DESC LIMIT ?`,
          [...scope.parameters, fieldSampleSize],
          signal
        )
      : [];
    const fields = new Map<
      string,
      { count: number; numeric: boolean; values: Map<string, number> }
    >();
    for (const row of rows) {
      const attributes =
        typeof row.attributes === "string"
          ? (JSON.parse(row.attributes) as Record<string, LogAttributeValue>)
          : row.attributes;
      for (const [name, value] of Object.entries(attributes)) {
        const field = fields.get(name) ?? { count: 0, numeric: true, values: new Map() };
        field.count += 1;
        if (typeof value !== "number") field.numeric = false;
        const text = value === null ? "null" : String(value);
        field.values.set(text, (field.values.get(text) ?? 0) + 1);
        fields.set(name, field);
      }
    }
    const summaries: LogFieldSummary[] = [...fields.entries()]
      .sort((left, right) => right[1].count - left[1].count || left[0].localeCompare(right[0]))
      .slice(0, fieldLimit)
      .map(([name, field]) => ({
        name,
        count: field.count,
        numeric: field.numeric,
        values: [...field.values.entries()]
          .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
          .slice(0, fieldValueLimit)
          .map(([value, count]) => ({ value, count })),
      }));
    return { sampled: rows.length, fields: summaries };
  }
}
