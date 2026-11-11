import { logIngestionLimits, type LogAttributeValue } from "@mimorii/contracts";
import { epochNumberToMicros, isoToMicros } from "./log-timestamps.js";

export interface DetectedLogFields {
  fields: Record<string, LogAttributeValue>;
  timestamp: number | null;
}

const timestampKeys = ["timestamp", "@timestamp", "time", "ts", "datetime", "date"];
const ignoredKeys = new Set([...timestampKeys, "msg", "message", "level", "lvl", "severity"]);
const logfmtPair = /([A-Za-z_][\w.\-/]*)=("(?:[^"\\]|\\.)*"|[^\s"]*)/g;
const numericText = /^-?\d+(?:\.\d+)?$/;
const maximumParsedLength = 16_384;

export function detectLogFields(message: string): DetectedLogFields {
  const trimmed = message.trim();
  if (!trimmed || trimmed.length > maximumParsedLength) return { fields: {}, timestamp: null };
  if (trimmed.startsWith("{")) {
    const parsed = parseJsonObject(trimmed);
    if (parsed) return fromObject(parsed);
  }
  return fromLogfmt(trimmed);
}

function parseJsonObject(text: string): Record<string, unknown> | null {
  try {
    const value: unknown = JSON.parse(text);
    return value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function fromObject(value: Record<string, unknown>): DetectedLogFields {
  const fields: Record<string, LogAttributeValue> = {};
  flatten(value, "", 0, fields);
  return { fields, timestamp: timestampFrom(value) };
}

function flatten(
  value: Record<string, unknown>,
  prefix: string,
  depth: number,
  fields: Record<string, LogAttributeValue>
): void {
  for (const [key, field] of Object.entries(value)) {
    if (Object.keys(fields).length >= logIngestionLimits.detectedFields) return;
    if (!prefix && ignoredKeys.has(key)) continue;
    const name = prefix ? `${prefix}.${key}` : key;
    if (field && typeof field === "object" && !Array.isArray(field)) {
      if (depth < 2) flatten(field as Record<string, unknown>, name, depth + 1, fields);
      continue;
    }
    const primitive = primitiveField(field);
    if (primitive !== undefined) fields[name] = primitive;
  }
}

function fromLogfmt(message: string): DetectedLogFields {
  const pairs = [...message.matchAll(logfmtPair)];
  if (pairs.length < 2) return { fields: {}, timestamp: null };
  const fields: Record<string, LogAttributeValue> = {};
  const raw: Record<string, string> = {};
  for (const [, key, quotedValue] of pairs) {
    if (!key || quotedValue === undefined) continue;
    const value = quotedValue.startsWith('"')
      ? quotedValue.slice(1, -1).replace(/\\"/g, '"')
      : quotedValue;
    raw[key] = value;
    if (ignoredKeys.has(key) || Object.keys(fields).length >= logIngestionLimits.detectedFields) {
      continue;
    }
    const primitive = primitiveField(numericText.test(value) ? Number(value) : value);
    if (primitive !== undefined) fields[key] = primitive;
  }
  return { fields, timestamp: timestampFrom(raw) };
}

function primitiveField(value: unknown): LogAttributeValue | undefined {
  if (value === null || typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  if (typeof value === "string") {
    return value.length <= logIngestionLimits.detectedFieldValueLength ? value : undefined;
  }
  return undefined;
}

function timestampFrom(value: Record<string, unknown>): number | null {
  for (const key of timestampKeys) {
    const candidate = value[key];
    if (typeof candidate === "number") return epochNumberToMicros(candidate);
    if (typeof candidate === "string" && candidate) {
      return numericText.test(candidate)
        ? epochNumberToMicros(Number(candidate))
        : isoToMicros(candidate);
    }
  }
  return null;
}
