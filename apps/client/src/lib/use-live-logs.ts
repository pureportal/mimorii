import type { LogEntry, LogQueryResult } from "@mimorii/contracts";
import { useEffect, useRef, useState } from "react";
import { api } from "./api";

export type LiveLogStatus = "off" | "live" | "reconnecting";

const pollMilliseconds = 2_000;
const maximumBackoffMilliseconds = 30_000;
const catchUpMilliseconds = 60 * 60_000;
const entryLimit = 2_000;

export function useLiveLogs({
  teamId,
  query,
  enabled,
  newest,
}: {
  teamId: string;
  query: string;
  enabled: boolean;
  newest: LogEntry | undefined;
}): { entries: LogEntry[]; status: LiveLogStatus } {
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [status, setStatus] = useState<LiveLogStatus>("off");
  const newestRef = useRef(newest);
  useEffect(() => {
    newestRef.current = newest;
  }, [newest]);

  useEffect(() => {
    if (!enabled) {
      setEntries([]);
      setStatus("off");
      return undefined;
    }
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let failures = 0;
    const start = newestRef.current;
    let cursor =
      start && Date.now() - Date.parse(start.timestamp) < catchUpMilliseconds
        ? { timestamp: start.timestamp, id: start.id }
        : null;
    setEntries([]);
    setStatus("live");

    const poll = async () => {
      const now = Date.now();
      const from = cursor ? Date.parse(cursor.timestamp) : now - 60_000;
      const parameters = new URLSearchParams({
        query,
        direction: "forward",
        limit: "500",
        from: new Date(from).toISOString(),
        to: new Date(Math.max(now, from + 1_000)).toISOString(),
      });
      if (cursor) parameters.set("cursor", `${cursor.timestamp}|${cursor.id}`);
      try {
        const result = await api<LogQueryResult>(`/teams/${teamId}/logs?${parameters}`);
        if (!active) return;
        failures = 0;
        setStatus("live");
        const last = result.entries.at(-1);
        if (last) {
          cursor = { timestamp: last.timestamp, id: last.id };
          setEntries((current) =>
            [...result.entries.toReversed(), ...current].slice(0, entryLimit)
          );
        }
      } catch {
        if (!active) return;
        failures += 1;
        setStatus("reconnecting");
      }
      const delay =
        failures === 0
          ? pollMilliseconds
          : Math.min(maximumBackoffMilliseconds, pollMilliseconds * 2 ** failures);
      timer = setTimeout(() => void poll(), delay);
    };
    void poll();
    return () => {
      active = false;
      if (timer) clearTimeout(timer);
    };
  }, [enabled, query, teamId]);

  return { entries, status };
}
