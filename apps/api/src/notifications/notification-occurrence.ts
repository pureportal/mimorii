import type { NotificationEvent } from "@mimorii/contracts";
import { createHash } from "node:crypto";

export function notificationOccurrenceKey(
  event: NotificationEvent,
  payload: Record<string, unknown>
): string | null {
  const source = occurrencePart(payload.dedupeKey);
  const occurredAt = occurrencePart(payload.occurredAt);
  if (!source || !occurredAt) return null;
  return createHash("sha256").update(`${event}\0${source}\0${occurredAt}`).digest("hex");
}

function occurrencePart(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, 500) : null;
}
