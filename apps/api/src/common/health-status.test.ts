import { describe, expect, it } from "vitest";
import {
  resolveCheckHealthStatus,
  resolveHeartbeatHealthStatus,
  resolveResourceHealthStatus,
} from "./health-status.js";

describe("health status", () => {
  it.each([
    ["up", "okay"],
    ["degraded", "warning"],
    ["down", "critical"],
  ] as const)("presents a reported %s evaluation as %s", (status, expected) => {
    expect(resolveCheckHealthStatus(status, false)).toBe(expected);
  });

  it("reserves down for a missed check status report", () => {
    expect(resolveCheckHealthStatus("up", true)).toBe("down");
    expect(resolveCheckHealthStatus("down", true)).toBe("down");
  });

  it("keeps paused checks paused when their reporter is offline", () => {
    expect(resolveCheckHealthStatus("paused", true)).toBe("paused");
  });

  it("keeps a missed heartbeat down", () => {
    expect(resolveHeartbeatHealthStatus("down")).toBe("down");
  });

  it("aggregates evaluated health without treating critical as down", () => {
    expect(resolveResourceHealthStatus(["okay", "critical"], "online")).toBe("critical");
    expect(resolveResourceHealthStatus(["warning", "okay"], "online")).toBe("warning");
  });

  it("reserves a resource down state for offline reporting or a down monitor", () => {
    expect(resolveResourceHealthStatus(["critical"], "offline")).toBe("down");
    expect(resolveResourceHealthStatus(["critical", "down"], "online")).toBe("down");
  });

  it("does not let a stale host replace a critical evaluation", () => {
    expect(resolveResourceHealthStatus(["critical"], "stale")).toBe("critical");
  });
});
