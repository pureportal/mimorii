import { describe, expect, it } from "vitest";
import { resolveAgentStatus } from "./agent-status.js";

const desktopAgent = {
  kind: "desktop" as const,
  collectionIntervalSeconds: 30,
};
const now = new Date("2026-08-25T12:00:00.000Z").getTime();

describe("agent status", () => {
  it("keeps a desktop reporter stale through the configured threshold", () => {
    expect(
      resolveAgentStatus({ ...desktopAgent, lastSeenAt: "2026-08-25T11:55:00.000Z" }, now)
    ).toBe("stale");
  });

  it("marks a desktop reporter offline after the configured threshold", () => {
    expect(
      resolveAgentStatus({ ...desktopAgent, lastSeenAt: "2026-08-25T11:54:59.999Z" }, now)
    ).toBe("offline");
  });
});
