import { BadRequestException, NotFoundException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { PushEndpointsService, type NotificationEndpointRow } from "./push-endpoints.service.js";

const row: NotificationEndpointRow = {
  id: "endpoint-1",
  user_id: "user-1",
  platform: "android",
  endpoint_hash: "hash",
  configuration_json: "encrypted",
  status: "active",
  last_seen_at: "2026-08-21T00:00:00.000Z",
  last_error: null,
  created_at: "2026-08-21T00:00:00.000Z",
};

describe("push endpoint ownership", () => {
  it("validates and registers a browser subscription to the authenticated user", async () => {
    const webRow = { ...row, platform: "web" as const };
    const database = {
      get: vi
        .fn()
        .mockResolvedValueOnce({ id: "user-1" })
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce({ count: 0 })
        .mockResolvedValueOnce(webRow),
      run: vi.fn().mockResolvedValue({ changes: 1 }),
      transaction: vi.fn(async (action: () => Promise<unknown>) => action()),
    };
    const targets = { resolveStrictPublicHost: vi.fn().mockResolvedValue([]) };
    const service = createService(database, { record: vi.fn() }, targets, {
      available: () => true,
      publicKey: () => "vapid-public-key",
    });

    const endpoint = await service.registerWeb("user-1", {
      deviceKey: "3bc960fd-d878-42e4-8210-01ce6e21fd88",
      subscription: {
        endpoint: "https://push.example.test/subscription",
        keys: {
          p256dh: Buffer.alloc(65, 1).toString("base64url"),
          auth: Buffer.alloc(16, 2).toString("base64url"),
        },
      },
    });

    expect(endpoint).toMatchObject({ id: row.id, platform: "web", status: "active" });
    expect(targets.resolveStrictPublicHost).toHaveBeenCalledWith("push.example.test");
  });

  it("registers an Android installation directly to the authenticated user", async () => {
    const database = {
      get: vi
        .fn()
        .mockResolvedValueOnce({ id: "user-1" })
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce({ count: 0 })
        .mockResolvedValueOnce(row),
      run: vi.fn().mockResolvedValue({ changes: 1 }),
      transaction: vi.fn(async (action: () => Promise<unknown>) => action()),
    };
    const audit = { record: vi.fn().mockResolvedValue(undefined) };
    const service = createService(database, audit);

    const endpoint = await service.registerAndroid("user-1", {
      deviceKey: "3bc960fd-d878-42e4-8210-01ce6e21fd88",
      installationId: "firebase_installation-1",
    });

    expect(endpoint).toMatchObject({ id: row.id, platform: "android", status: "active" });
    const insert = database.get.mock.calls.find(([sql]) => String(sql).includes("INSERT INTO"))!;
    expect(insert[2]).toBe("user-1");
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-1",
        action: "notification_endpoint.registered",
        subjectId: row.id,
      })
    );
  });

  it("replaces a device endpoint when the device changes accounts", async () => {
    const replacement = { ...row, id: "endpoint-2", user_id: "user-2" };
    const database = {
      get: vi
        .fn()
        .mockResolvedValueOnce({ id: "user-2" })
        .mockResolvedValueOnce({
          id: row.id,
          user_id: "user-1",
          endpoint_hash: "old-hash",
          status: "active",
        })
        .mockResolvedValueOnce({ count: 0 })
        .mockResolvedValueOnce(replacement),
      run: vi.fn().mockResolvedValue({ changes: 1 }),
      transaction: vi.fn(async (action: () => Promise<unknown>) => action()),
    };
    const service = createService(database, { record: vi.fn() });

    const endpoint = await service.registerAndroid("user-2", {
      deviceKey: "3bc960fd-d878-42e4-8210-01ce6e21fd88",
      installationId: "firebase_installation-2",
    });

    expect(endpoint.id).toBe(replacement.id);
    expect(database.run).toHaveBeenCalledWith(
      "DELETE FROM notification_endpoints WHERE id = ?",
      row.id
    );
  });

  it("rejects malformed Firebase installation identifiers", async () => {
    const service = createService({}, {});

    await expect(
      service.registerAndroid("user-1", {
        deviceKey: "3bc960fd-d878-42e4-8210-01ce6e21fd88",
        installationId: "invalid installation",
      })
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("only removes an endpoint owned by the authenticated user", async () => {
    const database = { run: vi.fn().mockResolvedValue({ changes: 0 }) };
    const service = createService(database, {});

    await expect(service.remove("user-2", row.id)).rejects.toBeInstanceOf(NotFoundException);
    expect(database.run).toHaveBeenCalledWith(
      expect.stringContaining("user_id = ?"),
      row.id,
      "user-2"
    );
  });
});

function createService(
  database: object,
  audit: object,
  targets: object = {},
  webPush: object = { available: () => false, publicKey: () => null }
): PushEndpointsService {
  return new PushEndpointsService(
    database as never,
    audit as never,
    targets as never,
    webPush as never,
    { available: () => true } as never
  );
}
