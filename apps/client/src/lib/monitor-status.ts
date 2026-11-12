import type { MonitorStatus } from "@mimorii/contracts";

export const monitorStatusPriority: Record<MonitorStatus, number> = {
  down: 0,
  critical: 1,
  warning: 2,
  degraded: 3,
  pending: 4,
  up: 5,
  okay: 5,
  paused: 6,
};

export const monitorStatusAccents: Partial<Record<MonitorStatus, string>> = {
  down: "bg-danger",
  critical: "bg-danger",
  warning: "bg-warning",
  degraded: "bg-warning",
};
