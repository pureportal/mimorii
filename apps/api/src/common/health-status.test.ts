import { describe, expect, it } from "vitest";
import {
  resolveHeartbeatStatus,
  resolveMonitorStatus,
  resolveResourceStatus,
  summarizeMonitorStatuses,
} from "./health-status.js";

describe("monitor status", () => {
  it.each([
    ["up", "up"],
    ["degraded", "degraded"],
    ["down", "down"],
  ] as const)("keeps an HTTP %s result availability-oriented", (status, expected) => {
    expect(resolveMonitorStatus("http", status, false)).toBe(expected);
  });

  it.each([
    ["up", "okay"],
    ["degraded", "warning"],
    ["down", "critical"],
  ] as const)("presents a disk %s result as %s", (status, expected) => {
    expect(resolveMonitorStatus("disk", status, false)).toBe(expected);
  });

  it("reserves down health checks for a missed status report", () => {
    expect(resolveMonitorStatus("disk", "up", true)).toBe("down");
    expect(resolveMonitorStatus("disk", "down", true)).toBe("down");
  });

  it("keeps paused checks paused when their reporter is offline", () => {
    expect(resolveMonitorStatus("host", "paused", true)).toBe("paused");
  });

  it("keeps a missed heartbeat down", () => {
    expect(resolveHeartbeatStatus("up")).toBe("up");
    expect(resolveHeartbeatStatus("down")).toBe("down");
  });

  it("aggregates critical health without treating it as downtime", () => {
    expect(resolveResourceStatus(["up", "critical"], "online")).toBe("critical");
    expect(resolveResourceStatus(["warning", "up"], "online")).toBe("warning");
  });

  it("keeps purely availability-oriented aggregates availability-oriented", () => {
    expect(resolveResourceStatus(["up"], null)).toBe("up");
    expect(resolveResourceStatus(["up", "degraded"], null)).toBe("degraded");
  });

  it("reports an online agent without checks as up", () => {
    expect(resolveResourceStatus([], "online")).toBe("up");
  });

  it("reserves a resource down state for offline reporting or a down monitor", () => {
    expect(resolveResourceStatus(["critical"], "offline")).toBe("down");
    expect(resolveResourceStatus(["critical", "down"], "online")).toBe("down");
  });

  it("does not let a stale host replace a critical evaluation", () => {
    expect(resolveResourceStatus(["critical"], "stale")).toBe("critical");
  });

  it("summarizes passing and warning terminology across monitor kinds", () => {
    expect(
      summarizeMonitorStatuses([
        "up",
        "okay",
        "degraded",
        "warning",
        "critical",
        "down",
        "pending",
        "paused",
      ])
    ).toEqual({ passing: 2, warning: 2, critical: 1, down: 1, pending: 1, paused: 1 });
  });
});
