import type { ExecutedCheckResult } from "./checks.types.js";

export type CheckOutcome = Omit<ExecutedCheckResult, "checkedAt">;
export type CheckMetrics = ExecutedCheckResult["metrics"];

export function failedOutcome(
  message: string,
  latencyMs: number | null = null,
  metrics: CheckMetrics = {},
  statusCode: number | null = null
): CheckOutcome {
  return { status: "down", latencyMs, statusCode, message, metrics };
}

export function elapsedMs(started: number): number {
  return Math.round((performance.now() - started) * 10) / 10;
}

export class CheckFailure extends Error {}
