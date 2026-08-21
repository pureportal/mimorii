import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type {
  NotificationEndpointPlatform,
  NotificationEndpointSummary,
  NotificationPushCapabilities,
} from "@mimorii/contracts";
import { createHash, randomUUID } from "node:crypto";
import { AuditService } from "../common/audit.service.js";
import { encryptConfiguration } from "../common/crypto.js";
import { TargetSafetyService } from "../common/target-safety.service.js";
import { DatabaseService } from "../database/database.service.js";
import { FirebasePushProvider } from "./firebase-push.provider.js";
import type {
  RegisterAndroidEndpointDto,
  RegisterWebPushEndpointDto,
} from "./notifications.dto.js";
import { WebPushProvider, type WebPushConfiguration } from "./web-push.provider.js";

export interface NotificationEndpointRow {
  id: string;
  user_id: string;
  platform: NotificationEndpointPlatform;
  endpoint_hash: string;
  configuration_json: string;
  status: "active" | "invalid";
  last_seen_at: string;
  last_error: string | null;
  created_at: string;
}

@Injectable()
export class PushEndpointsService {
  constructor(
    private readonly database: DatabaseService,
    private readonly audit: AuditService,
    private readonly targets: TargetSafetyService,
    private readonly webPush: WebPushProvider,
    private readonly firebase: FirebasePushProvider
  ) {}

  deliveryAvailable(): boolean {
    return this.webPush.available() || this.firebase.available();
  }

  async capabilities(userId: string): Promise<NotificationPushCapabilities> {
    const endpoints = await this.database.all<NotificationEndpointRow>(
      "SELECT * FROM notification_endpoints WHERE user_id = ? ORDER BY created_at DESC",
      userId
    );
    return {
      endpoints: endpoints.map((endpoint) => this.map(endpoint)),
      web: {
        available: this.webPush.available(),
        vapidPublicKey: this.webPush.publicKey(),
      },
      android: { available: this.firebase.available() },
    };
  }

  async registerWeb(
    userId: string,
    input: RegisterWebPushEndpointDto
  ): Promise<NotificationEndpointSummary> {
    if (!this.webPush.available()) throw new BadRequestException("Web Push is not configured");
    const configuration = this.webConfiguration(input.subscription);
    await this.targets.resolveStrictPublicHost(new URL(configuration.endpoint).hostname);
    return this.register(userId, "web", input.deviceKey, configuration.endpoint, configuration);
  }

  async registerAndroid(
    userId: string,
    input: RegisterAndroidEndpointDto
  ): Promise<NotificationEndpointSummary> {
    if (!this.firebase.available()) {
      throw new BadRequestException("Android push is not configured");
    }
    if (!/^[A-Za-z0-9_-]+$/.test(input.installationId)) {
      throw new BadRequestException("Firebase installation ID is invalid");
    }
    return this.register(userId, "android", input.deviceKey, input.installationId, {
      installationId: input.installationId,
    });
  }

  async remove(userId: string, id: string): Promise<void> {
    const result = await this.database.run(
      "DELETE FROM notification_endpoints WHERE id = ? AND user_id = ?",
      id,
      userId
    );
    if (result.changes === 0) throw new NotFoundException("Notification endpoint not found");
    await this.audit.record({
      userId,
      action: "notification_endpoint.deleted",
      subjectType: "notification_endpoint",
      subjectId: id,
    });
  }

  async invalidate(id: string, error: string): Promise<void> {
    const now = new Date().toISOString();
    await this.database.run(
      `UPDATE notification_endpoints SET status = 'invalid', invalidated_at = ?,
       last_error = ?, updated_at = ? WHERE id = ?`,
      now,
      error.slice(0, 500),
      now,
      id
    );
  }

  private async register(
    userId: string,
    platform: NotificationEndpointPlatform,
    deviceKey: string,
    endpoint: string,
    configuration: object
  ): Promise<NotificationEndpointSummary> {
    const now = new Date().toISOString();
    const deviceKeyHash = this.hash(deviceKey);
    const endpointHash = this.hash(endpoint);
    const id = randomUUID();
    const registration = await this.database.transaction(async () => {
      await this.database.get("SELECT id FROM users WHERE id = ? FOR UPDATE", userId);
      const previous = await this.database.get<
        Pick<NotificationEndpointRow, "id" | "endpoint_hash" | "status" | "user_id">
      >(
        `SELECT id, endpoint_hash, status, user_id FROM notification_endpoints
         WHERE platform = ? AND device_key_hash = ? FOR UPDATE`,
        platform,
        deviceKeyHash
      );
      if (previous && previous.user_id !== userId) {
        await this.database.run("DELETE FROM notification_endpoints WHERE id = ?", previous.id);
      }
      await this.database.run(
        `DELETE FROM notification_endpoints
         WHERE platform = ? AND endpoint_hash = ? AND device_key_hash != ?`,
        platform,
        endpointHash,
        deviceKeyHash
      );
      if (!previous || previous.user_id !== userId) {
        const count = (await this.database.get<{ count: number }>(
          "SELECT COUNT(*) AS count FROM notification_endpoints WHERE user_id = ?",
          userId
        ))!.count;
        if (count >= 20) throw new BadRequestException("Notification endpoint limit reached");
      }
      const row = await this.database.get<NotificationEndpointRow>(
        `INSERT INTO notification_endpoints
         (id, user_id, platform, device_key_hash, endpoint_hash, configuration_json, status,
          last_seen_at, invalidated_at, last_error, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, 'active', ?, NULL, NULL, ?, ?)
         ON CONFLICT (platform, device_key_hash) DO UPDATE SET
           user_id = EXCLUDED.user_id,
           endpoint_hash = EXCLUDED.endpoint_hash,
           configuration_json = EXCLUDED.configuration_json,
           status = 'active',
           last_seen_at = EXCLUDED.last_seen_at,
           invalidated_at = NULL,
           last_error = NULL,
           updated_at = EXCLUDED.updated_at
         RETURNING *`,
        id,
        userId,
        platform,
        deviceKeyHash,
        endpointHash,
        encryptConfiguration(configuration),
        now,
        now,
        now
      );
      return {
        row,
        changed:
          !previous ||
          previous.user_id !== userId ||
          previous.endpoint_hash !== endpointHash ||
          previous.status !== "active",
      };
    });
    if (!registration.row) throw new Error("Notification endpoint registration failed");
    if (registration.changed) {
      await this.audit.record({
        userId,
        action: "notification_endpoint.registered",
        subjectType: "notification_endpoint",
        subjectId: registration.row.id,
        metadata: { platform },
      });
    }
    return this.map(registration.row);
  }

  private webConfiguration(value: Record<string, unknown>): WebPushConfiguration {
    const endpoint = value.endpoint;
    const keys = value.keys;
    if (
      typeof endpoint !== "string" ||
      endpoint.length > 2_048 ||
      !this.secureUrl(endpoint) ||
      typeof keys !== "object" ||
      keys === null ||
      !("p256dh" in keys) ||
      !("auth" in keys) ||
      typeof keys.p256dh !== "string" ||
      typeof keys.auth !== "string" ||
      !this.pushKey(keys.p256dh, 65) ||
      !this.pushKey(keys.auth, 16)
    ) {
      throw new BadRequestException("Browser push subscription is invalid");
    }
    return {
      endpoint,
      keys: { p256dh: keys.p256dh, auth: keys.auth },
    };
  }

  private secureUrl(value: string): boolean {
    try {
      const url = new URL(value);
      return url.protocol === "https:" && !url.username && !url.password;
    } catch {
      return false;
    }
  }

  private pushKey(value: string, expectedBytes: number): boolean {
    return (
      value.length <= 512 &&
      /^[A-Za-z0-9_-]+={0,2}$/.test(value) &&
      Buffer.from(value, "base64url").length === expectedBytes
    );
  }

  private hash(value: string): string {
    return createHash("sha256").update(value).digest("hex");
  }

  private map(row: NotificationEndpointRow): NotificationEndpointSummary {
    return {
      id: row.id,
      platform: row.platform,
      status: row.status,
      lastSeenAt: row.last_seen_at,
      lastError: row.last_error,
      createdAt: row.created_at,
    };
  }
}
