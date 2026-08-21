import { Injectable } from "@nestjs/common";
import { applicationDefault, getApps, initializeApp, type App } from "firebase-admin/app";
import { getMessaging, type Message } from "firebase-admin/messaging";
import {
  InvalidNotificationEndpointError,
  PermanentNotificationDeliveryError,
} from "./notification-delivery.errors.js";
import type { PushMessage } from "./notification-message.js";

export interface AndroidPushConfiguration {
  installationId: string;
}

@Injectable()
export class FirebasePushProvider {
  private app: App | null = null;

  available(): boolean {
    const projectId = process.env.MIMORII_FIREBASE_PROJECT_ID?.trim() ?? "";
    return /^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(projectId);
  }

  async send(configuration: AndroidPushConfiguration, message: PushMessage): Promise<void> {
    if (!this.available()) {
      throw new PermanentNotificationDeliveryError("Android push is not configured");
    }
    try {
      await getMessaging(this.firebaseApp()).send(firebasePushMessage(configuration, message));
    } catch (error) {
      const code = firebaseCode(error);
      if (
        code === "messaging/installation-id-not-registered" ||
        code === "messaging/invalid-recipient"
      ) {
        throw new InvalidNotificationEndpointError(
          "The Android installation is no longer registered"
        );
      }
      if (
        code === "messaging/invalid-argument" ||
        code === "messaging/mismatched-credential" ||
        code === "messaging/authentication-error" ||
        code === "messaging/third-party-auth-error"
      ) {
        throw new PermanentNotificationDeliveryError(
          error instanceof Error ? error.message : "Firebase configuration is invalid"
        );
      }
      throw error;
    }
  }

  private firebaseApp(): App {
    if (this.app) return this.app;
    const name = "mimorii-notifications";
    this.app =
      getApps().find((candidate) => candidate.name === name) ??
      initializeApp(
        {
          credential: applicationDefault(),
          projectId: process.env.MIMORII_FIREBASE_PROJECT_ID!.trim(),
        },
        name
      );
    return this.app;
  }
}

export function firebasePushMessage(
  configuration: AndroidPushConfiguration,
  message: PushMessage
): Message {
  return {
    fid: configuration.installationId,
    notification: { title: message.title, body: message.body },
    data: {
      title: message.title,
      body: message.body,
      path: message.path,
      severity: message.severity,
      tag: message.tag,
    },
    android: {
      collapseKey: message.topic,
      priority: message.severity === "warning" ? "high" : "normal",
      ttl: 300_000,
      restrictedPackageName: "app.mimorii.monitor",
      notification: {
        channelId: message.severity === "warning" ? "monitoring_alerts" : "monitoring_updates",
        tag: message.tag,
      },
    },
  };
}

function firebaseCode(error: unknown): string | null {
  if (typeof error !== "object" || error === null || !("code" in error)) return null;
  return typeof error.code === "string" ? error.code : null;
}
