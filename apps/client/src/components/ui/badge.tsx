import type { HTMLAttributes } from "react";
import { cn } from "../../lib/cn";

const styles = {
  okay: "bg-success/12 text-success-strong",
  up: "bg-success/12 text-success-strong",
  online: "bg-success/12 text-success-strong",
  down: "bg-danger/12 text-danger",
  offline: "bg-danger/12 text-danger",
  warning: "bg-warning/16 text-warning-strong",
  degraded: "bg-warning/16 text-warning-strong",
  stale: "bg-warning/16 text-warning-strong",
  pending: "bg-lavender-soft text-violet-strong",
  approved: "bg-success/12 text-success-strong",
  declined: "bg-danger/12 text-danger",
  never: "bg-lavender-soft text-violet-strong",
  paused: "bg-ink/6 text-muted",
  resolved: "bg-ink/6 text-muted",
  open: "bg-danger/12 text-danger",
  investigating: "bg-danger/12 text-danger",
  identified: "bg-warning/16 text-warning-strong",
  monitoring: "bg-lavender-soft text-violet-strong",
  maintenance: "bg-lavender-soft text-violet-strong",
  scheduled: "bg-lavender-soft text-violet-strong",
  active: "bg-warning/16 text-warning-strong",
  completed: "bg-ink/6 text-muted",
  cancelled: "bg-ink/6 text-muted",
  delivered: "bg-success/12 text-success-strong",
  failed: "bg-danger/12 text-danger",
  met: "bg-success/12 text-success-strong",
  "at-risk": "bg-warning/16 text-warning-strong",
  breached: "bg-danger/12 text-danger",
  "no-data": "bg-ink/6 text-muted",
  minor: "bg-warning/16 text-warning-strong",
  major: "bg-danger/12 text-danger",
  critical: "bg-danger text-night",
  operational: "bg-success/12 text-success-strong",
  outage: "bg-danger/12 text-danger",
} as const;

export function StatusBadge({
  status,
  className,
  children,
  ...props
}: { status: keyof typeof styles } & HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold capitalize",
        styles[status],
        className
      )}
      {...props}
    >
      {children ?? status}
    </span>
  );
}
