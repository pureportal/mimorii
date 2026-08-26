import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { Interval } from "@nestjs/schedule";
import type {
  NotificationChannelSummary,
  NotificationChannelType,
  NotificationDeliverySummary,
  NotificationEvent,
} from "@mimorii/contracts";
import { createHmac, randomUUID } from "node:crypto";
import nodemailer from "nodemailer";
import { AuditService } from "../common/audit.service.js";
import {
  createSignedReference,
  decryptConfiguration,
  encryptConfiguration,
} from "../common/crypto.js";
import { DatabaseService } from "../database/database.service.js";
import { TeamAccessService } from "../teams/team-access.service.js";
import { NotificationPoliciesService } from "./notification-policies.service.js";
import {
  PermanentNotificationDeliveryError,
  RetryableNotificationDeliveryError,
} from "./notification-delivery.errors.js";
import { notificationOccurrenceKey } from "./notification-occurrence.js";
import { PushDeliveryService } from "./push-delivery.service.js";
import { PushEndpointsService } from "./push-endpoints.service.js";
import type {
  CreateNotificationChannelDto,
  UpdateNotificationChannelDto,
} from "./notifications.dto.js";

interface EmailConfiguration {
  recipients: string[];
}

interface WebhookConfiguration {
  url: string;
  secret: string | null;
}

interface PushConfiguration {
  userIds: string[];
}

type ChannelConfiguration = EmailConfiguration | WebhookConfiguration | PushConfiguration;

interface ChannelRow {
  id: string;
  team_id: string;
  name: string;
  type: NotificationChannelType;
  configuration_json: string;
  enabled: number;
  created_at: string;
  last_delivery_status: "pending" | "delivered" | "failed" | null;
  last_delivered_at: string | null;
}

interface DeliveryRow {
  id: string;
  team_id: string;
  channel_id: string;
  channel_name: string;
  event: NotificationEvent;
  payload_json: string;
  status: "pending" | "delivered" | "failed";
  attempts: number;
  error: string | null;
  delivered_at: string | null;
  created_at: string;
  channel_type: NotificationChannelType;
  configuration_json: string;
}

interface SubscriberDeliveryRow {
  id: string;
  subscriber_id: string;
  email: string;
  page_id: string;
  page_name: string;
  page_slug: string;
  event: NotificationEvent;
  payload_json: string;
  status: "pending" | "delivered" | "failed";
  attempts: number;
}

@Injectable()
export class NotificationsService {
  private dispatching = false;

  constructor(
    private readonly database: DatabaseService,
    private readonly access: TeamAccessService,
    private readonly audit: AuditService,
    private readonly policies: NotificationPoliciesService,
    private readonly pushDeliveries: PushDeliveryService,
    private readonly pushEndpoints: PushEndpointsService
  ) {}

  async list(userId: string, teamId: string): Promise<NotificationChannelSummary[]> {
    await this.access.require(userId, teamId, "admin");
    const rows = await this.channelRows(teamId);
    return rows.map((row) => this.mapChannel(row));
  }

  async create(
    userId: string,
    teamId: string,
    input: CreateNotificationChannelDto
  ): Promise<NotificationChannelSummary> {
    await this.access.require(userId, teamId, "admin");
    const name = input.name.trim();
    if (!name) throw new BadRequestException("Notification channel name is required");
    const count = (await this.database.get<{ count: number }>(
      "SELECT COUNT(*) AS count FROM notification_channels WHERE team_id = ?",
      teamId
    ))!.count;
    if (count >= 100) throw new BadRequestException("Notification channel limit reached");
    const id = randomUUID();
    const now = new Date().toISOString();
    await this.database.run(
      `INSERT INTO notification_channels
       (id, team_id, name, type, configuration_json, enabled, created_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      id,
      teamId,
      name,
      input.type,
      encryptConfiguration(await this.configuration(teamId, input)),
      input.enabled === false ? 0 : 1,
      userId,
      now,
      now
    );
    await this.audit.record({
      teamId,
      userId,
      action: "notification_channel.created",
      subjectType: "notification_channel",
      subjectId: id,
      metadata: { type: input.type },
    });
    return this.mapChannel(await this.requireChannel(teamId, id));
  }

  async update(
    userId: string,
    teamId: string,
    id: string,
    input: UpdateNotificationChannelDto
  ): Promise<NotificationChannelSummary> {
    await this.access.require(userId, teamId, "admin");
    const current = await this.requireChannel(teamId, id);
    const name = (input.name ?? current.name).trim();
    if (!name) throw new BadRequestException("Notification channel name is required");
    const existingConfiguration = decryptConfiguration<ChannelConfiguration>(
      current.configuration_json
    );
    const type = input.type ?? current.type;
    if (type !== current.type) {
      throw new BadRequestException("Notification channel type cannot be changed");
    }
    const configuration = await this.configuration(teamId, {
      name: input.name ?? current.name,
      type,
      emailRecipients:
        input.emailRecipients ??
        (current.type === "email"
          ? (existingConfiguration as EmailConfiguration).recipients
          : undefined),
      webhookUrl:
        input.webhookUrl ??
        (current.type === "webhook"
          ? (existingConfiguration as WebhookConfiguration).url
          : undefined),
      webhookSecret:
        input.webhookSecret === undefined
          ? current.type === "webhook"
            ? ((existingConfiguration as WebhookConfiguration).secret ?? undefined)
            : undefined
          : input.webhookSecret,
      pushUserIds:
        input.pushUserIds ??
        (current.type === "push"
          ? (existingConfiguration as PushConfiguration).userIds
          : undefined),
      enabled: input.enabled ?? Boolean(current.enabled),
    });
    await this.database.run(
      `UPDATE notification_channels SET name = ?, type = ?, configuration_json = ?,
       enabled = ?, updated_at = ? WHERE id = ? AND team_id = ?`,
      name,
      type,
      encryptConfiguration(configuration),
      (input.enabled ?? Boolean(current.enabled)) ? 1 : 0,
      new Date().toISOString(),
      id,
      teamId
    );
    await this.audit.record({
      teamId,
      userId,
      action: "notification_channel.updated",
      subjectType: "notification_channel",
      subjectId: id,
    });
    return this.mapChannel(await this.requireChannel(teamId, id));
  }

  async remove(userId: string, teamId: string, id: string): Promise<void> {
    await this.access.require(userId, teamId, "admin");
    const result = await this.database.transaction(async () => {
      const deleted = await this.database.run(
        "DELETE FROM notification_channels WHERE id = ? AND team_id = ?",
        id,
        teamId
      );
      if (deleted.changes > 0) {
        await this.database.run(
          `DELETE FROM notification_policies WHERE team_id = ? AND NOT EXISTS (
             SELECT 1 FROM notification_policy_channels npc
             WHERE npc.policy_id = notification_policies.id
           )`,
          teamId
        );
      }
      return deleted;
    });
    if (result.changes === 0) throw new NotFoundException("Notification channel not found");
    await this.audit.record({
      teamId,
      userId,
      action: "notification_channel.deleted",
      subjectType: "notification_channel",
      subjectId: id,
    });
  }

  async deliveries(
    userId: string,
    teamId: string,
    limit = 100
  ): Promise<NotificationDeliverySummary[]> {
    await this.access.require(userId, teamId, "admin");
    const rows = await this.database.all<DeliveryRow>(
      `SELECT nd.*, nc.name AS channel_name, nc.type AS channel_type,
         nc.configuration_json FROM notification_deliveries nd
         JOIN notification_channels nc ON nc.id = nd.channel_id
         WHERE nd.team_id = ? ORDER BY nd.created_at DESC LIMIT ?`,
      teamId,
      Math.min(Math.max(limit, 1), 500)
    );
    return rows.map((row) => this.mapDelivery(row));
  }

  async test(userId: string, teamId: string, id: string): Promise<NotificationDeliverySummary> {
    await this.access.require(userId, teamId, "admin");
    const channel = await this.requireChannel(teamId, id);
    const deliveryId = await this.enqueueChannel(channel, "incident.updated", {
      title: "Mimorii test notification",
      message: "This channel is configured correctly.",
      severity: "info",
      dedupeKey: `notification-test:${id}:${randomUUID()}`,
      occurredAt: new Date().toISOString(),
    });
    if (!deliveryId) throw new Error("Test notification could not be queued");
    await this.deliverById(deliveryId);
    const delivery = await this.deliveryRow(deliveryId);
    await this.audit.record({
      teamId,
      userId,
      action: "notification_channel.tested",
      subjectType: "notification_channel",
      subjectId: id,
    });
    return this.mapDelivery(delivery);
  }

  async retry(userId: string, teamId: string, id: string): Promise<NotificationDeliverySummary> {
    await this.access.require(userId, teamId, "admin");
    const previous = await this.deliveryRow(id);
    if (previous.team_id !== teamId) throw new NotFoundException("Notification delivery not found");
    if (previous.status !== "failed") {
      throw new BadRequestException("Only failed deliveries can be retried");
    }
    const nextId = randomUUID();
    const now = new Date().toISOString();
    await this.database.run(
      `INSERT INTO notification_deliveries
       (id, team_id, channel_id, event, payload_json, next_attempt_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      nextId,
      teamId,
      previous.channel_id,
      previous.event,
      previous.payload_json,
      now,
      now
    );
    if (previous.channel_type === "push") {
      const configuration = decryptConfiguration<PushConfiguration>(previous.configuration_json);
      await this.pushDeliveries.fanOut(nextId, teamId, configuration.userIds);
    }
    await this.deliverById(nextId);
    await this.audit.record({
      teamId,
      userId,
      action: "notification_delivery.retried",
      subjectType: "notification_delivery",
      subjectId: nextId,
      metadata: { previousDeliveryId: id },
    });
    return this.mapDelivery(await this.deliveryRow(nextId));
  }

  async enqueue(
    teamId: string,
    event: NotificationEvent,
    payload: Record<string, unknown>
  ): Promise<string[]> {
    const routedChannelIds = await this.policies.routedChannelIds(teamId, event, payload);
    const channels = (await this.channelRows(teamId)).filter(
      (channel) => Boolean(channel.enabled) && routedChannelIds.has(channel.id)
    );
    const deliveries = await Promise.all(
      channels.map((channel) => this.enqueueChannel(channel, event, payload))
    );
    if (event.startsWith("incident.")) await this.enqueueStatusSubscribers(event, payload);
    return deliveries.filter((id): id is string => id !== null);
  }

  @Interval(5_000)
  async dispatch(): Promise<void> {
    if (process.env.MIMORII_SCHEDULER_ENABLED === "false" || this.dispatching) return;
    this.dispatching = true;
    try {
      const rows = await this.database.all<{ id: string }>(
        `SELECT id FROM notification_deliveries
         WHERE status = 'pending' AND next_attempt_at <= ? ORDER BY created_at LIMIT 20`,
        new Date().toISOString()
      );
      await Promise.all(rows.map((row) => this.deliverById(row.id)));
      const subscriberRows = await this.database.all<{ id: string }>(
        `SELECT id FROM status_subscriber_deliveries
         WHERE status = 'pending' AND next_attempt_at <= ? ORDER BY created_at LIMIT 20`,
        new Date().toISOString()
      );
      await Promise.all(subscriberRows.map((row) => this.deliverSubscriberById(row.id)));
    } finally {
      this.dispatching = false;
    }
  }

  private channelRows(teamId: string): Promise<ChannelRow[]> {
    return this.database.all<ChannelRow>(
      `SELECT nc.*,
       (SELECT nd.status FROM notification_deliveries nd WHERE nd.channel_id = nc.id
        ORDER BY nd.created_at DESC LIMIT 1) AS last_delivery_status,
       (SELECT nd.delivered_at FROM notification_deliveries nd WHERE nd.channel_id = nc.id
        AND nd.status = 'delivered' ORDER BY nd.delivered_at DESC LIMIT 1) AS last_delivered_at
       FROM notification_channels nc WHERE nc.team_id = ? ORDER BY LOWER(nc.name)`,
      teamId
    );
  }

  private async requireChannel(teamId: string, id: string): Promise<ChannelRow> {
    const row = await this.database.get<ChannelRow>(
      `SELECT nc.*,
       (SELECT nd.status FROM notification_deliveries nd WHERE nd.channel_id = nc.id
        ORDER BY nd.created_at DESC LIMIT 1) AS last_delivery_status,
       (SELECT nd.delivered_at FROM notification_deliveries nd WHERE nd.channel_id = nc.id
        AND nd.status = 'delivered' ORDER BY nd.delivered_at DESC LIMIT 1) AS last_delivered_at
       FROM notification_channels nc WHERE nc.team_id = ? AND nc.id = ?`,
      teamId,
      id
    );
    if (!row) throw new NotFoundException("Notification channel not found");
    return row;
  }

  private async configuration(
    teamId: string,
    input: CreateNotificationChannelDto
  ): Promise<ChannelConfiguration> {
    if (input.type === "email") {
      const recipients = [
        ...new Set((input.emailRecipients ?? []).map((email) => email.toLowerCase())),
      ];
      if (recipients.length === 0) throw new BadRequestException("Add at least one recipient");
      return { recipients };
    }
    if (input.type === "webhook") {
      if (!input.webhookUrl) throw new BadRequestException("Webhook URL is required");
      const url = new URL(input.webhookUrl);
      if (!new Set(["http:", "https:"]).has(url.protocol) || url.username || url.password) {
        throw new BadRequestException("Webhook URL is invalid");
      }
      return { url: url.toString(), secret: input.webhookSecret?.trim() || null };
    }
    if (!this.pushEndpoints.deliveryAvailable()) {
      throw new BadRequestException("Push notifications are not configured");
    }
    const userIds = [...new Set(input.pushUserIds ?? [])];
    if (userIds.length === 0) throw new BadRequestException("Select at least one recipient");
    const placeholders = userIds.map(() => "?").join(",");
    const count = (await this.database.get<{ count: number }>(
      `SELECT COUNT(*) AS count FROM team_members
       WHERE team_id = ? AND user_id IN (${placeholders})`,
      teamId,
      ...userIds
    ))!.count;
    if (count !== userIds.length) throw new BadRequestException("A recipient is unavailable");
    return { userIds };
  }

  private async enqueueChannel(
    channel: ChannelRow,
    event: NotificationEvent,
    payload: Record<string, unknown>
  ): Promise<string | null> {
    const id = randomUUID();
    const now = new Date().toISOString();
    const inserted = await this.database.transaction(async () => {
      const result = await this.database.run(
        `INSERT INTO notification_deliveries
         (id, team_id, channel_id, event, payload_json, occurrence_key, next_attempt_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (channel_id, event, occurrence_key)
         WHERE occurrence_key IS NOT NULL DO NOTHING`,
        id,
        channel.team_id,
        channel.id,
        event,
        JSON.stringify(payload),
        notificationOccurrenceKey(event, payload),
        now,
        now
      );
      if (result.changes === 0) return false;
      if (channel.type === "push") {
        const configuration = decryptConfiguration<PushConfiguration>(channel.configuration_json);
        await this.pushDeliveries.fanOut(id, channel.team_id, configuration.userIds);
      }
      return true;
    });
    return inserted ? id : null;
  }

  private async deliverById(id: string): Promise<void> {
    const now = new Date();
    const claim = await this.database.run(
      `UPDATE notification_deliveries SET claimed_at = ?
       WHERE id = ? AND status = 'pending'
       AND next_attempt_at <= ?
       AND (claimed_at IS NULL OR claimed_at < ?)`,
      now.toISOString(),
      id,
      now.toISOString(),
      new Date(now.getTime() - 2 * 60_000).toISOString()
    );
    if (claim.changes === 0) return;
    const row = await this.deliveryRow(id);
    const attempt = row.attempts + 1;
    try {
      const payload = JSON.parse(row.payload_json) as Record<string, unknown>;
      if (row.channel_type === "push") {
        const result = await this.pushDeliveries.deliver(id, row.event, payload);
        await this.database.run(
          `UPDATE notification_deliveries SET status = ?, attempts = ?, error = ?,
           next_attempt_at = ?, delivered_at = ?, claimed_at = NULL WHERE id = ?`,
          result.status,
          result.attempts,
          result.error,
          result.nextAttemptAt,
          result.status === "delivered" ? new Date().toISOString() : null,
          id
        );
        return;
      }
      const configuration = decryptConfiguration<ChannelConfiguration>(row.configuration_json);
      if (row.channel_type === "webhook") {
        await this.sendWebhook(row.event, payload, configuration as WebhookConfiguration);
      } else {
        await this.sendEmail(row.event, payload, configuration as EmailConfiguration);
      }
      await this.database.run(
        `UPDATE notification_deliveries SET status = 'delivered', attempts = ?, error = NULL,
         delivered_at = ?, claimed_at = NULL WHERE id = ?`,
        attempt,
        new Date().toISOString(),
        id
      );
    } catch (error) {
      const terminal = error instanceof PermanentNotificationDeliveryError || attempt >= 5;
      await this.database.run(
        `UPDATE notification_deliveries SET status = ?, attempts = ?, error = ?,
         next_attempt_at = ?, claimed_at = NULL WHERE id = ?`,
        terminal ? "failed" : "pending",
        attempt,
        error instanceof Error ? error.message.slice(0, 500) : "Delivery failed",
        retryAt(
          attempt,
          error instanceof RetryableNotificationDeliveryError ? error.retryAfterMs : null
        ),
        id
      );
    }
  }

  private async sendWebhook(
    event: NotificationEvent,
    payload: Record<string, unknown>,
    configuration: WebhookConfiguration
  ): Promise<void> {
    const timestamp = new Date().toISOString();
    const body = JSON.stringify({ event, timestamp, data: payload });
    const headers: Record<string, string> = {
      "content-type": "application/json",
      "user-agent": "Mimorii/0.1 notification",
      "x-mimorii-event": event,
      "x-mimorii-timestamp": timestamp,
    };
    if (configuration.secret) {
      headers["x-mimorii-signature"] =
        `sha256=${createHmac("sha256", configuration.secret).update(`${timestamp}.${body}`).digest("hex")}`;
    }
    const response = await fetch(configuration.url, {
      method: "POST",
      headers,
      body,
      redirect: "error",
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) {
      const message = `Webhook returned HTTP ${response.status}`;
      if (
        response.status >= 400 &&
        response.status < 500 &&
        response.status !== 408 &&
        response.status !== 429
      ) {
        throw new PermanentNotificationDeliveryError(message);
      }
      if (response.status === 429 || response.status >= 500) {
        throw new RetryableNotificationDeliveryError(
          message,
          retryAfter(response.headers.get("retry-after"))
        );
      }
      throw new Error(message);
    }
  }

  private async sendEmail(
    event: NotificationEvent,
    payload: Record<string, unknown>,
    configuration: EmailConfiguration
  ): Promise<void> {
    const title = typeof payload.title === "string" ? payload.title : "Mimorii notification";
    const message = typeof payload.message === "string" ? payload.message : "";
    await this.sendTransactionalEmail(
      configuration.recipients,
      `[Mimorii] ${title}`,
      [title, message, `Event: ${event}`].filter(Boolean).join("\n\n")
    );
  }

  emailAvailable(): boolean {
    return Boolean(process.env.MIMORII_SMTP_HOST && process.env.MIMORII_EMAIL_FROM);
  }

  async sendTransactionalEmail(
    to: string | string[],
    subject: string,
    text: string
  ): Promise<void> {
    const host = process.env.MIMORII_SMTP_HOST;
    const from = process.env.MIMORII_EMAIL_FROM;
    if (!host || !from) throw new Error("SMTP is not configured");
    const port = Number(process.env.MIMORII_SMTP_PORT ?? 587);
    const user = process.env.MIMORII_SMTP_USER;
    const password = process.env.MIMORII_SMTP_PASSWORD;
    const transporter = nodemailer.createTransport({
      host,
      port,
      secure: process.env.MIMORII_SMTP_SECURE === "true",
      ...(user && password ? { auth: { user, pass: password } } : {}),
    });
    await transporter.sendMail({ from, to, subject, text });
  }

  private async enqueueStatusSubscribers(
    event: NotificationEvent,
    payload: Record<string, unknown>
  ): Promise<void> {
    if (!Array.isArray(payload.resourceIds) || payload.resourceIds.length === 0) return;
    const resourceIds = payload.resourceIds.filter(
      (value): value is string => typeof value === "string"
    );
    if (resourceIds.length === 0) return;
    const placeholders = resourceIds.map(() => "?").join(",");
    const subscribers = await this.database.all<{ id: string }>(
      `SELECT DISTINCT ss.id FROM status_subscribers ss
       JOIN status_page_resources spr ON spr.status_page_id = ss.status_page_id
       JOIN status_pages sp ON sp.id = ss.status_page_id
       WHERE spr.resource_id IN (${placeholders}) AND sp.published = 1
       AND ss.verified_at IS NOT NULL`,
      ...resourceIds
    );
    const now = new Date().toISOString();
    const occurrenceKey = notificationOccurrenceKey(event, payload);
    for (const subscriber of subscribers) {
      await this.database.run(
        `INSERT INTO status_subscriber_deliveries
         (id, subscriber_id, event, payload_json, occurrence_key, next_attempt_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (subscriber_id, event, occurrence_key)
         WHERE occurrence_key IS NOT NULL DO NOTHING`,
        randomUUID(),
        subscriber.id,
        event,
        JSON.stringify(payload),
        occurrenceKey,
        now,
        now
      );
    }
  }

  private async deliverSubscriberById(id: string): Promise<void> {
    const row = await this.database.get<SubscriberDeliveryRow>(
      `SELECT sd.*, ss.email, sp.id AS page_id, sp.name AS page_name, sp.slug AS page_slug
       FROM status_subscriber_deliveries sd
       JOIN status_subscribers ss ON ss.id = sd.subscriber_id
       JOIN status_pages sp ON sp.id = ss.status_page_id
       WHERE sd.id = ?`,
      id
    );
    if (!row || row.status !== "pending") return;
    const attempt = row.attempts + 1;
    try {
      const payload = JSON.parse(row.payload_json) as Record<string, unknown>;
      const title = typeof payload.title === "string" ? payload.title : "Status update";
      const message = typeof payload.message === "string" ? payload.message : "";
      const baseUrl = (process.env.MIMORII_PUBLIC_URL ?? "http://localhost:4310").replace(
        /\/$/,
        ""
      );
      const unsubscribe = createSignedReference("status-unsubscribe", row.subscriber_id);
      await this.sendTransactionalEmail(
        row.email,
        `[${row.page_name}] ${title}`,
        [
          title,
          message,
          `${baseUrl}/status/${row.page_id}/${row.page_slug}`,
          `Unsubscribe: ${baseUrl}/status/${row.page_id}/${row.page_slug}?unsubscribe=${encodeURIComponent(unsubscribe)}`,
        ]
          .filter(Boolean)
          .join("\n\n")
      );
      await this.database.run(
        `UPDATE status_subscriber_deliveries SET status = 'delivered', attempts = ?,
         delivered_at = ?, error = NULL WHERE id = ?`,
        attempt,
        new Date().toISOString(),
        id
      );
    } catch (error) {
      const terminal = attempt >= 5;
      await this.database.run(
        `UPDATE status_subscriber_deliveries SET status = ?, attempts = ?, error = ?,
         next_attempt_at = ? WHERE id = ?`,
        terminal ? "failed" : "pending",
        attempt,
        error instanceof Error ? error.message.slice(0, 500) : "Delivery failed",
        new Date(Date.now() + 2 ** Math.min(attempt, 4) * 60_000).toISOString(),
        id
      );
    }
  }

  private async deliveryRow(id: string): Promise<DeliveryRow> {
    const row = await this.database.get<DeliveryRow>(
      `SELECT nd.*, nc.name AS channel_name, nc.type AS channel_type, nc.configuration_json
       FROM notification_deliveries nd JOIN notification_channels nc ON nc.id = nd.channel_id
       WHERE nd.id = ?`,
      id
    );
    if (!row) throw new NotFoundException("Notification delivery not found");
    return row;
  }

  private mapChannel(row: ChannelRow): NotificationChannelSummary {
    const configuration = decryptConfiguration<ChannelConfiguration>(row.configuration_json);
    const target =
      row.type === "email"
        ? (configuration as EmailConfiguration).recipients.join(", ")
        : row.type === "webhook"
          ? this.safeWebhookTarget((configuration as WebhookConfiguration).url)
          : `${(configuration as PushConfiguration).userIds.length} ${(configuration as PushConfiguration).userIds.length === 1 ? "member" : "members"}`;
    return {
      id: row.id,
      teamId: row.team_id,
      name: row.name,
      type: row.type,
      target,
      recipientUserIds: row.type === "push" ? (configuration as PushConfiguration).userIds : [],
      enabled: Boolean(row.enabled),
      lastDeliveryStatus: row.last_delivery_status,
      lastDeliveredAt: row.last_delivered_at,
      createdAt: row.created_at,
    };
  }

  private mapDelivery(row: DeliveryRow): NotificationDeliverySummary {
    return {
      id: row.id,
      channelId: row.channel_id,
      channelName: row.channel_name,
      event: row.event,
      status: row.status,
      attempts: row.attempts,
      error: row.error,
      deliveredAt: row.delivered_at,
      createdAt: row.created_at,
    };
  }

  private safeWebhookTarget(value: string): string {
    const url = new URL(value);
    return `${url.origin}${url.pathname}`;
  }
}

function retryAt(attempt: number, retryAfterMs: number | null = null): string {
  const base = 2 ** Math.min(attempt, 4) * 60_000;
  const jitter = Math.floor(Math.random() * Math.max(Math.floor(base / 4), 1));
  return new Date(Date.now() + Math.max(base, retryAfterMs ?? 0) + jitter).toISOString();
}

function retryAfter(value: string | null): number | null {
  if (!value) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.min(seconds * 1_000, 86_400_000);
  const date = Date.parse(value);
  return Number.isNaN(date) ? null : Math.min(Math.max(date - Date.now(), 0), 86_400_000);
}
