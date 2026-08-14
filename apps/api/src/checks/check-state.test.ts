import { describe, expect, it } from "vitest";
import { nextCheckState, type CheckStateInput } from "./check-state.js";

const healthy: CheckStateInput = {
  current_status: "up",
  consecutive_failures: 0,
  consecutive_successes: 0,
  failure_threshold: 2,
  recovery_threshold: 2,
};

describe("check state", () => {
  it("uses the failure threshold before entering down", () => {
    expect(nextCheckState(healthy, "down")).toEqual({
      status: "degraded",
      failures: 1,
      successes: 0,
    });
    expect(
      nextCheckState({ ...healthy, current_status: "degraded", consecutive_failures: 1 }, "down")
    ).toEqual({ status: "down", failures: 2, successes: 0 });
  });

  it("uses the recovery threshold before leaving down", () => {
    expect(nextCheckState({ ...healthy, current_status: "down" }, "up").status).toBe("down");
    expect(
      nextCheckState({ ...healthy, current_status: "down", consecutive_successes: 1 }, "up").status
    ).toBe("up");
  });

  it("keeps an outage open until the recovery threshold is met", () => {
    const down = { ...healthy, current_status: "down" as const };
    expect(nextCheckState(down, "down").status).toBe("down");
    expect(nextCheckState(down, "degraded").status).toBe("down");
  });

  it("enters degraded immediately for warning thresholds", () => {
    expect(nextCheckState(healthy, "degraded")).toEqual({
      status: "degraded",
      failures: 0,
      successes: 0,
    });
  });
});
