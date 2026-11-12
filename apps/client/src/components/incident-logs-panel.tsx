import {
  logLevels,
  type IncidentLogs,
  type IncidentSummary,
  type LogPattern,
} from "@mimorii/contracts";
import { useQuery } from "@tanstack/react-query";
import { ArrowUpRight, LoaderCircle } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { appRoutes } from "../lib/app-navigation";
import { useAuth } from "../lib/auth";
import { logLevelPresentation } from "../lib/log-display";
import { withToggledLevel } from "../lib/log-query-builder";
import { LogVolumeChart } from "./logs/log-volume-chart";
import { Button } from "./ui/button";

function exploreLink(query: string, from: string, to: string): string {
  return `${appRoutes.logs}?${new URLSearchParams({ query, from, to })}`;
}

export function IncidentLogsPanel({ incident }: { incident: IncidentSummary }) {
  const { activeTeam } = useAuth();
  const teamId = activeTeam!.id;
  const navigate = useNavigate();
  const logs = useQuery({
    queryKey: ["incident-logs", teamId, incident.id, incident.resolvedAt],
    queryFn: ({ signal }) =>
      api<IncidentLogs>(`/teams/${teamId}/logs/incidents/${incident.id}`, { signal }),
  });

  if (logs.isLoading) {
    return (
      <div className="flex justify-center py-6 text-muted">
        <LoaderCircle className="size-5 animate-spin" aria-label="Loading logs" />
      </div>
    );
  }
  if (logs.isError) return <p className="text-sm text-coral-strong">{logs.error.message}</p>;
  const { from, to, streams } = logs.data!;
  if (!streams.length) return <p className="text-sm text-muted">No linked logs</p>;
  const highlight = { from: incident.startedAt, to: incident.resolvedAt ?? to };

  return (
    <div className="grid gap-6">
      {streams.map((stream) => (
        <section key={stream.query} className="grid gap-3" aria-label={`Logs for ${stream.label}`}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="min-w-0">
              <h4 className="truncate text-sm font-semibold">{stream.label}</h4>
              <p className="truncate font-mono text-[11px] text-muted">{stream.query}</p>
            </div>
            <Button asChild variant="outline" size="sm">
              <Link to={exploreLink(stream.query, from, to)}>
                Open in Logs <ArrowUpRight />
              </Link>
            </Button>
          </div>
          {stream.volume.total ? (
            <>
              <LogVolumeChart
                volume={stream.volume}
                selectedLevels={[]}
                highlight={highlight}
                onToggleLevel={(level) =>
                  void navigate(exploreLink(withToggledLevel(stream.query, level), from, to))
                }
                onZoom={(start, end) =>
                  void navigate(exploreLink(stream.query, start.toISOString(), end.toISOString()))
                }
              />
              <PatternList patterns={stream.patterns} />
            </>
          ) : (
            <p className="text-sm text-muted">No log lines in this period</p>
          )}
        </section>
      ))}
    </div>
  );
}

function PatternList({ patterns }: { patterns: LogPattern[] }) {
  if (!patterns.length) return null;
  return (
    <ul className="grid gap-1.5">
      {patterns.map((pattern) => {
        const level = logLevels.find((candidate) => pattern.levels[candidate]) ?? "unknown";
        return (
          <li
            key={pattern.pattern}
            className="flex min-w-0 items-center gap-3 rounded-lg border border-line px-3 py-2"
          >
            <span
              aria-label={logLevelPresentation[level].label}
              className="size-2.5 shrink-0 rounded-sm"
              style={{ backgroundColor: logLevelPresentation[level].color }}
            />
            <code className="min-w-0 flex-1 truncate text-xs" title={pattern.sample}>
              {pattern.sample}
            </code>
            <span className="shrink-0 font-mono text-[11px] text-muted">
              {pattern.count.toLocaleString()}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
