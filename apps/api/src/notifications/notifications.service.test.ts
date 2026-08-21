import { encryptConfiguration } from "../common/crypto.js";
import { describe, expect, it, vi } from "vitest";
import { NotificationsService } from "./notifications.service.js";

const channel = {
  id: "channel-1",
  team_id: "team-1",
  name: "On-call push",
  type: "push" as const,
  configuration_json: encryptConfiguration({ userIds: ["user-1"] }),
  enabled: 1,
  created_at: "2026-08-21T00:00:00.000Z",
  last_delivery_status: null,
  last_delivered_at: null,
};

describe("notification occurrence queue", () => {
  it("queues and fans out an occurrence only once", async () => {
    const database = {
      all: vi.fn().mockResolvedValue([channel]),
      run: vi.fn().mockResolvedValueOnce({ changes: 1 }).mockResolvedValueOnce({ changes: 0 }),
      transaction: vi.fn(async (action: () => Promise<unknown>) => action()),
    };
    const pushDeliveries = { fanOut: vi.fn().mockResolvedValue(undefined) };
    const service = new NotificationsService(
      database as never,
      {} as never,
      {} as never,
      { routedChannelIds: vi.fn().mockResolvedValue(new Set([channel.id])) } as never,
      pushDeliveries as never,
      {} as never
    );
    const payload = {
      title: "Server is down",
      message: "Website has stopped responding",
      dedupeKey: "check:resource-1",
      occurredAt: "2026-08-21T10:00:00.000Z",
    };

    const first = await service.enqueue("team-1", "check.degraded", payload);
    const duplicate = await service.enqueue("team-1", "check.degraded", payload);

    expect(first).toHaveLength(1);
    expect(duplicate).toEqual([]);
    expect(pushDeliveries.fanOut).toHaveBeenCalledOnce();
    expect(database.run.mock.calls[0]![0]).toContain("occurrence_key");
    expect(database.run.mock.calls[0]![6]).toMatch(/^[a-f0-9]{64}$/);
    expect(database.run.mock.calls[1]![6]).toBe(database.run.mock.calls[0]![6]);
  });
});
