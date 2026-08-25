import {
  healthCheckTypes,
  type AgentStatus,
  type CheckStatus,
  type CheckType,
  type MonitorStatus,
} from "@mimorii/contracts";

const healthCheckStatuses = {
  pending: "pending",
  up: "okay",
  degraded: "warning",
  down: "critical",
  paused: "paused",
} as const satisfies Record<CheckStatus, MonitorStatus>;

const heartbeatStatuses = {
  pending: "pending",
  up: "up",
  degraded: "degraded",
  down: "down",
  paused: "paused",
} as const satisfies Record<CheckStatus, MonitorStatus>;

const statusPriority = {
  paused: 0,
  pending: 1,
  up: 2,
  okay: 2,
  degraded: 3,
  warning: 3,
  critical: 4,
  down: 5,
} as const satisfies Record<MonitorStatus, number>;

const healthCheckTypeSet = new Set<CheckType>(healthCheckTypes);

export interface MonitorStatusCounts {
  passing: number;
  warning: number;
  critical: number;
  down: number;
  pending: number;
  paused: number;
}

export function isHealthCheckType(type: CheckType): boolean {
  return healthCheckTypeSet.has(type);
}

export function resolveMonitorStatus(
  type: CheckType,
  status: CheckStatus,
  reportingDown: boolean
): MonitorStatus {
  if (status === "paused") return "paused";
  if (reportingDown) return "down";
  return isHealthCheckType(type) ? healthCheckStatuses[status] : status;
}

export function resolveHeartbeatStatus(status: CheckStatus): MonitorStatus {
  return heartbeatStatuses[status];
}

export function resolveResourceStatus(
  monitorStatuses: readonly MonitorStatus[],
  agentStatus: AgentStatus | null
): MonitorStatus {
  if (agentStatus === "offline") return "down";

  const statuses = [...monitorStatuses];
  if (agentStatus === "stale") statuses.push("warning");
  if (agentStatus === "online" && statuses.length === 0) statuses.push("up");
  if (statuses.length === 0) return "pending";

  const priority = Math.max(...statuses.map((status) => statusPriority[status]));
  if (priority === 5) return "down";
  if (priority === 4) return "critical";
  if (priority === 3) {
    return statuses.some((status) => status === "warning" || status === "critical")
      ? "warning"
      : "degraded";
  }
  if (priority === 2) return statuses.includes("okay") ? "okay" : "up";
  if (priority === 1) return "pending";
  return "paused";
}

export function summarizeMonitorStatuses(statuses: readonly MonitorStatus[]): MonitorStatusCounts {
  const counts: MonitorStatusCounts = {
    passing: 0,
    warning: 0,
    critical: 0,
    down: 0,
    pending: 0,
    paused: 0,
  };
  for (const status of statuses) {
    if (status === "up" || status === "okay") counts.passing += 1;
    else if (status === "degraded" || status === "warning") counts.warning += 1;
    else counts[status] += 1;
  }
  return counts;
}
