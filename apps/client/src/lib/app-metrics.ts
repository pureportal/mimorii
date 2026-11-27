import {
  appDefinitions,
  type AppKind,
  type AppMetricDefinition,
  type HeartbeatMonitorSummary,
} from "@mimorii/contracts";
import { formatBytes } from "./format";

export type AppMetadata = HeartbeatMonitorSummary["latestMetadata"];

export interface AppMetricFact {
  key: string;
  label: string;
  value: string;
  tone?: "danger" | "warning" | "success";
}

export function appMetricFact(
  metric: AppMetricDefinition,
  metadata: AppMetadata
): AppMetricFact | null {
  const value = metadata[metric.key];
  switch (metric.format) {
    case "availability":
      return typeof value === "boolean"
        ? {
            key: metric.key,
            label: metric.label,
            value: value ? "Available" : "Unavailable",
            tone: value ? "success" : "danger",
          }
        : null;
    case "text":
      return typeof value === "string" ? { key: metric.key, label: metric.label, value } : null;
    case "bytes":
      return typeof value === "number" && value >= 0
        ? { key: metric.key, label: metric.label, value: formatBytes(value) }
        : null;
    case "count":
      if (value === null) return { key: metric.key, label: metric.label, value: "Unavailable" };
      if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) return null;
      return {
        key: metric.key,
        label: metric.label,
        value: value.toLocaleString(),
        ...(metric.attentionWhenPositive && value > 0 ? { tone: "warning" as const } : {}),
      };
  }
}

export function appHighlights(app: AppKind, metadata: AppMetadata): AppMetricFact[] {
  return appDefinitions[app].metricGroups.flatMap((group) =>
    group.metrics.flatMap((metric) => {
      if (!metric.highlight) return [];
      const fact = appMetricFact(metric, metadata);
      return fact ? [fact] : [];
    })
  );
}

export function appMetricGroups(
  app: AppKind,
  metadata: AppMetadata
): Array<{ title: string; facts: AppMetricFact[] }> {
  return appDefinitions[app].metricGroups.flatMap((group) => {
    const facts = group.metrics.flatMap((metric) => appMetricFact(metric, metadata) ?? []);
    return facts.length ? [{ title: group.title, facts }] : [];
  });
}
