import { notificationEvents } from "@mimorii/contracts";
import { describe, expect, it, vi } from "vitest";
import type { DatabaseService } from "../database/database.service.js";
import {
  createDefaultNotificationPolicy,
  defaultNotificationPolicyName,
} from "./default-notification-policy.js";

describe("default notification policy", () => {
  it("creates one enabled all-event and all-channel rule", async () => {
    const run = vi.fn(async (..._parameters: unknown[]) => ({ changes: 1 }));
    const createdAt = "2026-09-01T12:00:00.000Z";

    await createDefaultNotificationPolicy(
      { run } as unknown as DatabaseService,
      "user-1",
      "team-1",
      createdAt
    );

    expect(run).toHaveBeenCalledOnce();
    const [sql, id, teamId, name, events, condition, userId, insertedAt, updatedAt] =
      run.mock.calls[0]!;
    expect(sql).toContain("all_channels, enabled");
    expect(sql).toContain("VALUES (?, ?, ?, ?, ?, 1, 1, ?, ?, ?)");
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
    expect(teamId).toBe("team-1");
    expect(name).toBe(defaultNotificationPolicyName);
    expect(JSON.parse(events as string)).toEqual(notificationEvents);
    expect(JSON.parse(condition as string)).toEqual({
      kind: "group",
      operator: "and",
      conditions: [],
    });
    expect([userId, insertedAt, updatedAt]).toEqual(["user-1", createdAt, createdAt]);
  });
});
