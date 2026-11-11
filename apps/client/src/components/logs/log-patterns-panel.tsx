import { logLevels, logPatternPlaceholder, type LogPatternsResult } from "@mimorii/contracts";
import { EyeOff, ListFilter } from "lucide-react";
import { formatRelative } from "../../lib/format";
import { logLevelPresentation } from "../../lib/log-display";
import { EmptyState } from "../page-state";
import { Button } from "../ui/button";

export function LogPatternsPanel({
  result,
  onShow,
  onExclude,
}: {
  result: LogPatternsResult;
  onShow: (pattern: string) => void;
  onExclude: (pattern: string) => void;
}) {
  if (!result.patterns.length) {
    return (
      <div className="p-5">
        <EmptyState title="No patterns in this time range" illustration="empty" />
      </div>
    );
  }
  const total = result.patterns.reduce((sum, pattern) => sum + pattern.count, 0);
  return (
    <div>
      {result.limited ? (
        <p className="border-b border-line px-4 py-2 text-xs text-muted">
          Based on the latest {result.sampled.toLocaleString()} lines
        </p>
      ) : null}
      <ul aria-label="Log patterns" className="divide-y divide-line/70">
        {result.patterns.map((pattern) => {
          const peak = Math.max(1, ...pattern.trend);
          return (
            <li
              key={pattern.pattern}
              className="grid gap-3 px-4 py-3 md:grid-cols-[6.5rem_5.5rem_minmax(0,1fr)_auto] md:items-center"
            >
              <svg
                aria-hidden="true"
                viewBox={`0 0 ${pattern.trend.length * 4} 20`}
                preserveAspectRatio="none"
                className="hidden h-7 w-full md:block"
              >
                {pattern.trend.map((count, index) => {
                  const height = count ? Math.max(2, (count / peak) * 20) : 0;
                  return (
                    <rect
                      key={index}
                      x={index * 4}
                      y={20 - height}
                      width={3}
                      height={height}
                      rx={1}
                      fill="var(--color-lavender)"
                    />
                  );
                })}
              </svg>
              <div className="flex items-baseline gap-2 md:block">
                <p className="font-display text-base font-bold">{pattern.count.toLocaleString()}</p>
                <p className="text-xs text-muted">{Math.round((pattern.count / total) * 100)}%</p>
              </div>
              <div className="min-w-0">
                <p className="break-words font-mono text-[12.5px] leading-5 text-ink [overflow-wrap:anywhere]">
                  {renderPattern(pattern.pattern)}
                </p>
                <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted">
                  {logLevels
                    .filter((level) => pattern.levels[level])
                    .map((level) => (
                      <span key={level} className="inline-flex items-center gap-1.5">
                        <span
                          aria-hidden="true"
                          className="size-2 rounded-sm"
                          style={{ backgroundColor: logLevelPresentation[level].color }}
                        />
                        {logLevelPresentation[level].label}{" "}
                        {pattern.levels[level]!.toLocaleString()}
                      </span>
                    ))}
                  <span>Last seen {formatRelative(pattern.lastSeen)}</span>
                </div>
              </div>
              <div className="flex gap-1 md:justify-end">
                <Button variant="outline" size="sm" onClick={() => onShow(pattern.pattern)}>
                  <ListFilter /> Show lines
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Exclude pattern"
                  title="Exclude pattern"
                  onClick={() => onExclude(pattern.pattern)}
                >
                  <EyeOff />
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function renderPattern(pattern: string) {
  return pattern.split(logPatternPlaceholder).flatMap((part, index) =>
    index === 0
      ? [part]
      : [
          <span
            key={index}
            className="mx-px rounded bg-lavender-soft px-1 text-[11px] text-violet-strong"
          >
            {logPatternPlaceholder}
          </span>,
          part,
        ]
  );
}
