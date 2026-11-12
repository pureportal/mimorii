import type { CheckSummary, ResourceSummary } from "@mimorii/contracts";
import { describe, expect, it } from "vitest";
import { checkReason, resourceReason } from "./status-reason";

const check = {
  type: "http",
  status: "down",
  lastMessage: "Expected response content was not found",
  lastStatusCode: 200,
  agentOffline: false,
} as CheckSummary;

const resource = {
  status: "down",
  agent: null,
  problems: [],
} as unknown as ResourceSummary;

describe("status reasons", () => {
  it("explains why a check is failing", () => {
    expect(checkReason(check)).toBe("Expected response content was not found");
    expect(
      checkReason({ ...check, lastStatusCode: 503, lastMessage: "Unexpected HTTP status" })
    ).toBe("HTTP 503 · Unexpected HTTP status");
    expect(checkReason({ ...check, lastMessage: null, lastStatusCode: 502 })).toBe("HTTP 502");
    expect(checkReason({ ...check, agentOffline: true })).toBe("Agent offline · no new results");
    expect(checkReason({ ...check, status: "up" })).toBeNull();
    expect(
      checkReason({ ...check, type: "tcp", lastStatusCode: null, lastMessage: "Connection failed" })
    ).toBe("Connection failed");
  });

  it("explains why a resource needs attention", () => {
    expect(resourceReason({ ...resource, status: "up" })).toBeNull();
    expect(
      resourceReason({
        ...resource,
        problems: [
          {
            source: "check",
            id: "1",
            name: "Public DNS",
            status: "down",
            message: "Target could not be resolved",
          },
          { source: "heartbeat", id: "2", name: "Invoice export", status: "down", message: null },
        ],
      })
    ).toBe("Public DNS: Target could not be resolved · +1 more");
    expect(
      resourceReason({
        ...resource,
        agent: {
          id: "a",
          kind: "desktop",
          status: "offline",
          platform: null,
          version: null,
          lastSeenAt: new Date(Date.now() - 2 * 3_600_000).toISOString(),
        },
      })
    ).toBe("Agent offline · last seen 2 hours ago");
    expect(resourceReason(resource)).toBeNull();
  });
});
