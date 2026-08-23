import { appRoutes, type NotificationEvent } from "@mimorii/contracts";
import { createHash } from "node:crypto";
import { notificationOccurrenceKey } from "./notification-occurrence.js";

const defaultBodies: Record<NotificationEvent, string> = {
  "incident.opened": "An incident was opened.",
  "incident.updated": "The incident was updated.",
  "incident.resolved": "The incident was resolved.",
  "check.degraded": "The check is degraded.",
  "check.recovered": "The check returned to normal.",
  "maintenance.started": "Maintenance started.",
  "maintenance.completed": "Maintenance completed.",
  "slo.breached": "The service level objective was breached.",
  "resource.alert.triggered": "A resource alert condition was met.",
  "resource.alert.recovered": "A resource alert condition recovered.",
};

export interface PushMessage {
  title: string;
  body: string;
  severity: "warning" | "info";
  path: string;
  tag: string;
  topic: string;
}

export function notificationMessage(
  event: NotificationEvent,
  payload: Record<string, unknown>
): PushMessage {
  const title = text(payload.title, "Mimorii notification", 120);
  const body = text(payload.message, defaultBodies[event], 300);
  const severity = payload.severity === "info" ? "info" : "warning";
  const path = notificationPath(event, payload);
  const tagSource =
    notificationOccurrenceKey(event, payload) ?? `${event}:${text(payload.dedupeKey, title, 200)}`;
  const tagHash = createHash("sha256").update(tagSource).digest();
  return {
    title,
    body,
    severity,
    path,
    tag: tagHash.toString("hex").slice(0, 32),
    topic: tagHash.toString("base64url").slice(0, 32),
  };
}

function notificationPath(event: NotificationEvent, payload: Record<string, unknown>): string {
  if (typeof payload.path === "string" && /^\/app(?:\/|$)/.test(payload.path)) {
    return payload.path.slice(0, 500);
  }
  if (
    (event === "check.degraded" ||
      event === "check.recovered" ||
      event === "resource.alert.triggered" ||
      event === "resource.alert.recovered") &&
    typeof payload.resourceId === "string"
  ) {
    return appRoutes.resource(payload.resourceId);
  }
  if (event === "maintenance.started" || event === "maintenance.completed") {
    return appRoutes.maintenance;
  }
  if (event === "slo.breached") return appRoutes.serviceGoals;
  if (event.startsWith("incident.")) return appRoutes.incidents;
  return appRoutes.overview;
}

function text(value: unknown, fallback: string, maximum: number): string {
  return (typeof value === "string" && value.trim() ? value.trim() : fallback).slice(0, maximum);
}
