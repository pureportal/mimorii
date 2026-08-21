import type { NotificationEndpointSummary, NotificationPushCapabilities } from "@mimorii/contracts";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  api: vi.fn(),
  invoke: vi.fn(),
  addPluginListener: vi.fn(),
}));

vi.mock("@tauri-apps/api/core", () => ({
  addPluginListener: mocks.addPluginListener,
  invoke: mocks.invoke,
  isTauri: () => true,
}));

vi.mock("./api", () => ({
  api: mocks.api,
  getServerUrl: () => "https://mimorii.example.test/api",
  jsonBody: (value: unknown) => ({ body: JSON.stringify(value) }),
}));

import { disablePush, enablePush, listenForPushRegistrationChanges } from "./push-notifications";

const endpoint: NotificationEndpointSummary = {
  id: "endpoint-android",
  platform: "android",
  status: "active",
  lastSeenAt: "2026-08-21T00:00:00.000Z",
  lastError: null,
  createdAt: "2026-08-21T00:00:00.000Z",
};

const capabilities: NotificationPushCapabilities = {
  endpoints: [],
  web: { available: false, vapidPublicKey: null },
  android: { available: true },
};

describe("Android push lifecycle", () => {
  beforeEach(() => {
    localStorage.clear();
    mocks.api.mockReset().mockResolvedValue(endpoint);
    mocks.invoke.mockReset();
    mocks.addPluginListener.mockReset();
  });

  it("requests permission, registers Firebase, and associates the installation with the user", async () => {
    mocks.invoke.mockImplementation((command: string) => {
      if (command === "plugin:push|requestPermissions") {
        return Promise.resolve({ postNotification: "granted" });
      }
      if (command === "plugin:push|enable") return Promise.resolve(nativeState("fid-current"));
      return Promise.resolve();
    });

    await enablePush(capabilities);

    expect(mocks.invoke.mock.calls.map(([command]) => command)).toEqual([
      "plugin:push|mark_permission_requested",
      "plugin:push|requestPermissions",
      "plugin:push|enable",
    ]);
    expect(mocks.api).toHaveBeenCalledWith("/notifications/endpoints/android", {
      method: "POST",
      body: JSON.stringify({ deviceKey: "device-1", installationId: "fid-current" }),
    });
  });

  it("registers a refreshed Firebase installation immediately", async () => {
    let registrationChanged: (() => void) | undefined;
    const unregister = vi.fn().mockResolvedValue(undefined);
    mocks.addPluginListener.mockImplementation(
      async (_plugin: string, _event: string, callback: () => void) => {
        registrationChanged = callback;
        return { unregister };
      }
    );
    mocks.invoke.mockImplementation((command: string) => {
      if (command === "plugin:push|status") return Promise.resolve(nativeState("fid-refreshed"));
      return Promise.resolve();
    });
    mocks.api.mockImplementation((path: string) => {
      if (path === "/notifications/push") return Promise.resolve(capabilities);
      return Promise.resolve(endpoint);
    });

    const stop = await listenForPushRegistrationChanges();
    registrationChanged!();
    await vi.waitFor(() => {
      expect(mocks.api).toHaveBeenCalledWith(
        "/notifications/endpoints/android",
        expect.objectContaining({ method: "POST" })
      );
    });
    stop();

    expect(mocks.addPluginListener).toHaveBeenCalledWith(
      "push",
      "registrationChanged",
      expect.any(Function)
    );
    expect(unregister).toHaveBeenCalledOnce();
  });

  it("removes the user endpoint and unregisters Firebase when disabled", async () => {
    localStorage.setItem(
      "mimorii.push.endpoint:https://mimorii.example.test/api:android",
      endpoint.id
    );
    localStorage.setItem(
      "mimorii.push.registration:https://mimorii.example.test/api:android",
      "fid-current"
    );
    mocks.invoke.mockResolvedValue(nativeState(null, false));

    await disablePush();

    expect(mocks.api).toHaveBeenCalledWith(`/notifications/endpoints/${endpoint.id}`, {
      method: "DELETE",
    });
    expect(mocks.invoke).toHaveBeenCalledWith("plugin:push|disable");
    expect(
      localStorage.getItem("mimorii.push.endpoint:https://mimorii.example.test/api:android")
    ).toBeNull();
  });
});

function nativeState(installationId: string | null, enabled = true) {
  return {
    configured: true,
    deviceKey: "device-1",
    installationId,
    permission: "granted",
    enabled,
  };
}
