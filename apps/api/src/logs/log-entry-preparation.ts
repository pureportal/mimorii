import {
  logFieldNamePattern,
  logIngestionLimits,
  type LogAttributeValue,
  type LogIngestionRejection,
  type LogLevel,
} from "@mimorii/contracts";
import { HttpException } from "@nestjs/common";
import { createHash } from "node:crypto";
import { detectLogFields } from "./log-enrichment.js";
import type { IncomingLogEntry } from "./log-ingestion-payloads.js";
import {
  logLabelsKey,
  reservedLogLabel,
  validateLogLabels,
  withoutNullCharacters,
} from "./log-labels.js";
import { microsToIso } from "./log-timestamps.js";

export interface PreparedLogEntry {
  index: number;
  streamHash: string;
  timestamp: string;
  level: LogLevel;
  message: string;
  attributes: string;
}

export interface PreparedLogStream {
  hash: string;
  labels: Record<string, string>;
  firstSeenAt: string;
  lastSeenAt: string;
}

export interface PreparedLogBatch {
  entries: PreparedLogEntry[];
  streams: Map<string, PreparedLogStream>;
  rejected: LogIngestionRejection[];
  truncated: number;
}

const truncationMarker = "…";

export function prepareLogBatch(
  incoming: IncomingLogEntry[],
  options: { sourceLabels: Record<string, string>; retentionDays: number; receivedAt: Date }
): PreparedLogBatch {
  const receivedMicros = options.receivedAt.getTime() * 1_000;
  const oldestMicros = receivedMicros - options.retentionDays * 86_400_000_000;
  const newestMicros = receivedMicros + logIngestionLimits.futureToleranceSeconds * 1_000_000;
  const batch: PreparedLogBatch = { entries: [], streams: new Map(), rejected: [], truncated: 0 };

  for (const entry of incoming) {
    try {
      const labels = streamLabels(entry.labels, options.sourceLabels);
      const detected = detectLogFields(entry.message);
      const timestamp = resolveTimestamp(entry.timestamp, detected.timestamp, {
        received: receivedMicros,
        oldest: oldestMicros,
        newest: newestMicros,
        retentionDays: options.retentionDays,
      });
      let truncated = false;
      let message = withoutNullCharacters(entry.message);
      if (message.length > logIngestionLimits.messageLength) {
        message = message.slice(0, logIngestionLimits.messageLength - 1) + truncationMarker;
        truncated = true;
      }
      const attributes = sanitizeAttributes({ ...detected.fields, ...entry.attributes });
      if (attributes.changed) truncated = true;
      if (truncated) {
        attributes.values.truncated = true;
        batch.truncated += 1;
      }
      const hash = createHash("sha256").update(logLabelsKey(labels)).digest("hex");
      const timestampText = microsToIso(timestamp);
      const stream = batch.streams.get(hash);
      if (stream) {
        if (timestampText < stream.firstSeenAt) stream.firstSeenAt = timestampText;
        if (timestampText > stream.lastSeenAt) stream.lastSeenAt = timestampText;
      } else {
        batch.streams.set(hash, {
          hash,
          labels,
          firstSeenAt: timestampText,
          lastSeenAt: timestampText,
        });
      }
      batch.entries.push({
        index: entry.index,
        streamHash: hash,
        timestamp: timestampText,
        level: entry.level,
        message,
        attributes: JSON.stringify(attributes.values),
      });
    } catch (error) {
      if (!(error instanceof HttpException)) throw error;
      batch.rejected.push({ index: entry.index, reason: error.message });
    }
  }
  return batch;
}

function streamLabels(
  entryLabels: Record<string, string>,
  sourceLabels: Record<string, string>
): Record<string, string> {
  const labels: Record<string, string> = { ...entryLabels };
  delete labels[reservedLogLabel];
  return validateLogLabels({ ...labels, ...sourceLabels });
}

function resolveTimestamp(
  explicit: number | null,
  detected: number | null,
  bounds: { received: number; oldest: number; newest: number; retentionDays: number }
): number {
  if (explicit !== null) {
    if (explicit > bounds.newest) throw rejection("The timestamp is too far in the future");
    if (explicit < bounds.oldest) {
      throw rejection(`The timestamp is older than the ${bounds.retentionDays}-day retention`);
    }
    return explicit;
  }
  if (detected !== null && detected <= bounds.newest && detected >= bounds.oldest) return detected;
  return bounds.received;
}

function sanitizeAttributes(attributes: Record<string, LogAttributeValue>): {
  values: Record<string, LogAttributeValue>;
  changed: boolean;
} {
  const values: Record<string, LogAttributeValue> = {};
  let changed = false;
  for (const [key, value] of Object.entries(attributes)) {
    if (Object.keys(values).length >= logIngestionLimits.attributesPerEntry - 1) {
      changed = true;
      break;
    }
    if (!logFieldNamePattern.test(key)) {
      changed = true;
      continue;
    }
    if (typeof value === "number" && !Number.isFinite(value)) {
      changed = true;
      continue;
    }
    if (typeof value === "string") {
      const clean = withoutNullCharacters(value);
      if (clean.length > logIngestionLimits.attributeValueLength) {
        values[key] =
          clean.slice(0, logIngestionLimits.attributeValueLength - 1) + truncationMarker;
        changed = true;
      } else {
        values[key] = clean;
      }
      continue;
    }
    values[key] = value;
  }
  return { values, changed };
}

function rejection(message: string): HttpException {
  return new HttpException(message, 400);
}
