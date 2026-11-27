import { webhookFormatFor } from "@mimorii/contracts";
import { describe, expect, it } from "vitest";
import { webhookRequest } from "./webhook-payload.js";

const payload = {
  title: "API is down",
  message: "HTTP 503 from https://api.example.com/health",
  severity: "warning",
  resourceId: "resource-1",
};
const timestamp = "2026-11-27T10:00:00.000Z";

describe("webhook formats", () => {
  it("detects chat services from the webhook address", () => {
    expect(webhookFormatFor("https://hooks.slack.com/services/T/B/x")).toBe("slack");
    expect(webhookFormatFor("https://discord.com/api/webhooks/1/abc")).toBe("discord");
    expect(webhookFormatFor("https://contoso.webhook.office.com/webhookb2/x")).toBe("teams");
    expect(webhookFormatFor("https://prod-1.westeurope.logic.azure.com/workflows/x")).toBe("teams");
    expect(webhookFormatFor("https://chat.googleapis.com/v1/spaces/x/messages?key=k")).toBe(
      "google-chat"
    );
    expect(webhookFormatFor("https://ntfy.sh/mimorii-alerts")).toBe("ntfy");
    expect(webhookFormatFor("https://discord.com/channels/1")).toBe("json");
    expect(webhookFormatFor("https://example.com/hook")).toBe("json");
  });

  it("keeps the signed JSON envelope for generic webhooks", () => {
    const request = webhookRequest(
      "https://example.com/hook",
      "check.degraded",
      payload,
      timestamp
    );
    expect(request.contentType).toBe("application/json");
    expect(JSON.parse(request.body)).toEqual({ event: "check.degraded", timestamp, data: payload });
  });

  it("renders chat messages with a link back to Mimorii", () => {
    const slack = JSON.parse(
      webhookRequest("https://hooks.slack.com/services/x", "check.degraded", payload, timestamp)
        .body
    );
    expect(slack.text).toBe("API is down: HTTP 503 from https://api.example.com/health");
    expect(slack.blocks[1].elements[0].url).toMatch(/\/app\/monitoring\/resources\/resource-1$/);

    const discord = JSON.parse(
      webhookRequest("https://discord.com/api/webhooks/1/a", "check.degraded", payload, timestamp)
        .body
    );
    expect(discord.embeds[0]).toMatchObject({ title: "API is down", color: 0xf59e0b, timestamp });

    const teams = JSON.parse(
      webhookRequest("https://x.webhook.office.com/a", "incident.opened", payload, timestamp).body
    );
    expect(teams.attachments[0].content.body[0].text).toBe("API is down");
  });

  it("sends ntfy notifications as text with encoded headers", () => {
    const request = webhookRequest("https://ntfy.sh/topic", "check.degraded", payload, timestamp);
    expect(request.contentType).toBe("text/plain; charset=utf-8");
    expect(request.body).toBe(payload.message);
    expect(request.headers).toMatchObject({ priority: "high", tags: "warning" });
    expect(Buffer.from(request.headers.title!.slice(10, -2), "base64").toString()).toBe(
      "API is down"
    );
  });
});
