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

  it("keeps an explicit safe application path", () => {
    expect(notificationMessage("incident.opened", { path: appRoutes.alertHistory }).path).toBe(
      appRoutes.alertHistory
    );
  });
});
