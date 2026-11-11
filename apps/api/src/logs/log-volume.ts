import type { LogLevel, LogVolume, LogVolumeBucket } from "@mimorii/contracts";
import { sqlAnd, type SqlConditions } from "./log-query-sql.js";
import type { LogSearchWindow } from "./log-search.service.js";

export interface LogVolumeRow {
  bucket: number;
  level: LogLevel;
  count: number;
}

export interface LogVolumeFilters {
  teamId: string;
  streams: (column: string) => SqlConditions;
  rollupLevels: SqlConditions;
  entries: SqlConditions;
}

interface SqlPart {
  sql: string;
  parameters: unknown[];
}

export const logVolumeResolutions = [300, 3_600] as const;

const stepsSeconds = [
  1, 5, 10, 15, 30, 60, 120, 300, 600, 900, 1_800, 3_600, 7_200, 10_800, 21_600, 43_200, 86_400,
];
const bucketTarget = 120;

export function logVolumeStep(window: LogSearchWindow): number {
  const rangeSeconds = (window.to.getTime() - window.from.getTime()) / 1_000;
  return stepsSeconds.find((candidate) => rangeSeconds / candidate <= bucketTarget) ?? 86_400;
}

export function logVolumeSql(
  window: LogSearchWindow,
  step: number,
  filters: LogVolumeFilters,
  rollupEligible: boolean
): SqlPart {
  const resolution = rollupEligible
    ? logVolumeResolutions.toReversed().find((candidate) => step % candidate === 0)
    : undefined;
  const from = window.from.getTime();
  const to = window.to.getTime();
  if (resolution) {
    const size = resolution * 1_000;
    const innerFrom = Math.ceil(from / size) * size;
    const innerTo = Math.floor(to / size) * size;
    if (innerTo > innerFrom) {
      const rollup = rollupPart(step, resolution, innerFrom, innerTo, filters);
      const edges: Array<[number, number, boolean]> = [];
      if (from < innerFrom) edges.push([from, innerFrom, false]);
      edges.push([innerTo, to, true]);
      const raw = rawPart(step, edges, filters);
      return {
        sql: `SELECT bucket, level, SUM(count) AS count
              FROM (${rollup.sql} UNION ALL ${raw.sql}) parts GROUP BY 1, 2`,
        parameters: [...rollup.parameters, ...raw.parameters],
      };
    }
  }
  return rawPart(step, [[from, to, true]], filters);
}

export function assembleLogVolume(
  window: LogSearchWindow,
  step: number,
  rows: LogVolumeRow[]
): LogVolume {
  const firstBucket = Math.floor(window.from.getTime() / 1_000 / step) * step;
  const buckets = new Map<number, LogVolumeBucket>();
  for (let start = firstBucket; start * 1_000 <= window.to.getTime(); start += step) {
    buckets.set(start, { start: new Date(start * 1_000).toISOString(), total: 0, levels: {} });
  }
  const levels: Partial<Record<LogLevel, number>> = {};
  let total = 0;
  for (const row of rows) {
    const bucket = buckets.get(Number(row.bucket));
    if (!bucket) continue;
    const count = Number(row.count);
    bucket.total += count;
    bucket.levels[row.level] = (bucket.levels[row.level] ?? 0) + count;
    levels[row.level] = (levels[row.level] ?? 0) + count;
    total += count;
  }
  return {
    from: window.from.toISOString(),
    to: window.to.toISOString(),
    stepSeconds: step,
    total,
    levels,
    buckets: [...buckets.values()],
  };
}

function rollupPart(
  step: number,
  resolution: number,
  from: number,
  to: number,
  filters: LogVolumeFilters
): SqlPart {
  const streams = filters.streams("v.stream_id");
  return {
    sql: `SELECT FLOOR(EXTRACT(EPOCH FROM v.bucket_start) / ?) * ? AS bucket, v.level,
          SUM(v.entries) AS count
          FROM log_volume v
          WHERE v.team_id = ? AND v.resolution_seconds = ? AND v.bucket_start >= ? AND v.bucket_start < ?
          ${sqlAnd(streams)} ${sqlAnd(filters.rollupLevels)}
          GROUP BY 1, 2`,
    parameters: [
      step,
      step,
      filters.teamId,
      resolution,
      new Date(from).toISOString(),
      new Date(to).toISOString(),
      ...streams.parameters,
      ...filters.rollupLevels.parameters,
    ],
  };
}

function rawPart(
  step: number,
  ranges: Array<[number, number, boolean]>,
  filters: LogVolumeFilters
): SqlPart {
  const streams = filters.streams("e.stream_id");
  const rangeClauses = ranges.map(
    ([, , inclusive]) => `(e.occurred_at >= ? AND e.occurred_at ${inclusive ? "<=" : "<"} ?)`
  );
  return {
    sql: `SELECT FLOOR(EXTRACT(EPOCH FROM e.occurred_at) / ?) * ? AS bucket, e.level,
          COUNT(*) AS count
          FROM log_entries e
          WHERE e.team_id = ? AND (${rangeClauses.join(" OR ")})
          ${sqlAnd(streams)} ${sqlAnd(filters.entries)}
          GROUP BY 1, 2`,
    parameters: [
      step,
      step,
      filters.teamId,
      ...ranges.flatMap(([from, to]) => [new Date(from).toISOString(), new Date(to).toISOString()]),
      ...streams.parameters,
      ...filters.entries.parameters,
    ],
  };
}
