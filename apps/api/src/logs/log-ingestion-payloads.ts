import {
  logIngestionLimits,
  type LogAttributeValue,
  type LogIngestionRejection,
  type LogLevel,
} from "@mimorii/contracts";
import { BadRequestException } from "@nestjs/common";
import { z } from "zod";
import { detectLogLevel, normalizeLogLevel, otlpSeverityLevel } from "./log-levels.js";
import { epochNumberToMicros, isoToMicros, nanosecondsToMicros } from "./log-timestamps.js";

export interface IncomingLogEntry {
  index: number;
  labels: Record<string, string>;
  timestamp: number | null;
  level: LogLevel;
  message: string;
  attributes: Record<string, LogAttributeValue>;
}

export interface ParsedLogPayload {
  entries: IncomingLogEntry[];
  rejected: LogIngestionRejection[];
}

export interface OtlpAnyValue {
  stringValue?: string;
  boolValue?: boolean;
  intValue?: string | number;
  doubleValue?: number | string;
  bytesValue?: string;
  arrayValue?: { values?: OtlpAnyValue[] };
  kvlistValue?: { values?: OtlpKeyValue[] };
}

export interface OtlpKeyValue {
  key: string;
  value?: OtlpAnyValue;
}

const labelsSchema = z.record(z.string(), z.string());
const attributeValueSchema = z.union([z.string(), z.number(), z.boolean(), z.null()]);

const nativeEntrySchema = z.strictObject({
  timestamp: z.union([z.string(), z.number()]).optional(),
  level: z.string().max(32).optional(),
  message: z.string(),
  labels: labelsSchema.optional(),
  attributes: z.record(z.string(), attributeValueSchema).optional(),
});

const nativeBatchSchema = z.strictObject({
  labels: labelsSchema.optional(),
  entries: z.array(z.unknown()).min(1).max(logIngestionLimits.entriesPerRequest),
});

const lokiValueSchema = z.union([
  z.tuple([z.string(), z.string()]),
  z.tuple([z.string(), z.string(), labelsSchema]),
]);

const lokiSchema = z.object({
  streams: z.array(z.object({ stream: labelsSchema, values: z.array(z.unknown()) })).min(1),
});

const otlpAnyValueSchema: z.ZodType<OtlpAnyValue> = z.lazy(() =>
  z.looseObject({
    stringValue: z.string().optional(),
    boolValue: z.boolean().optional(),
    intValue: z.union([z.string(), z.number()]).optional(),
    doubleValue: z.union([z.number(), z.string()]).optional(),
    bytesValue: z.string().optional(),
    arrayValue: z.looseObject({ values: z.array(otlpAnyValueSchema).optional() }).optional(),
    kvlistValue: z.looseObject({ values: z.array(otlpKeyValueSchema).optional() }).optional(),
  })
);

const otlpKeyValueSchema: z.ZodType<OtlpKeyValue> = z.lazy(() =>
  z.looseObject({ key: z.string(), value: otlpAnyValueSchema.optional() })
);

const otlpTimeSchema = z.union([z.string(), z.number()]).optional();

const otlpSchema = z.looseObject({
  resourceLogs: z.array(
    z.looseObject({
      resource: z.looseObject({ attributes: z.array(otlpKeyValueSchema).optional() }).optional(),
      scopeLogs: z
        .array(
          z.looseObject({
            logRecords: z
              .array(
                z.looseObject({
                  timeUnixNano: otlpTimeSchema,
                  observedTimeUnixNano: otlpTimeSchema,
                  severityNumber: z.number().optional(),
                  severityText: z.string().optional(),
                  body: otlpAnyValueSchema.optional(),
                  attributes: z.array(otlpKeyValueSchema).optional(),
                  traceId: z.string().optional(),
                  spanId: z.string().optional(),
                })
              )
              .optional(),
          })
        )
        .optional(),
    })
  ),
});

export type OtlpLogsPayload = z.infer<typeof otlpSchema>;
export type LokiPushPayload = z.infer<typeof lokiSchema>;

const otlpLabelAttributes = new Set([
  "service.name",
  "service.namespace",
  "deployment.environment",
  "deployment.environment.name",
  "host.name",
  "k8s.namespace.name",
  "k8s.deployment.name",
  "k8s.container.name",
  "cloud.region",
]);

export function parseNativeLogPayload(body: unknown): ParsedLogPayload {
  const payload = new PayloadBuilder();
  if (typeof body === "string") {
    for (const line of nonEmptyLines(body)) payload.add((index) => plainEntry(index, line, {}));
  } else if (Array.isArray(body)) {
    assertEntryCount(body.length);
    for (const item of body) payload.add((index) => nativeItem(index, item, {}));
  } else if (body && typeof body === "object" && "entries" in body) {
    const batch = parse(nativeBatchSchema, body);
    for (const item of batch.entries) {
      payload.add((index) => nativeItem(index, item, batch.labels ?? {}));
    }
  } else {
    payload.add((index) => nativeItem(index, body, {}));
  }
  return payload.result();
}

export function parseNdjsonLogPayload(body: string): ParsedLogPayload {
  const payload = new PayloadBuilder();
  for (const line of nonEmptyLines(body)) {
    const parsed = parseJsonLine(line);
    payload.add((index) =>
      parsed !== undefined && typeof parsed === "object" && parsed !== null && "message" in parsed
        ? nativeItem(index, parsed, {})
        : plainEntry(index, line, {})
    );
  }
  return payload.result();
}

export function parseLokiLogPayload(body: unknown): ParsedLogPayload {
  const parsed = parse(lokiSchema, body);
  assertEntryCount(parsed.streams.reduce((total, stream) => total + stream.values.length, 0));
  const payload = new PayloadBuilder();
  for (const stream of parsed.streams) {
    for (const value of stream.values) {
      payload.add((index) => {
        const tuple = lokiValueSchema.safeParse(value);
        if (!tuple.success) {
          throw new EntryRejection(
            "Loki values must be [timestamp, line] or [timestamp, line, metadata]"
          );
        }
        const [timestamp, message, metadata] = tuple.data;
        const micros = nanosecondsToMicros(timestamp);
        if (micros === null)
          throw new EntryRejection("The timestamp must be Unix epoch nanoseconds");
        return {
          index,
          labels: stream.stream,
          timestamp: micros,
          level: detectLogLevel(
            message,
            stream.stream.level,
            metadata?.level,
            stream.stream.severity
          ),
          message,
          attributes: metadata ?? {},
        };
      });
    }
  }
  return payload.result();
}

export function parseOtlpLogPayload(body: unknown): ParsedLogPayload {
  const parsed = parse(otlpSchema, body);
  const payload = new PayloadBuilder();
  for (const resourceLog of parsed.resourceLogs) {
    const labels: Record<string, string> = {};
    const resourceAttributes: Record<string, LogAttributeValue> = {};
    for (const attribute of resourceLog.resource?.attributes ?? []) {
      const value = attributeValue(attribute.value);
      if (otlpLabelAttributes.has(attribute.key) && typeof value === "string" && value) {
        labels[otlpLabelName(attribute.key)] = value;
      } else {
        resourceAttributes[attribute.key] = value;
      }
    }
    for (const scopeLog of resourceLog.scopeLogs ?? []) {
      for (const record of scopeLog.logRecords ?? []) {
        payload.add((index) => {
          const attributes: Record<string, LogAttributeValue> = { ...resourceAttributes };
          for (const attribute of record.attributes ?? []) {
            attributes[attribute.key] = attributeValue(attribute.value);
          }
          if (record.traceId) attributes.trace_id = record.traceId;
          if (record.spanId) attributes.span_id = record.spanId;
          const message = bodyText(record.body);
          return {
            index,
            labels,
            timestamp: otlpTime(record.timeUnixNano) ?? otlpTime(record.observedTimeUnixNano),
            level:
              normalizeLogLevel(record.severityText) ??
              otlpSeverityLevel(record.severityNumber) ??
              detectLogLevel(message),
            message,
            attributes,
          };
        });
      }
    }
  }
  if (payload.size === 0) throw new BadRequestException("The request contains no log records");
  return payload.result();
}

class EntryRejection extends Error {}

class PayloadBuilder {
  private readonly entries: IncomingLogEntry[] = [];
  private readonly rejected: LogIngestionRejection[] = [];
  private nextIndex = 0;

  get size(): number {
    return this.nextIndex;
  }

  add(build: (index: number) => IncomingLogEntry): void {
    const index = this.nextIndex;
    this.nextIndex += 1;
    assertEntryCount(this.nextIndex);
    try {
      this.entries.push(build(index));
    } catch (error) {
      if (!(error instanceof EntryRejection)) throw error;
      this.rejected.push({ index, reason: error.message });
    }
  }

  result(): ParsedLogPayload {
    if (this.nextIndex === 0) throw new BadRequestException("The request contains no log entries");
    return { entries: this.entries, rejected: this.rejected };
  }
}

function nativeItem(
  index: number,
  item: unknown,
  batchLabels: Record<string, string>
): IncomingLogEntry {
  if (typeof item === "string") return plainEntry(index, item, batchLabels);
  const result = nativeEntrySchema.safeParse(item);
  if (!result.success) throw new EntryRejection(issueMessage(result.error));
  const entry = result.data;
  const labels = { ...batchLabels, ...entry.labels };
  return {
    index,
    labels,
    timestamp: entry.timestamp === undefined ? null : nativeTimestamp(entry.timestamp),
    level: detectLogLevel(entry.message, entry.level, labels.level),
    message: entry.message,
    attributes: entry.attributes ?? {},
  };
}

function plainEntry(
  index: number,
  message: string,
  labels: Record<string, string>
): IncomingLogEntry {
  return {
    index,
    labels,
    timestamp: null,
    level: detectLogLevel(message),
    message,
    attributes: {},
  };
}

function nativeTimestamp(value: string | number): number {
  const micros =
    typeof value === "number"
      ? epochNumberToMicros(value)
      : /^\d+(?:\.\d+)?$/.test(value.trim())
        ? epochNumberToMicros(Number(value))
        : isoToMicros(value);
  if (micros === null) {
    throw new EntryRejection("The timestamp must be ISO 8601 or a Unix epoch number");
  }
  return micros;
}

function otlpTime(value: string | number | undefined): number | null {
  if (value === undefined || value === 0 || value === "0" || value === "") return null;
  const micros = nanosecondsToMicros(String(value));
  if (micros === null) throw new EntryRejection("The timestamp must be Unix epoch nanoseconds");
  return micros;
}

function attributeValue(value: OtlpAnyValue | undefined): LogAttributeValue {
  if (!value) return null;
  if (value.stringValue !== undefined) return value.stringValue;
  if (value.boolValue !== undefined) return value.boolValue;
  if (value.intValue !== undefined) {
    const number = Number(value.intValue);
    return Number.isSafeInteger(number) ? number : String(value.intValue);
  }
  if (value.doubleValue !== undefined) return Number(value.doubleValue);
  if (value.bytesValue !== undefined) return value.bytesValue;
  return JSON.stringify(structuredValue(value, 0));
}

function structuredValue(value: OtlpAnyValue, depth: number): unknown {
  if (depth > 16) return null;
  if (value.arrayValue) {
    return (value.arrayValue.values ?? []).map((item) => structuredValue(item, depth + 1));
  }
  if (value.kvlistValue) {
    return Object.fromEntries(
      (value.kvlistValue.values ?? []).map((entry) => [
        entry.key,
        entry.value ? structuredValue(entry.value, depth + 1) : null,
      ])
    );
  }
  return attributeValue(value);
}

function bodyText(value: OtlpAnyValue | undefined): string {
  if (!value) return "";
  if (value.stringValue !== undefined) return value.stringValue;
  const structured = structuredValue(value, 0);
  return typeof structured === "string" ? structured : JSON.stringify(structured);
}

function otlpLabelName(key: string): string {
  return key.replace(/[^A-Za-z0-9_]/g, "_");
}

function nonEmptyLines(body: string): string[] {
  return body.split(/\r?\n/).filter((line) => line.trim());
}

function parseJsonLine(line: string): unknown {
  try {
    return JSON.parse(line);
  } catch {
    return undefined;
  }
}

function assertEntryCount(count: number): void {
  if (count > logIngestionLimits.entriesPerRequest) {
    throw new BadRequestException(
      `Send up to ${logIngestionLimits.entriesPerRequest} log entries per request`
    );
  }
}

function parse<T>(schema: z.ZodType<T>, body: unknown): T {
  const result = schema.safeParse(body);
  if (result.success) return result.data;
  throw new BadRequestException(issueMessage(result.error));
}

function issueMessage(error: z.ZodError): string {
  const issue = error.issues[0];
  const path = issue?.path.length ? `${issue.path.join(".")}: ` : "";
  return `${path}${issue?.message ?? "The log payload is invalid"}`;
}
