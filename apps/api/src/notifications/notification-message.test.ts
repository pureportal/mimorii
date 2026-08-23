import { appRoutes, type NotificationEvent } from "@mimorii/contracts";
import { describe, expect, it } from "vitest";
import { notificationMessage } from "./notification-message.js";

describe("notificationMessage navigation", () => {
  it.each<[NotificationEvent, string]>([
    ["incident.opened", appRoutes.incidents],
    ["incident.updated", appRoutes.incidents],
    ["incident.resolved", appRoutes.incidents],
    ["maintenance.started", appRoutes.maintenance],
    ["maintenance.completed", appRoutes.maintenance],
    ["slo.breached", appRoutes.serviceGoals],
  ])("links %s to its canonical destination", (event, path) => {
    expect(notificationMessage(event, {}).path).toBe(path);
  });

  it("links check events to the affected resource", () => {
    expect(notificationMessage("check.degraded", { resourceId: "resource/1" }).path).toBe(
      appRoutes.resource("resource/1")
    );
  });

  it("links resource alerts to the monitored resource in the Client", () => {
    expect(notificationMessage("resource.alert.triggered", { resourceId: "device-1" }).path).toBe(
      appRoutes.resource("device-1")
    );
  });

  it("keeps an explicit safe application path", () => {
    expect(notificationMessage("incident.opened", { path: appRoutes.alertHistory }).path).toBe(
      appRoutes.alertHistory
    );
  });

  it("collapses retries of one occurrence without collapsing later state changes", () => {
    const payload = {
      title: "Server is down",
      dedupeKey: "check:resource-1",
      occurredAt: "2026-08-21T10:00:00.000Z",
    };
    const first = notificationMessage("check.degraded", payload);
    const retry = notificationMessage("check.degraded", payload);
    const recovered = notificationMessage("check.recovered", {
      ...payload,
      occurredAt: "2026-08-21T10:05:00.000Z",
    });

    expect(retry).toMatchObject({ tag: first.tag, topic: first.topic });
    expect(recovered.tag).not.toBe(first.tag);
    expect(recovered.topic).not.toBe(first.topic);
  });
});
