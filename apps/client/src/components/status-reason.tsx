import type { CheckSummary, MonitorStatus, ResourceSummary } from "@mimorii/contracts";
import { cn } from "../lib/cn";
import { formatRelative } from "../lib/format";

const problemStatuses = new Set<MonitorStatus>(["down", "degraded", "warning", "critical"]);

export function checkReason(check: CheckSummary): string | null {
  if (!problemStatuses.has(check.status)) return null;
  if (check.agentOffline) return "Agent offline · no new results";
  const message = check.lastMessage?.trim() || null;
  const failedCode =
    check.type === "http" &&
    check.lastStatusCode !== null &&
    (!message || check.lastStatusCode >= 400)
      ? `HTTP ${check.lastStatusCode}`
      : null;
  if (failedCode && message) return `${failedCode} · ${message}`;
  return failedCode ?? message;
}

export function resourceReason(resource: ResourceSummary): string | null {
  if (!problemStatuses.has(resource.status)) return null;
  if (resource.agent?.status === "offline") {
    return `Agent offline · last seen ${formatRelative(resource.agent.lastSeenAt).toLowerCase()}`;
  }
  const [first, ...rest] = resource.problems;
  if (!first) {
    return resource.agent?.status === "stale"
      ? `Agent reporting late · last seen ${formatRelative(resource.agent.lastSeenAt).toLowerCase()}`
      : null;
  }
  const detail = first.message ? `${first.name}: ${first.message}` : first.name;
  return rest.length ? `${detail} · +${rest.length} more` : detail;
}

export function StatusReason({
  reason,
  status,
  className,
}: {
  reason: string | null;
  status: MonitorStatus;
  className?: string;
}) {
  if (!reason) return null;
  const severe = status === "down" || status === "critical";
  return (
    <p
      title={reason}
      className={cn(
        "line-clamp-2 break-words text-xs",
        severe ? "text-danger" : "text-warning-strong",
        className
      )}
    >
      {reason}
    </p>
  );
}
