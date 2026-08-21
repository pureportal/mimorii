import { describe, expect, it } from "vitest";
import { firebasePushMessage } from "./firebase-push.provider.js";

describe("Firebase push payload", () => {
  it("targets the Android client installation and preserves notification interaction data", () => {
    const message = firebasePushMessage(
      { installationId: "fid-current" },
      {
        title: "Server is down",
        body: "Website has stopped responding",
        path: "/app/resources/resource-1",
        severity: "warning",
        tag: "incident-1",
        topic: "occurrence-1",
      }
    );

    expect(message).toMatchObject({
      fid: "fid-current",
      notification: {
        title: "Server is down",
        body: "Website has stopped responding",
      },
      data: {
        title: "Server is down",
        body: "Website has stopped responding",
        path: "/app/resources/resource-1",
        severity: "warning",
        tag: "incident-1",
      },
      android: {
        collapseKey: "occurrence-1",
        priority: "high",
        restrictedPackageName: "app.mimorii.monitor",
        notification: { channelId: "monitoring_alerts", tag: "incident-1" },
      },
    });
  });
});
