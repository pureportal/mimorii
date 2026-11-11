import type { IncidentImpact } from "./index.js";

export const logLevels = ["fatal", "error", "warn", "info", "debug", "trace", "unknown"] as const;
export type LogLevel = (typeof logLevels)[number];

export const logRetentionDayOptions = [1, 3, 7, 14, 30, 60, 90] as const;
export const logDeletionGraceDays = 14;
export const logsDisabledMessage = "Logs are not enabled for this team";

export const logIngestionLimits = {
  entriesPerRequest: 5_000,
  messageLength: 65_536,
  labelsPerStream: 15,
  labelValueLength: 256,
  attributesPerEntry: 64,
  attributeValueLength: 4_096,
  streamsPerTeam: 10_000,
  futureToleranceSeconds: 600,
  detectedFields: 32,
  detectedFieldValueLength: 1_024,
} as const;

export type LogAttributeValue = string | number | boolean | null;

export interface LogEntry {
  id: string;
  streamId: string;
  timestamp: string;
  receivedAt: string;
  level: LogLevel;
  message: string;
  labels: Record<string, string>;
  attributes: Record<string, LogAttributeValue>;
}

export const logQueryDirections = ["backward", "forward"] as const;
export type LogQueryDirection = (typeof logQueryDirections)[number];

export const logQueryMaxEntries = 2_000;

export interface LogQueryResult {
  entries: LogEntry[];
  nextCursor: string | null;
}

export interface LogVolumeBucket {
  start: string;
  total: number;
  levels: Partial<Record<LogLevel, number>>;
}

export interface LogVolume {
  from: string;
  to: string;
  stepSeconds: number;
  total: number;
  levels: Partial<Record<LogLevel, number>>;
  buckets: LogVolumeBucket[];
}

export interface LogLabelValue {
  value: string;
  streams: number;
}

export interface LogLabelSummary {
  name: string;
  valueCount: number;
  values: LogLabelValue[];
}

export interface LogPattern {
  pattern: string;
  count: number;
  levels: Partial<Record<LogLevel, number>>;
  firstSeen: string;
  lastSeen: string;
  sample: string;
  trend: number[];
}

export interface LogPatternsResult {
  sampled: number;
  limited: boolean;
  patterns: LogPattern[];
}

export interface LogFieldValue {
  value: string;
  count: number;
}

export interface LogFieldSummary {
  name: string;
  count: number;
  numeric: boolean;
  values: LogFieldValue[];
}

export interface LogFieldsResult {
  sampled: number;
  fields: LogFieldSummary[];
}

export interface LogContext {
  before: LogEntry[];
  entry: LogEntry;
  after: LogEntry[];
}

export interface TeamLogSettings {
  retentionDays: number;
  enabledAt: string | null;
}

export interface LogSourceSummary {
  id: string;
  name: string;
  labels: Record<string, string>;
  tokenPrefix: string;
  lastReceivedAt: string | null;
  accepted24h: number;
  rejected24h: number;
  bytes24h: number;
  lastError: string | null;
  lastErrorAt: string | null;
  createdAt: string;
}

export interface LogIngestionEndpoints {
  native: string;
  loki: string;
  otlp: string;
}

export interface LogSourceList {
  sources: LogSourceSummary[];
  endpoints: LogIngestionEndpoints;
}

export interface CreatedLogSource {
  source: LogSourceSummary;
  token: string;
  endpoints: LogIngestionEndpoints;
}

export interface LogIngestionRejection {
  index: number;
  reason: string;
}

export interface LogIngestionResult {
  accepted: number;
  duplicates: number;
  rejected: number;
  truncated: number;
  errors: LogIngestionRejection[];
}

export const logAlertComparisons = ["atLeast", "below"] as const;
export type LogAlertComparison = (typeof logAlertComparisons)[number];

export const logAlertWindowSeconds = [
  60, 300, 600, 900, 1_800, 3_600, 10_800, 21_600, 43_200, 86_400,
] as const;

export const logAlertPendingSeconds = [0, 60, 120, 300, 600, 900, 1_800, 3_600] as const;

export const logAlertStates = ["normal", "pending", "firing", "paused"] as const;
export type LogAlertState = (typeof logAlertStates)[number];

export interface LogAlertRuleSummary {
  id: string;
  name: string;
  query: string;
  windowSeconds: number;
  comparison: LogAlertComparison;
  threshold: number;
  pendingSeconds: number;
  impact: IncidentImpact;
  resourceId: string | null;
  resourceName: string | null;
  autoResolve: boolean;
  enabled: boolean;
  state: LogAlertState;
  pendingSince: string | null;
  firingSince: string | null;
  lastEvaluatedAt: string | null;
  lastError: string | null;
  lastMatchCount: number | null;
  lastMatchedAt: string | null;
  openIncidentId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface LogAlertPreview {
  matchCount: number;
  conditionMet: boolean;
  samples: LogEntry[];
}

export interface GlobalAdminTeamSummary {
  id: string;
  name: string;
  memberCount: number;
  ownerName: string | null;
  logsEnabled: boolean;
  logsDeletionScheduledAt: string | null;
  lastLogAt: string | null;
  createdAt: string;
}

export interface GlobalAdminTeamsPage {
  teams: GlobalAdminTeamSummary[];
  total: number;
  limit: number;
  offset: number;
}

export const logSavedSearchLimits = { name: 80, perTeam: 100 } as const;

export interface LogSavedSearch {
  id: string;
  name: string;
  query: string;
  createdByName: string | null;
  createdAt: string;
}
