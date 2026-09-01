import type { CheckType, MonitorStatus } from "@mimorii/contracts";
import { autoUpdate, flip, offset, shift, useFloating } from "@floating-ui/react-dom";
import {
  CircleCheck,
  CirclePause,
  CircleX,
  Clock3,
  OctagonAlert,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { isHealthCheckType } from "../lib/check-health";
import { cn } from "../lib/cn";

const statusPresentation = {
  pending: {
    label: "Pending",
    icon: Clock3,
    className: "bg-lavender-soft text-violet-strong ring-lavender/25",
  },
  up: {
    label: "Up",
    icon: CircleCheck,
    className: "bg-success/12 text-success-strong ring-success/25",
  },
  degraded: {
    label: "Degraded",
    icon: TriangleAlert,
    className: "bg-warning/16 text-warning-strong ring-warning/30",
  },
  okay: {
    label: "Okay",
    icon: CircleCheck,
    className: "bg-success/12 text-success-strong ring-success/25",
  },
  warning: {
    label: "Warning",
    icon: TriangleAlert,
    className: "bg-warning/16 text-warning-strong ring-warning/30",
  },
  critical: {
    label: "Critical",
    icon: OctagonAlert,
    className: "bg-danger text-night ring-danger",
  },
  down: {
    label: "Down",
    icon: CircleX,
    className: "bg-danger/12 text-danger ring-danger/25",
  },
  paused: {
    label: "Paused",
    icon: CirclePause,
    className: "bg-ink/6 text-muted ring-line",
  },
} as const satisfies Record<MonitorStatus, { label: string; icon: LucideIcon; className: string }>;

export function CheckStatusIndicator({
  checkName,
  status,
  type,
}: {
  checkName: string;
  status: MonitorStatus;
  type: CheckType;
}) {
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const hoverCloseTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const open = (hovered || focused) && !dismissed;
  const tooltipId = useId();
  const presentation = statusPresentation[status];
  const Icon = presentation.icon;
  const { refs, floatingStyles } = useFloating({
    open,
    placement: "top",
    strategy: "fixed",
    middleware: [offset(8), flip({ padding: 8 }), shift({ padding: 8 })],
    whileElementsMounted: autoUpdate,
  });

  const cancelHoverClose = () => {
    if (hoverCloseTimer.current === undefined) return;
    clearTimeout(hoverCloseTimer.current);
    hoverCloseTimer.current = undefined;
  };

  const beginHover = (resetDismissal: boolean) => {
    cancelHoverClose();
    if (resetDismissal && !hovered) setDismissed(false);
    setHovered(true);
  };

  const scheduleHoverClose = () => {
    cancelHoverClose();
    hoverCloseTimer.current = setTimeout(() => {
      setHovered(false);
      hoverCloseTimer.current = undefined;
    }, 120);
  };

  useEffect(
    () => () => {
      if (hoverCloseTimer.current !== undefined) clearTimeout(hoverCloseTimer.current);
    },
    []
  );

  return (
    <>
      <span
        ref={refs.setReference}
        role="img"
        tabIndex={0}
        aria-label={`${checkName} status: ${presentation.label}`}
        aria-describedby={open ? tooltipId : undefined}
        data-status={status}
        className={cn(
          "grid size-8 place-items-center rounded-full ring-1 ring-inset outline-none transition focus-visible:ring-2 focus-visible:ring-coral-strong",
          presentation.className
        )}
        onMouseEnter={() => beginHover(true)}
        onMouseLeave={scheduleHoverClose}
        onFocus={() => {
          setFocused(true);
          setDismissed(false);
        }}
        onBlur={() => {
          setFocused(false);
          setDismissed(false);
        }}
        onKeyDown={(event) => {
          if (event.key !== "Escape") return;
          event.preventDefault();
          setDismissed(true);
        }}
      >
        <Icon aria-hidden="true" className="size-4" />
      </span>
      {open && typeof document !== "undefined"
        ? createPortal(
            <div
              ref={refs.setFloating}
              id={tooltipId}
              role="tooltip"
              style={floatingStyles}
              className="z-[70] w-64 max-w-[calc(100vw-1rem)] animate-fade-in rounded-xl border border-line bg-surface p-3 text-left shadow-xl"
              onMouseEnter={() => beginHover(false)}
              onMouseLeave={scheduleHoverClose}
            >
              <p className="text-sm font-semibold text-ink">{presentation.label}</p>
              <p className="mt-1 text-xs leading-5 text-muted">{statusDescription(status, type)}</p>
            </div>,
            document.body
          )
        : null}
    </>
  );
}

function statusDescription(status: MonitorStatus, type: CheckType): string {
  switch (status) {
    case "pending":
      return "Waiting for the first result.";
    case "up":
      return "The latest connectivity check passed.";
    case "degraded":
      return "The latest connectivity check completed with a warning.";
    case "okay":
      return "The latest health check passed.";
    case "warning":
      return "A health metric reached its warning threshold.";
    case "critical":
      return "A health metric reached its critical threshold.";
    case "down":
      return isHealthCheckType(type)
        ? "The reporter is offline."
        : "The latest connectivity check failed.";
    case "paused":
      return "Runs are paused.";
  }

  throw new Error("Unsupported check status");
}
