import type { CheckStatus } from "@mimorii/contracts";

export interface CheckStateInput {
  current_status: CheckStatus;
  consecutive_failures: number;
  consecutive_successes: number;
  failure_threshold: number;
  recovery_threshold: number;
}

export interface CheckState {
  status: "up" | "degraded" | "down";
  failures: number;
  successes: number;
}

export function nextCheckState(
  check: CheckStateInput,
  resultStatus: "up" | "degraded" | "down"
): CheckState {
  if (resultStatus === "down") {
    const failures = check.consecutive_failures + 1;
    return {
      status:
        check.current_status === "down" || failures >= check.failure_threshold
          ? "down"
          : "degraded",
      failures,
      successes: 0,
    };
  }
  if (resultStatus === "degraded") {
    return {
      status: check.current_status === "down" ? "down" : "degraded",
      failures: 0,
      successes: 0,
    };
  }
  const successes = check.consecutive_successes + 1;
  return {
    status:
      successes >= check.recovery_threshold
        ? "up"
        : check.current_status === "down"
          ? "down"
          : "degraded",
    failures: 0,
    successes,
  };
}
