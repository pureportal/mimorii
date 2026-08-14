import { Injectable } from "@nestjs/common";
import webPush, { type PushSubscription } from "web-push";
import type { LookupAddress } from "node:dns";
import { Agent } from "node:https";
import type { LookupFunction } from "node:net";
import { TargetSafetyService, UnsafeTargetException } from "../common/target-safety.service.js";
import {
  InvalidNotificationEndpointError,
  PermanentNotificationDeliveryError,
  RetryableNotificationDeliveryError,
} from "./notification-delivery.errors.js";
import type { PushMessage } from "./notification-message.js";

export interface WebPushConfiguration extends PushSubscription {}

@Injectable()
export class WebPushProvider {
  constructor(private readonly targets: TargetSafetyService) {}

  available(): boolean {
    return Boolean(this.configure());
  }

  publicKey(): string | null {
    return this.configure()?.publicKey ?? null;
  }

  async send(configuration: WebPushConfiguration, message: PushMessage): Promise<void> {
    if (!this.configure()) {
      throw new PermanentNotificationDeliveryError("Web Push is not configured");
    }
    let addresses: LookupAddress[];
    try {
      addresses = await this.targets.resolveStrictPublicHost(
        new URL(configuration.endpoint).hostname
      );
    } catch (error) {
      if (error instanceof UnsafeTargetException) {
        throw new InvalidNotificationEndpointError("The browser push endpoint is unsafe");
      }
      throw error;
    }
    const agent = new Agent({ lookup: pinnedLookup(addresses) });
    try {
      await webPush.sendNotification(
        configuration,
        JSON.stringify({
          title: message.title,
          body: message.body,
          severity: message.severity,
          path: message.path,
          tag: message.tag,
        }),
        {
          TTL: 300,
          urgency: message.severity === "warning" ? "high" : "normal",
          topic: message.topic,
          timeout: 10_000,
          agent,
        }
      );
    } catch (error) {
      const statusCode = status(error);
      if (statusCode === 404 || statusCode === 410) {
        throw new InvalidNotificationEndpointError("The browser push subscription expired");
      }
      if (
        statusCode !== null &&
        statusCode >= 400 &&
        statusCode < 500 &&
        statusCode !== 408 &&
        statusCode !== 429
      ) {
        throw new PermanentNotificationDeliveryError(`Web Push returned HTTP ${statusCode}`);
      }
      if (statusCode === 429 || (statusCode !== null && statusCode >= 500)) {
        throw new RetryableNotificationDeliveryError(
          `Web Push returned HTTP ${statusCode}`,
          retryAfter(error)
        );
      }
      throw error;
    } finally {
      agent.destroy();
    }
  }

  private configure(): { publicKey: string } | null {
    const publicKey = process.env.MIMORII_WEB_PUSH_VAPID_PUBLIC_KEY?.trim();
    const privateKey = process.env.MIMORII_WEB_PUSH_VAPID_PRIVATE_KEY?.trim();
    const subject = process.env.MIMORII_WEB_PUSH_VAPID_SUBJECT?.trim();
    if (!publicKey || !privateKey || !subject) return null;
    try {
      webPush.setVapidDetails(subject, publicKey, privateKey);
      return { publicKey };
    } catch {
      return null;
    }
  }
}

function pinnedLookup(addresses: LookupAddress[]): LookupFunction {
  return (_hostname, options, callback) => {
    const family =
      options.family === "IPv4" ? 4 : options.family === "IPv6" ? 6 : options.family || 0;
    const candidates = family
      ? addresses.filter((address) => address.family === family)
      : addresses;
    if (candidates.length === 0) {
      const error = new Error("No address matched the requested network family");
      Object.assign(error, { code: "ENOTFOUND" });
      callback(error, "", 0);
      return;
    }
    if (options.all) {
      callback(null, candidates);
      return;
    }
    callback(null, candidates[0]!.address, candidates[0]!.family);
  };
}

function status(error: unknown): number | null {
  if (typeof error !== "object" || error === null || !("statusCode" in error)) return null;
  return typeof error.statusCode === "number" ? error.statusCode : null;
}

function retryAfter(error: unknown): number | null {
  if (typeof error !== "object" || error === null || !("headers" in error)) return null;
  const headers = error.headers;
  if (typeof headers !== "object" || headers === null) return null;
  const value =
    "retry-after" in headers && typeof headers["retry-after"] === "string"
      ? headers["retry-after"]
      : null;
  if (!value) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.min(seconds * 1_000, 86_400_000);
  const date = Date.parse(value);
  return Number.isNaN(date) ? null : Math.min(Math.max(date - Date.now(), 0), 86_400_000);
}
