import type { NotificationEndpointSummary, NotificationPushCapabilities } from "@mimorii/contracts";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { api, getServerUrl, jsonBody } from "./api";

const WEB_DEVICE_KEY = "mimorii.push.web-device";

interface NativePushState {
  configured: boolean;
  deviceKey: string;
  installationId: string | null;
  permission: "granted" | "denied" | "prompt" | "unavailable";
  enabled: boolean;
  launchPath?: string | null;
}

export interface DevicePushState {
  platform: "web" | "android" | null;
  supported: boolean;
  available: boolean;
  permission: "granted" | "denied" | "prompt" | "unavailable";
  registration: "active" | "missing" | "invalid";
  enabled: boolean;
}

export async function devicePushState(
  capabilities: NotificationPushCapabilities
): Promise<DevicePushState> {
  if (isTauri()) {
    try {
      const state = await nativePushState();
      const registration = endpointRegistration(capabilities, "android");
      return {
        platform: "android",
        supported: state.configured,
        available: state.configured && capabilities.android.available,
        permission: state.permission,
        registration: registration === "active" && !state.installationId ? "invalid" : registration,
        enabled:
          state.permission === "granted" &&
          state.enabled &&
          Boolean(state.installationId) &&
          registration === "active",
      };
    } catch {
      return {
        platform: null,
        supported: false,
        available: false,
        permission: "unavailable",
        registration: "missing",
        enabled: false,
      };
    }
  }
  const supported =
    window.isSecureContext &&
    "Notification" in window &&
    "serviceWorker" in navigator &&
    "PushManager" in window;
  if (!supported) {
    return {
      platform: "web",
      supported: false,
      available: false,
      permission: "unavailable",
      registration: "missing",
      enabled: false,
    };
  }
  const subscription = await existingWebSubscription();
  const registration = endpointRegistration(capabilities, "web");
  const subscriptionCurrent = Boolean(
    subscription &&
    capabilities.web.vapidPublicKey &&
    subscriptionUsesKey(subscription, capabilities.web.vapidPublicKey)
  );
  const effectiveRegistration =
    registration === "active" && !subscriptionCurrent ? "invalid" : registration;
  return {
    platform: "web",
    supported: true,
    available: capabilities.web.available,
    permission: Notification.permission === "default" ? "prompt" : Notification.permission,
    registration: effectiveRegistration,
    enabled:
      Notification.permission === "granted" &&
      subscriptionCurrent &&
      effectiveRegistration === "active",
  };
}

export async function enablePush(
  teamId: string,
  capabilities: NotificationPushCapabilities
): Promise<NotificationEndpointSummary> {
  if (isTauri()) {
    if (!capabilities.android.available) throw new Error("Android push is not configured");
    if (endpointRegistration(capabilities, "android") === "invalid") {
      await invoke("plugin:push|disable");
    }
    await invoke("plugin:push|mark_permission_requested");
    const permissions = await invoke<{ postNotification: string }>(
      "plugin:push|requestPermissions",
      { permissions: ["postNotification"] }
    );
    if (permissions.postNotification !== "granted") {
      throw new Error("Notification permission was denied");
    }
    const state = await invoke<NativePushState>("plugin:push|enable");
    if (state.permission !== "granted") throw new Error("Notification permission was denied");
    if (!state.installationId) throw new Error("Firebase registration is unavailable");
    return registerAndroid(teamId, state);
  }
  if (!capabilities.web.available || !capabilities.web.vapidPublicKey) {
    throw new Error("Web Push is not configured");
  }
  if (!window.isSecureContext || !("Notification" in window)) {
    throw new Error("Browser notifications are unavailable");
  }
  const permission = await Notification.requestPermission();
  if (permission !== "granted") throw new Error("Notification permission was denied");
  const registration = await navigator.serviceWorker.register("/push-sw.js", { scope: "/" });
  let existing = await registration.pushManager.getSubscription();
  if (
    existing &&
    (endpointRegistration(capabilities, "web") === "invalid" ||
      !subscriptionUsesKey(existing, capabilities.web.vapidPublicKey))
  ) {
    await existing.unsubscribe();
    existing = null;
  }
  const subscription =
    existing ??
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: decodeVapidKey(capabilities.web.vapidPublicKey),
    }));
  return registerWeb(teamId, subscription);
}

export async function syncPushEndpoint(
  teamId: string,
  capabilities?: NotificationPushCapabilities
): Promise<void> {
  const current =
    capabilities ??
    (await api<NotificationPushCapabilities>(`/teams/${teamId}/notifications/push`));
  if (isTauri()) {
    if (!current.android.available) return;
    try {
      const state = await nativePushState();
      if (state.permission === "denied" && storedEndpointId("android")) {
        await disablePush(teamId);
        return;
      }
      if (endpointRegistration(current, "android") === "invalid") return;
      if (
        state.enabled &&
        storedEndpointId("android") &&
        state.permission === "granted" &&
        state.installationId
      ) {
        await registerAndroid(teamId, state);
      }
    } catch {
      return;
    }
    return;
  }
  if (!current.web.available || !("Notification" in window) || !("serviceWorker" in navigator)) {
    return;
  }
  if (Notification.permission === "denied" && storedEndpointId("web")) {
    await disablePush(teamId);
    return;
  }
  if (Notification.permission !== "granted") return;
  if (endpointRegistration(current, "web") === "invalid") return;
  if (!storedEndpointId("web")) return;
  const subscription = await existingWebSubscription();
  if (
    subscription &&
    current.web.vapidPublicKey &&
    subscriptionUsesKey(subscription, current.web.vapidPublicKey)
  ) {
    await registerWeb(teamId, subscription);
  }
}

export async function disablePush(teamId: string): Promise<void> {
  const platform = isTauri() ? "android" : "web";
  const endpointId = storedEndpointId(platform);
  const removal = endpointId
    ? api<void>(`/teams/${teamId}/notifications/endpoints/${endpointId}`, {
        method: "DELETE",
      }).then(
        () => null,
        (error: unknown) => error
      )
    : Promise.resolve(null);
  let clientError: unknown = null;
  try {
    if (isTauri()) {
      await invoke("plugin:push|disable");
    } else {
      const subscription = await existingWebSubscription();
      await subscription?.unsubscribe();
    }
  } catch (error) {
    clientError = error;
  }
  const serverError = await removal;
  clearStoredEndpointId(platform);
  if (serverError) throw serverError;
  if (clientError) throw clientError;
}

export function revokePushOnLogout(teamId: string): void {
  void disablePush(teamId).catch(() => undefined);
}

export function listenForPushSubscriptionChanges(teamId: string): () => void {
  const listener = (event: MessageEvent) => {
    if (event.data?.type === "mimorii:push-subscription-changed") {
      void syncPushEndpoint(teamId).catch(() => undefined);
    }
  };
  navigator.serviceWorker?.addEventListener("message", listener);
  return () => navigator.serviceWorker?.removeEventListener("message", listener);
}

async function registerWeb(
  teamId: string,
  subscription: PushSubscription
): Promise<NotificationEndpointSummary> {
  const endpoint = await api<NotificationEndpointSummary>(
    `/teams/${teamId}/notifications/endpoints/web`,
    {
      method: "POST",
      ...jsonBody({ deviceKey: webDeviceKey(), subscription: subscription.toJSON() }),
    }
  );
  storeEndpointId("web", endpoint.id);
  return endpoint;
}

async function registerAndroid(
  teamId: string,
  state: NativePushState
): Promise<NotificationEndpointSummary> {
  const endpoint = await api<NotificationEndpointSummary>(
    `/teams/${teamId}/notifications/endpoints/android`,
    {
      method: "POST",
      ...jsonBody({ deviceKey: state.deviceKey, installationId: state.installationId }),
    }
  );
  storeEndpointId("android", endpoint.id);
  return endpoint;
}

async function existingWebSubscription(): Promise<PushSubscription | null> {
  if (!("serviceWorker" in navigator)) return null;
  const registration = await navigator.serviceWorker.getRegistration("/");
  return registration?.pushManager.getSubscription() ?? null;
}

function webDeviceKey(): string {
  const existing = localStorage.getItem(WEB_DEVICE_KEY);
  if (existing) return existing;
  const value = crypto.randomUUID();
  localStorage.setItem(WEB_DEVICE_KEY, value);
  return value;
}

function endpointStorageKey(platform: "web" | "android"): string {
  return `mimorii.push.endpoint:${getServerUrl()}:${platform}`;
}

function storedEndpointId(platform: "web" | "android"): string | null {
  return localStorage.getItem(endpointStorageKey(platform));
}

function storeEndpointId(platform: "web" | "android", id: string): void {
  localStorage.setItem(endpointStorageKey(platform), id);
}

function clearStoredEndpointId(platform: "web" | "android"): void {
  localStorage.removeItem(endpointStorageKey(platform));
}

function endpointRegistration(
  capabilities: NotificationPushCapabilities,
  platform: "web" | "android"
): DevicePushState["registration"] {
  const id = storedEndpointId(platform);
  if (!id) return "missing";
  const endpoint = capabilities.endpoints.find(
    (candidate) => candidate.id === id && candidate.platform === platform
  );
  if (!endpoint) return "missing";
  return endpoint.status === "active" ? "active" : "invalid";
}

async function nativePushState(): Promise<NativePushState> {
  const state = await invoke<NativePushState>("plugin:push|status");
  if (state.launchPath?.match(/^\/app(?:\/.*)?$/)) {
    window.location.assign(state.launchPath);
  }
  return state;
}

function subscriptionUsesKey(subscription: PushSubscription, publicKey: string): boolean {
  const actual = subscription.options.applicationServerKey;
  if (!actual) return false;
  const expected = decodeVapidKey(publicKey);
  const bytes = new Uint8Array(actual);
  return (
    bytes.length === expected.length && bytes.every((value, index) => value === expected[index])
  );
}

function decodeVapidKey(value: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
  const decoded = atob(base64);
  return Uint8Array.from(decoded, (character) => character.charCodeAt(0));
}
