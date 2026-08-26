import {
  healthCheckTypes,
  type CheckResult,
  type CheckSummary,
  type CheckType,
} from "@mimorii/contracts";
import { formatBytes } from "./format";

type CheckMetricValue = number | string | boolean | null;

export interface CheckHealthItem {
  key: string;
  label: string;
  value: string;
  percent?: number;
}

export interface CheckHistorySeries {
  key: string;
  label: string;
  points: Array<{ checkedAt: string; value: number }>;
}

export type CheckMetricScale = "bytes" | "percent" | "milliseconds" | "days" | "seconds" | "number";

const metricLabels: Record<string, string> = {
  latencyMs: "Latency",
  averageLatencyMs: "Average latency",
  responseBytes: "Response size",
  certificateDaysRemaining: "Certificate",
  certificateExpiresAt: "Certificate expiry",
  certificateIssuer: "Certificate issuer",
  contentType: "Content type",
  poweredBy: "Powered by",
  tlsCipher: "TLS cipher",
  tlsProtocol: "TLS protocol",
  port: "Port",
  recordCount: "Records",
  packetsSent: "Packets sent",
  packetsReceived: "Packets received",
  packetLossPercent: "Packet loss",
  minimumLatencyMs: "Minimum latency",
  maximumLatencyMs: "Maximum latency",
  successPercent: "Success",
  targetCount: "Targets",
  reachableTargets: "Reachable targets",
  successfulTargets: "Successful targets",
  cpuPercent: "CPU",
  memoryPercent: "Memory",
  loadAverage: "Load average",
  swapPercent: "Swap",
  processCount: "Processes",
  storagePercent: "Storage",
  mount: "Mount",
  usedPercent: "Used",
  usedBytes: "Used space",
  totalBytes: "Capacity",
  containerCount: "Containers",
  runningContainerCount: "Running containers",
  unhealthyContainerCount: "Unhealthy containers",
  restartCount: "Restarts",
  engine: "Engine",
  version: "Version",
  connections: "Connections",
  maxConnections: "Connection limit",
  connectionUtilizationPercent: "Connection usage",
  databaseSizeBytes: "Database size",
  memoryUsedBytes: "Memory used",
  memoryPeakBytes: "Peak memory",
  cacheHitPercent: "Cache hit rate",
  replicationLagSeconds: "Replication lag",
  slowQueries: "Slow queries",
  deadlocks: "Deadlocks",
  rejectedConnections: "Rejected connections",
  evictedKeys: "Evicted keys",
  uptimeSeconds: "Uptime",
};

const historyMetricOrder: Record<CheckType, string[]> = {
  http: ["latencyMs", "responseBytes", "certificateDaysRemaining"],
  tcp: ["latencyMs"],
  dns: ["latencyMs", "recordCount"],
  icmp: ["latencyMs", "packetLossPercent", "minimumLatencyMs", "maximumLatencyMs"],
  wan: ["latencyMs", "reachableTargets"],
  host: ["cpuPercent", "memoryPercent", "loadAverage", "swapPercent", "processCount"],
  disk: ["usedPercent", "usedBytes", "totalBytes"],
  docker: ["containerCount", "runningContainerCount", "unhealthyContainerCount", "restartCount"],
  database: [
    "connectionUtilizationPercent",
    "replicationLagSeconds",
    "latencyMs",
    "cacheHitPercent",
    "slowQueries",
    "connections",
    "databaseSizeBytes",
  ],
};

const healthCheckTypeSet = new Set<CheckType>(healthCheckTypes);

export function isHealthCheckType(type: CheckType): boolean {
  return healthCheckTypeSet.has(type);
}

export function checkPassingLabel(type: CheckType): "Availability" | "Healthy" {
  return isHealthCheckType(type) ? "Healthy" : "Availability";
}

export function getCheckHealthItems(
  check: Pick<CheckSummary, "type" | "lastLatencyMs" | "latestMetrics">
): CheckHealthItem[] {
  const metrics = check.latestMetrics;
  const items: Array<CheckHealthItem | null> = [];

  switch (check.type) {
    case "http":
      items.push(valueItem("latencyMs", check.lastLatencyMs), metricItem(metrics, "responseBytes"));
      break;
    case "tcp":
      items.push(valueItem("latencyMs", check.lastLatencyMs), metricItem(metrics, "port"));
      break;
    case "dns":
      items.push(valueItem("latencyMs", check.lastLatencyMs), metricItem(metrics, "recordCount"));
      break;
    case "icmp":
      items.push(
        valueItem("latencyMs", check.lastLatencyMs),
        metricItem(metrics, "packetLossPercent")
      );
      break;
    case "wan":
      items.push(
        ratioItem(
          metrics,
          typeof metrics.reachableTargets === "number" ? "reachableTargets" : "successfulTargets",
          "targetCount",
          "Reachable"
        ),
        valueItem("latencyMs", check.lastLatencyMs)
      );
      break;
    case "host":
      items.push(metricItem(metrics, "cpuPercent"), metricItem(metrics, "memoryPercent"));
      break;
    case "disk":
      items.push(metricItem(metrics, "usedPercent"), metricItem(metrics, "mount"));
      break;
    case "docker":
      items.push(
        ratioItem(metrics, "runningContainerCount", "containerCount", "Running"),
        metricItem(metrics, "unhealthyContainerCount")
      );
      break;
    case "database":
      items.push(
        metricItem(metrics, "connectionUtilizationPercent"),
        metricItem(metrics, "replicationLagSeconds")
      );
      break;
  }

  const result = items.filter((item): item is CheckHealthItem => item !== null);
  if (result.length >= 2) return result.slice(0, 2);

  for (const [key, value] of Object.entries(metrics)) {
    if (result.some((item) => item.key === key) || value === null) continue;
    result.push(createItem(key, value));
    if (result.length === 2) break;
  }
  return result;
}

export function createCheckHistorySeries(
  type: CheckType,
  results: CheckResult[]
): CheckHistorySeries[] {
  const numericMetricKeys = new Set(
    results.flatMap((result) =>
      Object.entries(result.metrics).flatMap(([key, value]) =>
        typeof value === "number" ? [key] : []
      )
    )
  );
  if (results.some((result) => result.latencyMs !== null)) numericMetricKeys.add("latencyMs");

  const orderedKeys = [
    ...historyMetricOrder[type],
    ...[...numericMetricKeys].toSorted((left, right) =>
      checkMetricLabel(left).localeCompare(checkMetricLabel(right))
    ),
  ];

  return [...new Set(orderedKeys)]
    .filter((key) => numericMetricKeys.has(key))
    .slice(0, 8)
    .map((key) => ({
      key,
      label: checkMetricLabel(key),
      points: results.flatMap((result) => {
        const value = key === "latencyMs" ? result.latencyMs : result.metrics[key];
        return typeof value === "number" ? [{ checkedAt: result.checkedAt, value }] : [];
      }),
    }));
}

export function checkMetricLabel(metric: string): string {
  const known = metricLabels[metric];
  if (known) return known;
  const label = metric
    .replace(/[._]+/g, " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/\bms\b/gi, "ms")
    .replace(/\bio\b/gi, "I/O");
  return label.charAt(0).toUpperCase() + label.slice(1);
}

export function checkMetricScale(metric: string): CheckMetricScale {
  const normalized = metric.toLowerCase();
  if (normalized.includes("bytes")) return "bytes";
  if (normalized.includes("percent")) return "percent";
  if (normalized.endsWith("ms")) return "milliseconds";
  if (normalized.includes("days")) return "days";
  if (normalized.includes("seconds")) return "seconds";
  return "number";
}

export function formatCheckMetric(metric: string, value: CheckMetricValue): string {
  if (value === null) return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "string") {
    if (metric.toLowerCase().endsWith("at") && !Number.isNaN(Date.parse(value))) {
      return new Date(value).toLocaleString();
    }
    return value;
  }

  const normalized = metric.toLowerCase();
  if (normalized.includes("bytes")) return formatBytes(value);
  if (normalized.includes("percent")) return `${formatNumber(value, 1)}%`;
  if (normalized.endsWith("ms")) return `${formatNumber(value, 1)} ms`;
  if (normalized.includes("days")) return `${formatNumber(value, 1)} d`;
  if (normalized.includes("seconds")) return `${formatNumber(value, 1)} s`;
  if (metric === "loadAverage") return formatNumber(value, 2);
  return formatNumber(value, 1);
}

function metricItem(metrics: CheckSummary["latestMetrics"], key: string): CheckHealthItem | null {
  const value = metrics[key];
  return value === undefined || value === null ? null : createItem(key, value);
}

function valueItem(key: string, value: CheckMetricValue | undefined): CheckHealthItem | null {
  return value === undefined || value === null ? null : createItem(key, value);
}

function ratioItem(
  metrics: CheckSummary["latestMetrics"],
  numeratorKey: string,
  denominatorKey: string,
  label: string
): CheckHealthItem | null {
  const numerator = metrics[numeratorKey];
  const denominator = metrics[denominatorKey];
  if (typeof numerator !== "number" || typeof denominator !== "number") return null;
  return {
    key: numeratorKey,
    label,
    value: `${formatNumber(numerator, 1)} / ${formatNumber(denominator, 1)}`,
    percent: denominator > 0 ? (numerator / denominator) * 100 : 0,
  };
}

function createItem(key: string, value: Exclude<CheckMetricValue, null>): CheckHealthItem {
  const percent = typeof value === "number" && key.toLowerCase().includes("percent") ? value : null;
  return {
    key,
    label: checkMetricLabel(key),
    value: formatCheckMetric(key, value),
    ...(percent === null ? {} : { percent }),
  };
}

function formatNumber(value: number, maximumFractionDigits: number): string {
  return value.toLocaleString(undefined, { maximumFractionDigits });
}
