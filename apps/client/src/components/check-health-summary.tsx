import type { CheckSummary } from "@mimorii/contracts";
import {
  checkMetricThresholdSeverity,
  checkMetricThresholds,
  type CheckMetricThreshold,
} from "../lib/check-chart";
import { cn } from "../lib/cn";
import { getCheckHealthItems } from "../lib/check-health";

export function CheckHealthSummary({
  check,
  className,
}: {
  check: Pick<CheckSummary, "type" | "config" | "timeoutMs" | "lastLatencyMs" | "latestMetrics">;
  className?: string;
}) {
  const items = getCheckHealthItems(check, 8)
    .map((item) => {
      const thresholds = checkMetricThresholds(check, item.key);
      const value = item.key === "latencyMs" ? check.lastLatencyMs : check.latestMetrics[item.key];
      const severity =
        typeof value === "number" ? checkMetricThresholdSeverity(value, thresholds) : null;
      return { item, thresholds, severity };
    })
    .toSorted((left, right) => severityPriority(right.severity) - severityPriority(left.severity))
    .slice(0, 2);
  if (!items.length) return <span className={cn("text-muted", className)}>—</span>;

  return (
    <div className={cn("flex min-w-48 items-start gap-5", className)}>
      {items.map(({ item, thresholds, severity }) => {
        return (
          <div key={item.key} className="min-w-20 flex-1">
            <div className="flex items-baseline justify-between gap-2 whitespace-nowrap">
              <span className="text-[11px] text-muted">{item.label}</span>
              <span
                className={cn(
                  "text-xs font-semibold",
                  severity === "critical"
                    ? "text-danger"
                    : severity === "warning"
                      ? "text-warning-strong"
                      : "text-ink"
                )}
              >
                {item.value}
              </span>
            </div>
            {item.percent !== undefined ? (
              <div
                role="progressbar"
                aria-label={item.label}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(item.percent)}
                aria-valuetext={`${item.value}${severity ? `, ${severity} threshold exceeded` : ""}`}
                className="relative mt-1.5 h-1.5 overflow-hidden rounded-full bg-ink/7"
              >
                <div
                  className={cn(
                    "h-full rounded-full",
                    severity === "critical"
                      ? "bg-danger"
                      : severity === "warning"
                        ? "bg-warning"
                        : "bg-lavender"
                  )}
                  style={{ width: `${Math.min(Math.max(item.percent, 0), 100)}%` }}
                />
                {severity ? thresholdMarkers(thresholds) : null}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

function severityPriority(severity: "warning" | "critical" | null): number {
  if (severity === "critical") return 2;
  return severity === "warning" ? 1 : 0;
}

function thresholdMarkers(thresholds: CheckMetricThreshold[]) {
  return thresholds.flatMap((threshold) =>
    threshold.value >= 0 && threshold.value <= 100
      ? [
          <span
            key={`${threshold.severity}-${threshold.value}`}
            aria-hidden="true"
            className={cn(
              "absolute inset-y-0 w-px",
              threshold.severity === "critical" ? "bg-danger" : "bg-warning-strong"
            )}
            style={{ left: `${threshold.value}%` }}
          />,
        ]
      : []
  );
}
