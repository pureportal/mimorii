import type { LogAttributeValue, LogEntry, LogLevel } from "@mimorii/contracts";

export interface LogEntryRow {
  id: number | string;
  stream_id: string;
  occurred_at: string;
  received_at: string;
  level: LogLevel;
  message: string;
  attributes: Record<string, LogAttributeValue> | string;
  labels: Record<string, string> | string;
}

export const microsecondTimestamp = (column: string) =>
  `to_char(${column} AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`;

export const logEntryColumns = `e.id, e.stream_id,
  ${microsecondTimestamp("e.occurred_at")} AS occurred_at,
  e.received_at, e.level, e.message, e.attributes, s.labels`;

export function mapLogEntry(row: LogEntryRow): LogEntry {
  return {
    id: String(row.id),
    streamId: row.stream_id,
    timestamp: row.occurred_at,
    receivedAt: new Date(row.received_at).toISOString(),
    level: row.level,
    message: row.message,
    labels: parseJson(row.labels),
    attributes: parseJson(row.attributes),
  };
}

function parseJson<T>(value: T | string): T {
  return typeof value === "string" ? (JSON.parse(value) as T) : value;
}
