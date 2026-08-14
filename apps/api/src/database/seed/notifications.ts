import { encryptConfiguration } from "../../common/crypto.js";
import { at, days, hours, seedId, type SeedContext } from "./context.js";

export interface SeedNotificationIds {
  emailChannelId: string;
  webhookChannelId: string;
  disabledChannelId: string;
}

export async function seedNotifications(context: SeedContext): Promise<SeedNotificationIds> {
  const ids: SeedNotificationIds = {
    emailChannelId: seedId(context, "notification-channel:email"),
    webhookChannelId: seedId(context, "notification-channel:webhook"),
    disabledChannelId: seedId(context, "notification-channel:disabled"),
  };
  await seedChannels(context, ids);
  await seedPolicies(context, ids);
  await seedDeliveries(context, ids);
  return ids;
}

async function seedChannels(context: SeedContext, ids: SeedNotificationIds): Promise<void> {
  const channels = [
    {
      id: ids.emailChannelId,
      name: "Operations email",
      type: "email",
      configuration: { recipients: ["on-call@example.com", "operations@example.com"] },
      enabled: 1,
    },
    {
      id: ids.webhookChannelId,
      name: "Incident webhook",
      type: "webhook",
      configuration: {
        url: "https://hooks.example.com/mimorii",
        secret: "development-webhook-signing-secret",
      },
      enabled: 1,
    },
    {
      id: ids.disabledChannelId,
      name: "Disabled release email",
      type: "email",
      configuration: { recipients: ["releases@example.com"] },
      enabled: 0,
    },
  ] as const;
  for (const [index, channel] of channels.entries()) {
    await context.database.run(
      `INSERT INTO notification_channels
       (id, team_id, name, type, configuration_json, enabled, created_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET name = excluded.name, type = excluded.type,
       configuration_json = excluded.configuration_json, enabled = excluded.enabled,
       updated_at = excluded.updated_at`,
      channel.id,
      context.teamId,
      channel.name,
      channel.type,
      encryptConfiguration(channel.configuration),
      channel.enabled,
      context.userId,
      at(context, -days(80 - index * 10)),
      context.now.toISOString()
    );
  }
}

async function seedPolicies(context: SeedContext, channels: SeedNotificationIds): Promise<void> {
  const policies = [
    {
      key: "incidents",
      name: "Production incidents",
      events: [
        "incident.opened",
        "incident.updated",
        "incident.resolved",
        "check.degraded",
        "check.recovered",
      ],
      condition: {
        kind: "group",
        operator: "and",
        conditions: [
          { kind: "condition", field: "resourceTags", operator: "contains", value: "production" },
          {
            kind: "group",
            operator: "or",
            conditions: [
              {
                kind: "condition",
                field: "impact",
                operator: "in",
                value: ["major", "critical"],
              },
              {
                kind: "condition",
                field: "event",
                operator: "in",
                value: ["check.degraded", "check.recovered"],
              },
            ],
          },
        ],
      },
      enabled: 1,
      channelIds: [channels.emailChannelId, channels.webhookChannelId],
    },
    {
      key: "maintenance",
      name: "Maintenance lifecycle",
      events: ["maintenance.started", "maintenance.completed"],
      condition: { kind: "group", operator: "and", conditions: [] },
      enabled: 1,
      channelIds: [channels.emailChannelId],
    },
    {
      key: "objectives",
      name: "Objective breaches",
      events: ["slo.breached"],
      condition: {
        kind: "group",
        operator: "and",
        conditions: [
          { kind: "condition", field: "resourceTags", operator: "contains", value: "payments" },
        ],
      },
      enabled: 0,
      channelIds: [channels.disabledChannelId],
    },
  ] as const;
  for (const [index, policy] of policies.entries()) {
    const id = seedId(context, `notification-policy:${policy.key}`);
    await context.database.run(
      `INSERT INTO notification_policies
       (id, team_id, name, events_json, condition_json, enabled, created_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET name = excluded.name, events_json = excluded.events_json,
       condition_json = excluded.condition_json, enabled = excluded.enabled,
       updated_at = excluded.updated_at`,
      id,
      context.teamId,
      policy.name,
      JSON.stringify(policy.events),
      JSON.stringify(policy.condition),
      policy.enabled,
      context.userId,
      at(context, -days(50 - index * 5)),
      context.now.toISOString()
    );
    for (const channelId of policy.channelIds) {
      await context.database.run(
        `INSERT INTO notification_policy_channels (policy_id, channel_id) VALUES (?, ?)
         ON CONFLICT(policy_id, channel_id) DO NOTHING`,
        id,
        channelId
      );
    }
  }
}

async function seedDeliveries(context: SeedContext, channels: SeedNotificationIds): Promise<void> {
  const deliveries = [
    {
      key: "delivered",
      channelId: channels.emailChannelId,
      event: "incident.opened",
      payload: { title: "Application server resource pressure", impact: "major" },
      status: "delivered",
      attempts: 1,
      nextAttemptAt: at(context, -days(2)),
      error: null,
      deliveredAt: at(context, -days(2) + 4_000),
      createdAt: at(context, -days(2)),
    },
    {
      key: "failed",
      channelId: channels.webhookChannelId,
      event: "incident.updated",
      payload: { title: "Elevated payment latency", status: "identified" },
      status: "failed",
      attempts: 5,
      nextAttemptAt: at(context, -hours(4)),
      error: "Webhook returned HTTP 503",
      deliveredAt: null,
      createdAt: at(context, -hours(6)),
    },
    {
      key: "pending",
      channelId: channels.disabledChannelId,
      event: "slo.breached",
      payload: { title: "Database connectivity breached", objectiveId: "seeded" },
      status: "pending",
      attempts: 0,
      nextAttemptAt: at(context, days(30)),
      error: null,
      deliveredAt: null,
      createdAt: context.now.toISOString(),
    },
  ] as const;
  for (const delivery of deliveries) {
    await context.database.run(
      `INSERT INTO notification_deliveries
       (id, team_id, channel_id, event, payload_json, status, attempts, next_attempt_at,
        error, delivered_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET event = excluded.event, payload_json = excluded.payload_json,
       status = excluded.status, attempts = excluded.attempts,
       next_attempt_at = excluded.next_attempt_at, error = excluded.error,
       delivered_at = excluded.delivered_at, created_at = excluded.created_at`,
      seedId(context, `notification-delivery:${delivery.key}`),
      context.teamId,
      delivery.channelId,
      delivery.event,
      JSON.stringify(delivery.payload),
      delivery.status,
      delivery.attempts,
      delivery.nextAttemptAt,
      delivery.error,
      delivery.deliveredAt,
      delivery.createdAt
    );
  }
}
