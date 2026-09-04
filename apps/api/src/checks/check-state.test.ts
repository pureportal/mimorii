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
  it("keeps a transient breach healthy", () => {
    const breached = nextCheckState(healthy, "degraded");

    expect(breached).toEqual({
      status: "up",
      failures: 1,
      successes: 0,
    });
    expect(nextCheckState({ ...healthy, consecutive_failures: breached.failures }, "up")).toEqual({
      status: "up",
      failures: 0,
      successes: 1,
    });
  });

  it("enters degraded after a sustained warning breach", () => {
    const first = nextCheckState(healthy, "degraded");

    expect(
      nextCheckState({ ...healthy, consecutive_failures: first.failures }, "degraded")
    ).toEqual({ status: "degraded", failures: 0, successes: 0 });
  });

  it("uses the failure threshold before entering down", () => {
    expect(nextCheckState(healthy, "down")).toEqual({
      status: "up",
      failures: 1,
      successes: 0,
    });
    expect(nextCheckState({ ...healthy, consecutive_failures: 1 }, "down")).toEqual({
      status: "down",
      failures: 0,
      successes: 0,
    });
  });

  it("confirms escalation from degraded to down independently", () => {
    const degraded = { ...healthy, current_status: "degraded" as const };

    expect(nextCheckState(degraded, "down")).toEqual({
      status: "degraded",
      failures: 1,
      successes: 0,
    });
    expect(nextCheckState({ ...degraded, consecutive_failures: 1 }, "down")).toEqual({
      status: "down",
      failures: 0,
      successes: 0,
    });
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

  it("uses each check's configured confirmation count", () => {
    expect(nextCheckState({ ...healthy, failure_threshold: 1 }, "degraded").status).toBe(
      "degraded"
    );

    const threeBreaches = { ...healthy, failure_threshold: 3 };
    const first = nextCheckState(threeBreaches, "degraded");
    const second = nextCheckState(
      { ...threeBreaches, consecutive_failures: first.failures },
      "degraded"
    );
    expect(second.status).toBe("up");
    expect(
      nextCheckState({ ...threeBreaches, consecutive_failures: second.failures }, "degraded").status
    ).toBe("degraded");
  });

  it("keeps a new check pending until its first result is confirmed", () => {
    expect(nextCheckState({ ...healthy, current_status: "pending" }, "degraded")).toEqual({
      status: "pending",
      failures: 1,
      successes: 0,
    });
    expect(nextCheckState({ ...healthy, current_status: "pending" }, "up")).toEqual({
      status: "pending",
      failures: 0,
      successes: 1,
    });
  });
});
