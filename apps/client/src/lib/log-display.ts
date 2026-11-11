import type { LogEntry, LogLevel } from "@mimorii/contracts";
import { useCallback, useState } from "react";

export const logDedupModes = ["none", "exact", "numbers", "signature"] as const;
export type LogDedupMode = (typeof logDedupModes)[number];

export interface LogDisplayOptions {
  showTime: boolean;
  showLabels: boolean;
  wrapLines: boolean;
  prettifyJson: boolean;
  dedup: LogDedupMode;
  order: "newest" | "oldest";
}

export interface DisplayedLogEntry {
  entry: LogEntry;
  duplicates: number;
}

export const logLevelPresentation: Record<LogLevel, { label: string; color: string }> = {
  fatal: { label: "Fatal", color: "#9085e9" },
  error: { label: "Error", color: "#d64045" },
  warn: { label: "Warning", color: "#b88c00" },
  info: { label: "Info", color: "#199e70" },
  debug: { label: "Debug", color: "#3987e5" },
  trace: { label: "Trace", color: "#d55181" },
  unknown: { label: "Unknown", color: "#7c7a92" },
};

const displayKey = "mimorii.logs.display";
const defaultDisplayOptions: LogDisplayOptions = {
  showTime: true,
  showLabels: false,
  wrapLines: true,
  prettifyJson: false,
  dedup: "none",
  order: "newest",
};

export function useLogDisplayOptions(): [
  LogDisplayOptions,
  (update: Partial<LogDisplayOptions>) => void,
] {
  const [options, setOptions] = useState(readDisplayOptions);
  const update = useCallback((change: Partial<LogDisplayOptions>) => {
    setOptions((current) => {
      const next = { ...current, ...change };
      localStorage.setItem(displayKey, JSON.stringify(next));
      return next;
    });
  }, []);
  return [options, update];
}

export function dedupLogEntries(entries: LogEntry[], mode: LogDedupMode): DisplayedLogEntry[] {
  if (mode === "none") return entries.map((entry) => ({ entry, duplicates: 0 }));
  const displayed: DisplayedLogEntry[] = [];
  let previousKey: string | null = null;
  for (const entry of entries) {
    const key = dedupKey(entry.message, mode);
    const previous = displayed.at(-1);
    if (previous && key === previousKey) {
      previous.duplicates += 1;
      continue;
    }
    displayed.push({ entry, duplicates: 0 });
    previousKey = key;
  }
  return displayed;
}

export function uniqueLabelNames(entries: LogEntry[]): string[] {
  const values = new Map<string, Set<string>>();
  for (const entry of entries) {
    for (const [name, value] of Object.entries(entry.labels)) {
      const set = values.get(name) ?? new Set<string>();
      set.add(value);
      values.set(name, set);
    }
  }
  const names = [...values.keys()].toSorted();
  const varying = names.filter(
    (name) =>
      values.get(name)!.size > 1 || entries.some((entry) => entry.labels[name] === undefined)
  );
  return varying.length ? varying : names;
}

export function prettyJson(message: string): string | null {
  const trimmed = message.trim();
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) return null;
  try {
    return JSON.stringify(JSON.parse(trimmed), null, 2);
  } catch {
    return null;
  }
}

export function formatLogTimestamp(value: string): string {
  const date = new Date(value);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(
    date.getHours()
  )}:${pad(date.getMinutes())}:${pad(date.getSeconds())}.${pad(date.getMilliseconds(), 3)}`;
}

function pad(number: number, length = 2): string {
  return String(number).padStart(length, "0");
}

function readDisplayOptions(): LogDisplayOptions {
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(displayKey) ?? "null");
    if (!stored || typeof stored !== "object") return defaultDisplayOptions;
    const value = stored as Partial<LogDisplayOptions>;
    return {
      showTime:
        typeof value.showTime === "boolean" ? value.showTime : defaultDisplayOptions.showTime,
      showLabels:
        typeof value.showLabels === "boolean" ? value.showLabels : defaultDisplayOptions.showLabels,
      wrapLines:
        typeof value.wrapLines === "boolean" ? value.wrapLines : defaultDisplayOptions.wrapLines,
      prettifyJson:
        typeof value.prettifyJson === "boolean"
          ? value.prettifyJson
          : defaultDisplayOptions.prettifyJson,
      dedup: logDedupModes.includes(value.dedup as LogDedupMode)
        ? (value.dedup as LogDedupMode)
        : defaultDisplayOptions.dedup,
      order: value.order === "oldest" ? "oldest" : "newest",
    };
  } catch {
    return defaultDisplayOptions;
  }
}

function dedupKey(message: string, mode: Exclude<LogDedupMode, "none">): string {
  if (mode === "exact") return message;
  if (mode === "numbers") return message.replace(/\d+(?:\.\d+)?/g, "0");
  return message.replace(/\w/g, "");
}
