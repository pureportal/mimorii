import type { HeartbeatMonitorSummary, HeartbeatTimelineBucket } from "@mimorii/contracts";
import { cn } from "../lib/cn";
import { formatCount, formatMilliseconds, formatPercent, formatRelative } from "../lib/format";
import {
  foxytailHighlights,
  heartbeatProblems,
  heartbeatState,
  timelineTone,
  timelineTotals,
  type HeartbeatTone,
} from "../lib/heartbeat-state";
import { StatusBadge } from "./ui/badge";

const toneText: Record<HeartbeatTone, string> = {
  success: "text-success-strong",
  warning: "text-warning-strong",
  danger: "text-danger",
  neutral: "text-muted",
};

const toneBar: Record<HeartbeatTone, string> = {
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-danger",
  neutral: "bg-ink/10",
};

export function HeartbeatStatusBadge({ heartbeat }: { heartbeat: HeartbeatMonitorSummary }) {
  const state = heartbeatState(heartbeat);
  return <StatusBadge status={state.badge}>{state.label}</StatusBadge>;
}

export function HeartbeatStateLine({ heartbeat }: { heartbeat: HeartbeatMonitorSummary }) {
  const state = heartbeatState(heartbeat);
  const due =
    heartbeat.enabled &&
    !heartbeat.runningSince &&
    heartbeat.nextDeadlineAt &&
    new Date(heartbeat.nextDeadlineAt).getTime() > Date.now()
      ? heartbeat.nextDeadlineAt
      : null;
  return (
    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
      <p className={cn("text-sm font-semibold", toneText[state.tone])}>{state.headline}</p>
      <p className="text-xs text-muted">
        Last signal {formatRelative(heartbeat.lastPingAt).toLowerCase()}
        {due ? ` · due ${formatRelative(due).toLowerCase()}` : null}
      </p>
    </div>
  );
}

export function HeartbeatProblems({ heartbeat }: { heartbeat: HeartbeatMonitorSummary }) {
  const problems = heartbeatProblems(heartbeat);
  if (!problems.length) {
    return heartbeat.lastMessage && heartbeat.status === "down" ? (
      <p className="text-xs text-muted">{heartbeat.lastMessage}</p>
    ) : null;
  }
  return (
    <ul aria-label="Reported problems" className="flex flex-wrap gap-2">
      {problems.map((problem) => (
        <li
          key={problem.label}
          className="inline-flex items-baseline gap-1.5 rounded-lg border border-danger/30 bg-danger/8 px-2.5 py-1 text-xs"
        >
          <span className="text-ink">{problem.label}</span>
          {problem.value ? (
            <span className="font-semibold tabular-nums text-danger">{problem.value}</span>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

export function HeartbeatTimeline({ timeline }: { timeline: HeartbeatTimelineBucket[] }) {
  const totals = timelineTotals(timeline);
  const reports = totals.succeeded + totals.failed;
  return (
    <div>
      <div className="flex h-7 gap-[3px]" role="img" aria-label={timelineSummary(totals)}>
        {timeline.map((bucket) => (
          <span
            key={bucket.start}
            title={bucketTitle(bucket)}
            className={cn("min-w-0 flex-1 rounded-[3px]", toneBar[timelineTone(bucket)])}
          />
        ))}
      </div>
      <div className="mt-1.5 flex justify-between text-[11px] text-muted">
        <span>24 h ago</span>
        <span>
          {reports
            ? `${formatCount(totals.succeeded, "passing report")} of ${reports.toLocaleString()}`
            : "No reports"}
          {totals.missed ? ` · ${formatCount(totals.missed, "missed deadline")}` : null}
        </span>
        <span>Now</span>
      </div>
    </div>
  );
}

export function HeartbeatFacts({ heartbeat }: { heartbeat: HeartbeatMonitorSummary }) {
  const facts = [
    {
      label: "30-day success",
      value: heartbeat.runs30d
        ? `${formatPercent(heartbeat.successRate30d)} of ${heartbeat.runs30d.toLocaleString()}`
        : "No runs",
    },
    {
      label: "Last success",
      value: heartbeat.lastSuccessAt ? formatRelative(heartbeat.lastSuccessAt) : "Never",
    },
    ...(heartbeat.averageDurationMs30d !== null
      ? [{ label: "Avg duration", value: formatMilliseconds(heartbeat.averageDurationMs30d) }]
      : []),
  ];
  return <FactGrid facts={facts} />;
}

export function FoxytailHighlights({ heartbeat }: { heartbeat: HeartbeatMonitorSummary }) {
  const highlights = foxytailHighlights(heartbeat.latestMetadata);
  if (!highlights.length) return null;
  return <FactGrid facts={highlights} />;
}

function FactGrid({
  facts,
}: {
  facts: Array<{ label: string; value: string; tone?: HeartbeatTone }>;
}) {
  return (
    <dl className="grid grid-cols-[repeat(auto-fill,minmax(10.5rem,1fr))] gap-x-4 gap-y-3">
      {facts.map((fact) => (
        <div key={fact.label} className="min-w-0">
          <dt className="text-[11px] text-muted">{fact.label}</dt>
          <dd
            className={cn(
              "mt-0.5 truncate text-sm font-semibold",
              fact.tone ? toneText[fact.tone] : undefined
            )}
          >
            {fact.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function bucketTitle(bucket: HeartbeatTimelineBucket): string {
  const hour = new Date(bucket.start).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });
  const parts = [
    bucket.succeeded ? `${bucket.succeeded} passed` : null,
    bucket.failed ? `${bucket.failed} failed` : null,
    bucket.missed ? `${bucket.missed} missed` : null,
  ].filter(Boolean);
  return `${hour} · ${parts.length ? parts.join(", ") : "no signals"}`;
}

function timelineSummary(totals: ReturnType<typeof timelineTotals>): string {
  return `Last 24 hours: ${totals.succeeded} passed, ${totals.failed} failed, ${totals.missed} missed`;
}
