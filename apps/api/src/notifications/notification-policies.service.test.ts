import { describe, expect, it, vi } from "vitest";
import type { AuditService } from "../common/audit.service.js";
import type { DatabaseService } from "../database/database.service.js";
import type { TeamAccessService } from "../teams/team-access.service.js";
import { NotificationPoliciesService } from "./notification-policies.service.js";

const emptyCondition = JSON.stringify({ kind: "group", operator: "and", conditions: [] });

function policy(overrides: Record<string, unknown> = {}) {
  return {
    id: "policy-1",
    team_id: "team-1",
    name: "Existing rule",
    events_json: JSON.stringify(["incident.opened"]),
    condition_json: emptyCondition,
    all_channels: 0,
    enabled: 1,
    created_at: "2026-08-01T00:00:00.000Z",
    ...overrides,
  };
}

function service(database: { all: ReturnType<typeof vi.fn> }) {
  return new NotificationPoliciesService(
    database as unknown as DatabaseService,
    { require: vi.fn(async () => ({ role: "owner" })) } as unknown as TeamAccessService,
    { record: vi.fn(async () => undefined) } as unknown as AuditService
  );
}

describe("NotificationPoliciesService", () => {
  it("returns an existing explicit channel selection unchanged", async () => {
    const all = vi.fn(async (sql: string) =>
      sql.includes("SELECT * FROM notification_policies")
        ? [policy()]
        : [{ id: "channel-1", name: "Existing channel" }]
    );

    await expect(service({ all }).list("user-1", "team-1")).resolves.toEqual([
      {
        id: "policy-1",
        teamId: "team-1",
        name: "Existing rule",
        events: ["incident.opened"],
        condition: { kind: "group", operator: "and", conditions: [] },
        allChannels: false,
        channelIds: ["channel-1"],
        channelNames: ["Existing channel"],
        enabled: true,
        createdAt: "2026-08-01T00:00:00.000Z",
      },
    ]);
  });

  it("routes an All rule to every team channel", async () => {
    const all = vi.fn(async (sql: string) => {
      if (sql.includes("SELECT * FROM notification_policies")) {
        return [policy({ all_channels: 1 })];
      }
      if (sql.includes("SELECT id FROM notification_channels WHERE team_id")) {
        return [{ id: "channel-1" }, { id: "channel-2" }];
      }
      return [];
    });

    await expect(
      service({ all }).routedChannelIds("team-1", "incident.opened", {})
    ).resolves.toEqual(new Set(["channel-1", "channel-2"]));
  });

  it("keeps explicit rules limited to their stored channel IDs", async () => {
    const all = vi.fn(async (sql: string) => {
      if (sql.includes("SELECT * FROM notification_policies")) return [policy()];
      if (sql.includes("JOIN notification_policy_channels")) {
        return [{ id: "channel-1", name: "Existing channel" }];
      }
      return [];
    });

    await expect(
      service({ all }).routedChannelIds("team-1", "incident.opened", {})
    ).resolves.toEqual(new Set(["channel-1"]));
    expect(
      all.mock.calls.some(([sql]) =>
        String(sql).includes("SELECT id FROM notification_channels WHERE team_id")
      )
    ).toBe(false);
  });
});
