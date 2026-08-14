import { encryptConfiguration } from "../common/crypto.js";
import { describe, expect, it, vi } from "vitest";
import {
  InvalidNotificationEndpointError,
  RetryableNotificationDeliveryError,
} from "./notification-delivery.errors.js";
import { PushDeliveryService } from "./push-delivery.service.js";

const endpoint = {
  id: "endpoint-delivery-1",
  endpoint_id: "endpoint-1",
  platform: "web" as const,
  configuration_json: encryptConfiguration({
    endpoint: "https://push.example.test/subscription",
    keys: { p256dh: "p256dh-key-value", auth: "authentication-key" },
  }),
  attempts: 0,
};

const payload = {
  title: "Database is down",
  message: "The check reported an outage.",
  severity: "warning",
  dedupeKey: "check:database",
};

describe("push delivery integration boundary", () => {
  it("fans out only to recipients who remain team members", async () => {
    const database = {
      all: vi.fn().mockResolvedValue([{ id: "endpoint-1" }]),
      run: vi.fn().mockResolvedValue({ changes: 1 }),
    };
    const service = new PushDeliveryService(
      database as never,
      { invalidate: vi.fn() } as never,
      { send: vi.fn() } as never,
      { send: vi.fn() } as never
    );

    await service.fanOut("delivery-1", "team-1", ["user-1"]);

    expect(database.all).toHaveBeenCalledWith(
      expect.stringContaining("JOIN team_members"),
      "team-1",
      "user-1"
    );
    expect(database.run).toHaveBeenCalledOnce();
  });

  it("delivers a browser endpoint and reports the aggregate result", async () => {
    const database = {
      all: vi.fn().mockResolvedValue([endpoint]),
      run: vi.fn().mockResolvedValue({ changes: 1 }),
      get: vi.fn().mockResolvedValue({
        total: 1,
        pending: 0,
        delivered: 1,
        failed: 0,
        attempts: 1,
        next_attempt_at: null,
      }),
    };
    const endpoints = { invalidate: vi.fn() };
    const webPush = { send: vi.fn().mockResolvedValue(undefined) };
    const firebase = { send: vi.fn() };
    const service = new PushDeliveryService(
      database as never,
      endpoints as never,
      webPush as never,
      firebase as never
    );

    const result = await service.deliver("delivery-1", "incident.opened", payload);

    expect(result.status).toBe("delivered");
    expect(webPush.send).toHaveBeenCalledWith(
      expect.objectContaining({ endpoint: "https://push.example.test/subscription" }),
      expect.objectContaining({ title: "Database is down", severity: "warning" })
    );
    expect(database.run).toHaveBeenCalledWith(
      expect.stringContaining("status = 'delivered'"),
      1,
      expect.any(String),
      endpoint.id
    );
    expect(database.run).toHaveBeenCalledWith(
      expect.stringContaining("Recipient is no longer a team member"),
      "delivery-1"
    );
  });

  it("invalidates an expired endpoint without retrying it", async () => {
    const database = {
      all: vi.fn().mockResolvedValue([endpoint]),
      run: vi.fn().mockResolvedValue({ changes: 1 }),
      get: vi.fn().mockResolvedValue({
        total: 1,
        pending: 0,
        delivered: 0,
        failed: 1,
        attempts: 1,
        next_attempt_at: null,
      }),
    };
    const endpoints = { invalidate: vi.fn().mockResolvedValue(undefined) };
    const webPush = {
      send: vi.fn().mockRejectedValue(new InvalidNotificationEndpointError("Subscription expired")),
    };
    const service = new PushDeliveryService(
      database as never,
      endpoints as never,
      webPush as never,
      { send: vi.fn() } as never
    );

    const result = await service.deliver("delivery-1", "incident.opened", payload);

    expect(result.status).toBe("failed");
    expect(endpoints.invalidate).toHaveBeenCalledWith("endpoint-1", "Subscription expired");
    expect(database.run).toHaveBeenCalledWith(
      expect.stringContaining("SET status = ?"),
      "failed",
      1,
      "Subscription expired",
      expect.any(String),
      endpoint.id
    );
  });

  it("keeps a transient endpoint pending and respects Retry-After", async () => {
    const database = {
      all: vi.fn().mockResolvedValue([endpoint]),
      run: vi.fn().mockResolvedValue({ changes: 1 }),
      get: vi.fn().mockResolvedValue({
        total: 1,
        pending: 1,
        delivered: 0,
        failed: 0,
        attempts: 1,
        next_attempt_at: "2026-08-13T12:10:00.000Z",
      }),
    };
    const endpoints = { invalidate: vi.fn() };
    const webPush = {
      send: vi
        .fn()
        .mockRejectedValue(new RetryableNotificationDeliveryError("Rate limited", 600_000)),
    };
    const service = new PushDeliveryService(
      database as never,
      endpoints as never,
      webPush as never,
      { send: vi.fn() } as never
    );
    const before = Date.now();

    const result = await service.deliver("delivery-1", "incident.opened", payload);

    expect(result.status).toBe("pending");
    const update = database.run.mock.calls.find(([sql]) => String(sql).includes("SET status = ?"))!;
    expect(update[1]).toBe("pending");
    expect(Date.parse(update[4] as string)).toBeGreaterThanOrEqual(before + 600_000);
    expect(endpoints.invalidate).not.toHaveBeenCalled();
  });
});
