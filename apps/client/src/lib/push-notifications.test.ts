import type { NotificationEndpointSummary, NotificationPushCapabilities } from "@mimorii/contracts";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ api: vi.fn() }));

vi.mock("@tauri-apps/api/core", () => ({
  addPluginListener: vi.fn(),
  invoke: vi.fn(),
  isTauri: () => false,
}));

vi.mock("./api", () => ({
  api: mocks.api,
  getServerUrl: () => "https://mimorii.example.test/api",
  jsonBody: (value: unknown) => ({
    headers: { "content-type": "application/json" },
    body: JSON.stringify(value),
  }),
}));

import { enablePush, syncPushEndpoint } from "./push-notifications";

const endpoint: NotificationEndpointSummary = {
  id: "endpoint-1",
  platform: "web",
  status: "active",
  lastSeenAt: "2026-08-13T00:00:00.000Z",
  lastError: null,
  createdAt: "2026-08-13T00:00:00.000Z",
};

const capabilities: NotificationPushCapabilities = {
  endpoints: [endpoint],
  web: { available: true, vapidPublicKey: "AQID" },
  android: { available: false },
};

describe("browser push lifecycle", () => {
  beforeEach(() => {
    localStorage.clear();
    mocks.api.mockReset().mockResolvedValue(endpoint);
  });

  it("requests permission from the enable action and registers a new subscription", async () => {
    const sequence: string[] = [];
    const subscription = pushSubscription(new Uint8Array([1, 2, 3]));
    const subscribe = vi.fn(async () => {
      sequence.push("subscribe");
      return subscription;
    });
    installBrowserPush(
      "default",
      async () => {
        sequence.push("permission");
        return "granted";
      },
      null,
      subscribe
    );

    await enablePush(capabilities);

    expect(sequence).toEqual(["permission", "subscribe"]);
    expect(subscribe).toHaveBeenCalledWith({
      userVisibleOnly: true,
      applicationServerKey: new Uint8Array([1, 2, 3]),
    });
    expect(mocks.api).toHaveBeenCalledWith(
      "/notifications/endpoints/web",
      expect.objectContaining({ method: "POST" })
    );
  });

  it("replaces a subscription after the VAPID key changes", async () => {
    const unsubscribe = vi.fn().mockResolvedValue(true);
    const oldSubscription = pushSubscription(new Uint8Array([9]), unsubscribe);
    const nextSubscription = pushSubscription(new Uint8Array([1, 2, 3]));
    const subscribe = vi.fn().mockResolvedValue(nextSubscription);
    installBrowserPush("granted", vi.fn().mockResolvedValue("granted"), oldSubscription, subscribe);

    await enablePush(capabilities);

    expect(unsubscribe).toHaveBeenCalledOnce();
    expect(subscribe).toHaveBeenCalledOnce();
  });

  it("removes the server endpoint when browser permission is revoked", async () => {
    const unsubscribe = vi.fn().mockResolvedValue(true);
    const subscription = pushSubscription(new Uint8Array([1, 2, 3]), unsubscribe);
    installBrowserPush("denied", vi.fn().mockResolvedValue("denied"), subscription, vi.fn());
    localStorage.setItem("mimorii.push.endpoint:https://mimorii.example.test/api:web", endpoint.id);

    await syncPushEndpoint(capabilities);

    expect(unsubscribe).toHaveBeenCalledOnce();
    expect(mocks.api).toHaveBeenCalledWith(`/notifications/endpoints/${endpoint.id}`, {
      method: "DELETE",
    });
  });

  it("repairs a missing server registration from the current subscription", async () => {
    const subscription = pushSubscription(new Uint8Array([1, 2, 3]));
    installBrowserPush("granted", vi.fn().mockResolvedValue("granted"), subscription, vi.fn());

    await syncPushEndpoint({ ...capabilities, endpoints: [] });

    expect(mocks.api).toHaveBeenCalledWith(
      "/notifications/endpoints/web",
      expect.objectContaining({ method: "POST" })
    );
  });

  it("repairs an invalid registration after the browser rotates its subscription", async () => {
    const subscription = pushSubscription(
      new Uint8Array([1, 2, 3]),
      vi.fn().mockResolvedValue(true),
      "https://push.example.test/replacement"
    );
    installBrowserPush("granted", vi.fn().mockResolvedValue("granted"), subscription, vi.fn());
    localStorage.setItem("mimorii.push.endpoint:https://mimorii.example.test/api:web", endpoint.id);
    localStorage.setItem(
      "mimorii.push.registration:https://mimorii.example.test/api:web",
      "https://push.example.test/expired"
    );

    await syncPushEndpoint({
      ...capabilities,
      endpoints: [{ ...endpoint, status: "invalid" }],
    });

    expect(mocks.api).toHaveBeenCalledWith(
      "/notifications/endpoints/web",
      expect.objectContaining({ method: "POST" })
    );
  });
});

function installBrowserPush(
  permission: NotificationPermission,
  requestPermission: () => Promise<NotificationPermission>,
  subscription: PushSubscription | null,
  subscribe: ReturnType<typeof vi.fn>
): void {
  class BrowserNotification {
    static permission = permission;
    static requestPermission = requestPermission;
  }
  Object.defineProperty(window, "Notification", {
    configurable: true,
    value: BrowserNotification,
  });
  Object.defineProperty(window, "isSecureContext", {
    configurable: true,
    value: true,
  });
  Object.defineProperty(navigator, "serviceWorker", {
    configurable: true,
    value: {
      register: vi.fn().mockResolvedValue({
        pushManager: {
          getSubscription: vi.fn().mockResolvedValue(subscription),
          subscribe,
        },
      }),
      getRegistration: vi.fn().mockResolvedValue({
        pushManager: { getSubscription: vi.fn().mockResolvedValue(subscription) },
      }),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    },
  });
}

function pushSubscription(
  key: Uint8Array,
  unsubscribe = vi.fn().mockResolvedValue(true),
  subscriptionEndpoint = "https://push.example.test/subscription"
): PushSubscription {
  const applicationServerKey = Uint8Array.from(key).buffer;
  return {
    endpoint: subscriptionEndpoint,
    expirationTime: null,
    options: { applicationServerKey, userVisibleOnly: true },
    getKey: vi.fn(),
    toJSON: () => ({
      endpoint: subscriptionEndpoint,
      keys: { p256dh: "p256dh-key-value", auth: "authentication-key" },
    }),
    unsubscribe,
  };
}
