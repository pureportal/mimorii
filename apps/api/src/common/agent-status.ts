import type { AgentKind, AgentStatus } from "@mimorii/contracts";

export interface AgentStatusInput {
  kind: AgentKind;
  collectionIntervalSeconds: number;
  lastSeenAt: string | null;
}

export function resolveAgentStatus(input: AgentStatusInput, now = Date.now()): AgentStatus {
  if (!input.lastSeenAt) return "never";
  const interval = input.collectionIntervalSeconds * 1_000;
  const age = now - new Date(input.lastSeenAt).getTime();
  const onlineThreshold = input.kind === "mobile" ? Math.max(30 * 60_000, interval * 2) : 90_000;
  const staleThreshold =
    input.kind === "mobile" ? Math.max(2 * 60 * 60_000, interval * 4) : 300_000;
  return age <= onlineThreshold ? "online" : age <= staleThreshold ? "stale" : "offline";
}
