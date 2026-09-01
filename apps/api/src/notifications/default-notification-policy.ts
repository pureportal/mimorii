import { notificationEvents } from "@mimorii/contracts";
import { randomUUID } from "node:crypto";
import type { DatabaseService } from "../database/database.service.js";

export const defaultNotificationPolicyName = "Notify All Everywhere";

export async function createDefaultNotificationPolicy(
  database: DatabaseService,
  userId: string,
  teamId: string,
  createdAt: string
): Promise<void> {
  await database.run(
    `INSERT INTO notification_policies
     (id, team_id, name, events_json, condition_json, all_channels, enabled,
      created_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 1, 1, ?, ?, ?)`,
    randomUUID(),
    teamId,
    defaultNotificationPolicyName,
    JSON.stringify(notificationEvents),
    JSON.stringify({ kind: "group", operator: "and", conditions: [] }),
    userId,
    createdAt,
    createdAt
  );
}
