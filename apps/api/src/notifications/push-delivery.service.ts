import { Injectable } from "@nestjs/common";
import type { NotificationEndpointPlatform, NotificationEvent } from "@mimorii/contracts";
import { randomUUID } from "node:crypto";
import { decryptConfiguration } from "../common/crypto.js";
import { DatabaseService } from "../database/database.service.js";
import {
  InvalidNotificationEndpointError,
  PermanentNotificationDeliveryError,
  RetryableNotificationDeliveryError,
} from "./notification-delivery.errors.js";
import { notificationMessage } from "./notification-message.js";
import { FirebasePushProvider, type AndroidPushConfiguration } from "./firebase-push.provider.js";
import { PushEndpointsService } from "./push-endpoints.service.js";
import { WebPushProvider, type WebPushConfiguration } from "./web-push.provider.js";

interface EndpointDeliveryRow {
  id: string;
  endpoint_id: string;
  platform: NotificationEndpointPlatform;
  configuration_json: string;
  attempts: number;
}

export interface PushDeliveryResult {
  status: "pending" | "delivered" | "failed";
  attempts: number;
  error: string | null;
  nextAttemptAt: string;
}

@Injectable()
export class PushDeliveryService {
  constructor(
    private readonly database: DatabaseService,
    private readonly endpoints: PushEndpointsService,
    private readonly webPush: WebPushProvider,
    private readonly firebase: FirebasePushProvider
  ) {}

  async fanOut(deliveryId: string, teamId: string, userIds: string[]): Promise<void> {
    const ids = [...new Set(userIds)];
    if (ids.length === 0) return;
    const placeholders = ids.map(() => "?").join(",");
    const endpoints = await this.database.all<{ id: string }>(
      `SELECT ne.id FROM notification_endpoints ne
       JOIN team_members tm ON tm.user_id = ne.user_id AND tm.team_id = ?
       WHERE ne.status = 'active' AND ne.user_id IN (${placeholders})`,
      teamId,
      ...ids
    );
    const now = new Date().toISOString();
    if (endpoints.length === 0) return;
    const values = endpoints.map(() => "(?, ?, ?, ?, ?)").join(", ");
    await this.database.run(
      `INSERT INTO notification_endpoint_deliveries
       (id, delivery_id, endpoint_id, next_attempt_at, created_at)
       VALUES ${values}
       ON CONFLICT (delivery_id, endpoint_id) DO NOTHING`,
      ...endpoints.flatMap((endpoint) => [randomUUID(), deliveryId, endpoint.id, now, now])
    );
  }

  async deliver(
    deliveryId: string,
    event: NotificationEvent,
    payload: Record<string, unknown>
  ): Promise<PushDeliveryResult> {
    await this.database.run(
      `UPDATE notification_endpoint_deliveries ned
       SET status = 'failed', error = 'Recipient is no longer a team member'
       FROM notification_deliveries nd, notification_endpoints ne
       WHERE ned.delivery_id = ? AND nd.id = ned.delivery_id AND ne.id = ned.endpoint_id
       AND ned.status = 'pending' AND NOT EXISTS (
         SELECT 1 FROM team_members tm
         WHERE tm.team_id = nd.team_id AND tm.user_id = ne.user_id
       )`,
      deliveryId
    );
    const rows = await this.database.all<EndpointDeliveryRow>(
      `SELECT ned.*, ne.platform, ne.configuration_json
       FROM notification_endpoint_deliveries ned
       JOIN notification_endpoints ne ON ne.id = ned.endpoint_id
       WHERE ned.delivery_id = ? AND ned.status = 'pending' AND ned.next_attempt_at <= ?`,
      deliveryId,
      new Date().toISOString()
    );
    let nextIndex = 0;
    const deliverNext = async (): Promise<void> => {
      const row = rows[nextIndex++];
      if (!row) return;
      await this.deliverEndpoint(row, event, payload);
      return deliverNext();
    };
    await Promise.all(Array.from({ length: Math.min(rows.length, 20) }, () => deliverNext()));
    return this.result(deliveryId);
  }

  private async deliverEndpoint(
    row: EndpointDeliveryRow,
    event: NotificationEvent,
    payload: Record<string, unknown>
  ): Promise<void> {
    const attempt = row.attempts + 1;
    try {
      const message = notificationMessage(event, payload);
      if (row.platform === "web") {
        await this.webPush.send(
          decryptConfiguration<WebPushConfiguration>(row.configuration_json),
          message
        );
      } else {
        await this.firebase.send(
          decryptConfiguration<AndroidPushConfiguration>(row.configuration_json),
          message
        );
      }
      await this.database.run(
        `UPDATE notification_endpoint_deliveries
         SET status = 'delivered', attempts = ?, error = NULL, delivered_at = ? WHERE id = ?`,
        attempt,
        new Date().toISOString(),
        row.id
      );
    } catch (error) {
      const message = error instanceof Error ? error.message.slice(0, 500) : "Delivery failed";
      const invalid = error instanceof InvalidNotificationEndpointError;
      const terminal =
        invalid || error instanceof PermanentNotificationDeliveryError || attempt >= 5;
      if (invalid) await this.endpoints.invalidate(row.endpoint_id, message);
      await this.database.run(
        `UPDATE notification_endpoint_deliveries
         SET status = ?, attempts = ?, error = ?, next_attempt_at = ? WHERE id = ?`,
        terminal ? "failed" : "pending",
        attempt,
        message,
        retryAt(
          attempt,
          error instanceof RetryableNotificationDeliveryError ? error.retryAfterMs : null
        ),
        row.id
      );
    }
  }

  private async result(deliveryId: string): Promise<PushDeliveryResult> {
    const summary = await this.database.get<{
      total: number;
      pending: number;
      delivered: number;
      failed: number;
      attempts: number;
      next_attempt_at: string | null;
      errors: string | null;
    }>(
      `SELECT COUNT(*) AS total,
       COUNT(*) FILTER (WHERE status = 'pending') AS pending,
       COUNT(*) FILTER (WHERE status = 'delivered') AS delivered,
       COUNT(*) FILTER (WHERE status = 'failed') AS failed,
       COALESCE(MAX(attempts), 0) AS attempts,
       MIN(next_attempt_at) FILTER (WHERE status = 'pending') AS next_attempt_at,
       LEFT(STRING_AGG(DISTINCT error, '; ') FILTER (WHERE status = 'failed'), 500) AS errors
       FROM notification_endpoint_deliveries WHERE delivery_id = ?`,
      deliveryId
    );
    if (!summary || summary.total === 0) {
      return {
        status: "failed",
        attempts: 1,
        error: "No active push endpoints",
        nextAttemptAt: new Date().toISOString(),
      };
    }
    if (summary.pending > 0) {
      return {
        status: "pending",
        attempts: summary.attempts,
        error: null,
        nextAttemptAt: summary.next_attempt_at ?? retryAt(summary.attempts),
      };
    }
    if (summary.delivered > 0) {
      return {
        status: "delivered",
        attempts: summary.attempts,
        error:
          summary.failed > 0
            ? (summary.errors ?? `${summary.failed} push endpoint delivery failed`)
            : null,
        nextAttemptAt: new Date().toISOString(),
      };
    }
    return {
      status: "failed",
      attempts: summary.attempts,
      error: summary.errors ?? `${summary.failed} push endpoint delivery failed`,
      nextAttemptAt: new Date().toISOString(),
    };
  }
}

function retryAt(attempt: number, retryAfterMs: number | null = null): string {
  const base = 2 ** Math.min(attempt, 4) * 60_000;
  const jitter = Math.floor(Math.random() * Math.max(Math.floor(base / 4), 1));
  return new Date(Date.now() + Math.max(base, retryAfterMs ?? 0) + jitter).toISOString();
}
