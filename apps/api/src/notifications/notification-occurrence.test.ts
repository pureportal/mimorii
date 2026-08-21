import { describe, expect, it } from "vitest";
import { notificationOccurrenceKey } from "./notification-occurrence.js";

describe("notification occurrence identity", () => {
  const payload = {
    dedupeKey: "check:database",
    occurredAt: "2026-08-21T08:00:00.000Z",
  };

  it("identifies retries of the same event occurrence", () => {
    expect(notificationOccurrenceKey("incident.opened", payload)).toBe(
      notificationOccurrenceKey("incident.opened", { ...payload })
    );
  });

  it("preserves later incidents and state changes", () => {
    expect(notificationOccurrenceKey("incident.opened", payload)).not.toBe(
      notificationOccurrenceKey("incident.resolved", payload)
    );
    expect(notificationOccurrenceKey("incident.opened", payload)).not.toBe(
      notificationOccurrenceKey("incident.opened", {
        ...payload,
        occurredAt: "2026-08-21T09:00:00.000Z",
      })
    );
  });

  it("does not deduplicate events without an explicit occurrence", () => {
    expect(notificationOccurrenceKey("incident.opened", { dedupeKey: "incident:1" })).toBeNull();
  });
});
