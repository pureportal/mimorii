export const webhookFormats = ["json", "slack", "discord", "teams", "google-chat", "ntfy"] as const;
export type WebhookFormat = (typeof webhookFormats)[number];

export const webhookFormatLabels: Record<WebhookFormat, string> = {
  json: "JSON",
  slack: "Slack",
  discord: "Discord",
  teams: "Microsoft Teams",
  "google-chat": "Google Chat",
  ntfy: "ntfy",
};

export function webhookFormatFor(value: string): WebhookFormat {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return "json";
  }
  const host = url.hostname.toLowerCase();
  if (host === "hooks.slack.com") return "slack";
  if (
    (host === "discord.com" || host === "discordapp.com" || host.endsWith(".discord.com")) &&
    url.pathname.startsWith("/api/webhooks/")
  ) {
    return "discord";
  }
  if (
    host.endsWith(".webhook.office.com") ||
    host.endsWith(".logic.azure.com") ||
    host.endsWith(".powerplatform.com")
  ) {
    return "teams";
  }
  if (host === "chat.googleapis.com") return "google-chat";
  if (host === "ntfy.sh") return "ntfy";
  return "json";
}
