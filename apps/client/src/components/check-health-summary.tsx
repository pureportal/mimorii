import type { CheckSummary } from "@mimorii/contracts";
import { cn } from "../lib/cn";
import { getCheckHealthItems } from "../lib/check-health";

export function CheckHealthSummary({
  check,
  className,
}: {
  check: Pick<CheckSummary, "type" | "lastLatencyMs" | "latestMetrics">;
  className?: string;
}) {
  const items = getCheckHealthItems(check);
  if (!items.length) return <span className="text-muted">—</span>;

  return (
    <div className={cn("flex min-w-48 items-start gap-5", className)}>
      {items.map((item) => (
        <div key={item.key} className="min-w-20 flex-1">
          <div className="flex items-baseline justify-between gap-2 whitespace-nowrap">
            <span className="text-[11px] text-muted">{item.label}</span>
            <span className="text-xs font-semibold text-ink">{item.value}</span>
          </div>
          {item.percent !== undefined ? (
            <div
              role="progressbar"
              aria-label={item.label}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(item.percent)}
              className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-ink/7"
            >
              <div
                className="h-full rounded-full bg-lavender"
                style={{ width: `${Math.min(Math.max(item.percent, 0), 100)}%` }}
              />
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}
