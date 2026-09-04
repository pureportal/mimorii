import type { CheckStatus } from "@mimorii/contracts";

export interface CheckStateInput {
  current_status: CheckStatus;
  consecutive_failures: number;
  consecutive_successes: number;
  failure_threshold: number;
  recovery_threshold: number;
}

export interface CheckState {
  status: Exclude<CheckStatus, "paused">;
  failures: number;
  successes: number;
}

export function nextCheckState(
  check: CheckStateInput,
  resultStatus: "up" | "degraded" | "down"
): CheckState {
  if (resultStatus !== "up") {
    if (check.current_status === "down") {
      return {
        status: "down",
        failures: 0,
        successes: 0,
      };
    }

    if (check.current_status === "degraded") {
      if (resultStatus === "degraded") {
        return {
          status: "degraded",
          failures: 0,
          successes: 0,
        };
      }

      const failures = check.consecutive_failures + 1;
      const confirmed = failures >= check.failure_threshold;
      return {
        status: confirmed ? "down" : "degraded",
        failures: confirmed ? 0 : failures,
        successes: 0,
      };
    }

    const failures = check.consecutive_failures + 1;
    const confirmed = failures >= check.failure_threshold;
    return {
      status: confirmed ? resultStatus : check.current_status === "pending" ? "pending" : "up",
      failures: confirmed ? 0 : failures,
      successes: 0,
    };
  }

  const successes = check.consecutive_successes + 1;
  const recoveringStatus =
    check.current_status === "down" ||
    check.current_status === "degraded" ||
    check.current_status === "pending"
      ? check.current_status
      : "up";
  return {
    status: successes >= check.recovery_threshold ? "up" : recoveringStatus,
    failures: 0,
    successes,
  };
}
