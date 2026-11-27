import { webhookFormatFor, type NotificationEvent } from "@mimorii/contracts";
import { publicBaseUrl } from "../common/public-url.js";
import { notificationMessage } from "./notification-message.js";

export interface WebhookRequest {
  contentType: string;
  body: string;
  headers: Record<string, string>;
}

export function webhookRequest(
  url: string,
  event: NotificationEvent,
  payload: Record<string, unknown>,
  timestamp: string
): WebhookRequest {
  const message = notificationMessage(event, payload);
  const link = `${publicBaseUrl()}${message.path}`;
  const json = (value: unknown): WebhookRequest => ({
    contentType: "application/json",
    body: JSON.stringify(value),
    headers: {},
  });
  switch (webhookFormatFor(url)) {
    case "slack":
      return json({
        text: `${message.title}: ${message.body}`,
        blocks: [
          {
            type: "section",
            text: { type: "mrkdwn", text: `*${message.title}*\n${message.body}` },
          },
          {
            type: "actions",
            elements: [
              { type: "button", text: { type: "plain_text", text: "Open in Mimorii" }, url: link },
            ],
          },
        ],
      });
    case "discord":
      return json({
        embeds: [
          {
            title: message.title,
            description: message.body,
            url: link,
            color: message.severity === "warning" ? 0xf59e0b : 0x6366f1,
            timestamp,
          },
        ],
      });
    case "teams":
      return json({
        type: "message",
        attachments: [
          {
            contentType: "application/vnd.microsoft.card.adaptive",
            content: {
              $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
              type: "AdaptiveCard",
              version: "1.4",
              body: [
                {
                  type: "TextBlock",
                  text: message.title,
                  weight: "Bolder",
                  size: "Medium",
                  wrap: true,
                },
                { type: "TextBlock", text: message.body, wrap: true },
              ],
              actions: [{ type: "Action.OpenUrl", title: "Open in Mimorii", url: link }],
            },
          },
        ],
      });
    case "google-chat":
      return json({ text: `*${message.title}*\n${message.body}\n${link}` });
    case "ntfy":
      return {
        contentType: "text/plain; charset=utf-8",
        body: message.body,
        headers: {
          title: `=?UTF-8?B?${Buffer.from(message.title).toString("base64")}?=`,
          click: link,
          tags: message.severity === "warning" ? "warning" : "information_source",
          priority: message.severity === "warning" ? "high" : "default",
        },
      };
    case "json":
      return json({ event, timestamp, data: payload });
  }
}
