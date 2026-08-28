import type { NotificationPushCapabilities } from "@mimorii/contracts";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  api: vi.fn(),
  devicePushState: vi.fn(),
  enablePush: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
}));

vi.mock("../lib/api", () => ({ api: mocks.api }));
vi.mock("../lib/push-notifications", () => ({
  devicePushState: mocks.devicePushState,
  enablePush: mocks.enablePush,
}));
vi.mock("sonner", () => ({ toast: { success: mocks.success, error: mocks.error } }));

import { DeviceNotificationPrompt } from "./device-notification-prompt";

const webCapabilities: NotificationPushCapabilities = {
  endpoints: [],
  web: { available: true, vapidPublicKey: "AQID" },
  android: { available: false },
};

const androidCapabilities: NotificationPushCapabilities = {
  endpoints: [],
  web: { available: false, vapidPublicKey: null },
  android: { available: true },
};

describe("device notification prompt", () => {
  beforeEach(() => {
    sessionStorage.clear();
    mocks.api.mockReset().mockResolvedValue(webCapabilities);
    mocks.devicePushState.mockReset().mockResolvedValue({
      platform: "web",
      supported: true,
      available: true,
      permission: "prompt",
      registration: "missing",
      enabled: false,
    });
    mocks.enablePush.mockReset().mockResolvedValue({});
    mocks.success.mockReset();
    mocks.error.mockReset();
  });

  afterEach(cleanup);

  it("offers browser notifications once and remembers a session dismissal", async () => {
    const first = render(<DeviceNotificationPrompt />);
    fireEvent.click(await screen.findByRole("button", { name: "Not now" }));
    expect(screen.queryByText("Enable browser notifications?")).not.toBeInTheDocument();
    first.unmount();

    render(<DeviceNotificationPrompt />);
    await waitFor(() => expect(mocks.api).toHaveBeenCalledOnce());
    expect(screen.queryByText("Enable browser notifications?")).not.toBeInTheDocument();
  });

  it("enables browser notifications only after the user accepts", async () => {
    render(<DeviceNotificationPrompt />);
    fireEvent.click(await screen.findByRole("button", { name: "Enable" }));

    await waitFor(() => expect(mocks.enablePush).toHaveBeenCalledWith(webCapabilities));
    expect(mocks.success).toHaveBeenCalledWith("Notifications enabled");
    expect(screen.queryByText("Enable browser notifications?")).not.toBeInTheDocument();
  });

  it("offers Android notification registration after sign-in", async () => {
    mocks.api.mockResolvedValue(androidCapabilities);
    mocks.devicePushState.mockResolvedValue({
      platform: "android",
      supported: true,
      available: true,
      permission: "prompt",
      registration: "missing",
      enabled: false,
    });

    render(<DeviceNotificationPrompt />);
    expect(await screen.findByText("Enable notifications?")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Enable" }));

    await waitFor(() => expect(mocks.enablePush).toHaveBeenCalledWith(androidCapabilities));
  });

  it("offers to repair a granted but inactive notification registration", async () => {
    mocks.devicePushState.mockResolvedValue({
      platform: "web",
      supported: true,
      available: true,
      permission: "granted",
      registration: "missing",
      enabled: false,
    });

    render(<DeviceNotificationPrompt />);

    expect(await screen.findByRole("button", { name: "Enable" })).toBeVisible();
  });

  it.each(["denied", "granted"])(
    "does not interrupt users whose permission is %s",
    async (permission) => {
      mocks.devicePushState.mockResolvedValue({
        platform: "web",
        supported: true,
        available: true,
        permission,
        registration: permission === "granted" ? "active" : "missing",
        enabled: permission === "granted",
      });

      render(<DeviceNotificationPrompt />);
      await waitFor(() => expect(mocks.devicePushState).toHaveBeenCalled());
      expect(screen.queryByText("Enable browser notifications?")).not.toBeInTheDocument();
    }
  );
});
