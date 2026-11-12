import type { HeartbeatMonitorSummary, HeartbeatTimelineBucket } from "@mimorii/contracts";
import { formatBytes, formatDuration } from "./format";

export type HeartbeatTone = "success" | "warning" | "danger" | "neutral";

export interface HeartbeatState {
  badge: "up" | "down" | "pending" | "paused" | "active";
  label: string;
  tone: HeartbeatTone;
  headline: string;
}

export interface HeartbeatProblem {
  label: string;
  value: string | null;
}

export interface HeartbeatHighlight {
  label: string;
  value: string;
  tone?: HeartbeatTone;
}

export function heartbeatState(
  heartbeat: HeartbeatMonitorSummary,
  now = Date.now()
): HeartbeatState {
  const since = heartbeat.statusSince ? sinceLabel(heartbeat.statusSince, now) : null;
  if (!heartbeat.enabled || heartbeat.status === "paused") {
    return { badge: "paused", label: "Paused", tone: "neutral", headline: "Paused" };
  }
  if (heartbeat.runningSince) {
    return {
      badge: "active",
      label: "Running",
      tone: "warning",
      headline: `Running for ${sinceLabel(heartbeat.runningSince, now)}`,
    };
  }
  if (heartbeat.status === "down" && heartbeat.lastEventType === "failed") {
    return {
      badge: "down",
      label: "Failing",
      tone: "danger",
      headline: since ? `Reporting problems for ${since}` : "Reporting problems",
    };
  }
  if (heartbeat.status === "down") {
    return {
      badge: "down",
      label: "Missed",
      tone: "danger",
      headline: since ? `No signal for ${since}` : "No signal",
    };
  }
  if (heartbeat.status === "up") {
    return {
      badge: "up",
      label: "Up",
      tone: "success",
      headline: since ? `Healthy for ${since}` : "Healthy",
    };
  }
  return {
    badge: "pending",
    label: "Waiting",
    tone: "neutral",
    headline: "Waiting for the first signal",
  };
}

export function heartbeatProblems(heartbeat: HeartbeatMonitorSummary): HeartbeatProblem[] {
  if (heartbeat.lastEventType !== "failed" || !heartbeat.lastMessage) return [];
  return heartbeat.lastMessage
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const separator = part.lastIndexOf(":");
      if (separator <= 0) return { label: part, value: null };
      return {
        label: part.slice(0, separator).trim(),
        value: part.slice(separator + 1).trim() || null,
      };
    });
}

export function timelineTone(bucket: HeartbeatTimelineBucket): HeartbeatTone {
  if (bucket.missed > 0 || (bucket.failed > 0 && bucket.succeeded === 0)) return "danger";
  if (bucket.failed > 0) return "warning";
  if (bucket.succeeded > 0) return "success";
  return "neutral";
}

export function timelineTotals(timeline: HeartbeatTimelineBucket[]) {
  return timeline.reduce(
    (totals, bucket) => ({
      succeeded: totals.succeeded + bucket.succeeded,
      failed: totals.failed + bucket.failed,
      missed: totals.missed + bucket.missed,
    }),
    { succeeded: 0, failed: 0, missed: 0 }
  );
}

export function foxytailHighlights(
  metadata: HeartbeatMonitorSummary["latestMetadata"]
): HeartbeatHighlight[] {
  const number = (key: string) => {
    const value = metadata[key];
    return typeof value === "number" ? value : null;
  };
  const highlights: HeartbeatHighlight[] = [];
  const services = (["database", "redis"] as const).filter(
    (key) => typeof metadata[key] === "boolean"
  );
  if (services.length) {
    const unavailable = services.filter((key) => metadata[key] === false);
    highlights.push({
      label: "Services",
      value: unavailable.length
        ? `${unavailable.map((key) => (key === "database" ? "Database" : "Redis")).join(", ")} down`
        : "Database and Redis up",
      tone: unavailable.length ? "danger" : "success",
    });
  }
  const active = number("downloadsActive");
  const queued = number("downloadsQueued");
  if (active !== null || queued !== null) {
    highlights.push({
      label: "Downloads",
      value: `${active ?? 0} active · ${queued ?? 0} queued`,
    });
  }
  const completed = number("downloadCompletions24h");
  const failed = number("downloadFailures24h");
  if (completed !== null || failed !== null) {
    highlights.push({
      label: "Last 24 hours",
      value: `${completed ?? 0} completed · ${failed ?? 0} failed`,
      tone: failed ? "warning" : undefined,
    });
  }
  const requests = number("requestsPending");
  if (requests !== null) highlights.push({ label: "Requests", value: `${requests} pending` });
  const bytes = number("mediaBytes");
  if (bytes !== null) highlights.push({ label: "Library size", value: formatBytes(bytes) });
  if (typeof metadata.version === "string") {
    highlights.push({ label: "Foxytail", value: metadata.version });
  }
  return highlights;
}

function sinceLabel(value: string, now: number): string {
  return formatDuration(Math.max(0, Math.round((now - new Date(value).getTime()) / 1000)));
}
