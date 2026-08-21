import { readFileSync } from "node:fs";
import { join } from "node:path";
import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";

const source = readFileSync(join(process.cwd(), "public", "push-sw.js"), "utf8");

describe("push service worker", () => {
  it("displays a monitoring notification with its resource destination", async () => {
    const worker = installWorker();
    const waitUntil = vi.fn();

    worker.listeners.push({
      data: {
        json: () => ({
          title: "Server is down",
          body: "Website has stopped responding",
          path: "/app/resources/resource-1",
          severity: "warning",
          tag: "incident-1",
        }),
      },
      waitUntil,
    });
    await waitUntil.mock.calls[0]![0];

    expect(worker.showNotification).toHaveBeenCalledWith("Server is down", {
      body: "Website has stopped responding",
      icon: "/mimorii-app-icon.png",
      badge: "/mimorii-app-icon.png",
      tag: "incident-1",
      data: { path: "/app/resources/resource-1" },
    });
  });

  it("opens the notification destination when no Mimorii window exists", async () => {
    const worker = installWorker();
    const waitUntil = vi.fn();
    const close = vi.fn();

    worker.listeners.notificationclick({
      notification: { close, data: { path: "/app/operations/incidents" } },
      waitUntil,
    });
    await waitUntil.mock.calls[0]![0];

    expect(close).toHaveBeenCalledOnce();
    expect(worker.openWindow).toHaveBeenCalledWith(
      "https://mimorii.example.test/app/operations/incidents"
    );
  });
});

function installWorker() {
  const listeners: Record<string, (event: never) => void> = {};
  const showNotification = vi.fn().mockResolvedValue(undefined);
  const openWindow = vi.fn().mockResolvedValue(undefined);
  const self = {
    addEventListener: (event: string, listener: (event: never) => void) => {
      listeners[event] = listener;
    },
    clients: {
      matchAll: vi.fn().mockResolvedValue([]),
      openWindow,
    },
    location: { origin: "https://mimorii.example.test" },
    registration: {
      showNotification,
      pushManager: { subscribe: vi.fn() },
    },
  };
  runInNewContext(source, { self, URL });
  return {
    listeners: listeners as {
      push: (event: unknown) => void;
      notificationclick: (event: unknown) => void;
    },
    openWindow,
    showNotification,
  };
}
