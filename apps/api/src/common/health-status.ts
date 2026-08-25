import type { AgentStatus, CheckHealthStatus, CheckStatus } from "@mimorii/contracts";

const reportedCheckStatuses = {
  pending: "pending",
  up: "okay",
  degraded: "warning",
  down: "critical",
} as const satisfies Record<Exclude<CheckStatus, "paused">, CheckHealthStatus>;

const heartbeatStatuses = {
  pending: "pending",
  up: "okay",
  degraded: "warning",
  down: "down",
  paused: "paused",
} as const satisfies Record<CheckStatus, CheckHealthStatus>;

const healthPriority = {
  paused: 0,
  pending: 1,
  okay: 2,
  warning: 3,
  critical: 4,
  down: 5,
} as const satisfies Record<CheckHealthStatus, number>;

export function resolveCheckHealthStatus(
  status: CheckStatus,
  reportingDown: boolean
): CheckHealthStatus {
  if (status === "paused") return "paused";
  if (reportingDown) return "down";
  return reportedCheckStatuses[status];
}

export function resolveHeartbeatHealthStatus(status: CheckStatus): CheckHealthStatus {
  return heartbeatStatuses[status];
}

export function resolveResourceHealthStatus(
  monitorStatuses: readonly CheckHealthStatus[],
  agentStatus: AgentStatus | null
): CheckHealthStatus {
  if (agentStatus === "offline") return "down";

  const statuses = [...monitorStatuses];
  if (agentStatus === "stale") statuses.push("warning");
  if (agentStatus === "online" && statuses.length === 0) statuses.push("okay");
  if (statuses.length === 0) return "pending";

  return statuses.reduce((worst, status) =>
    healthPriority[status] > healthPriority[worst] ? status : worst
  );
}
