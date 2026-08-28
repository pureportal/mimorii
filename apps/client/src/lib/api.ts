import { trackSwetrixEvent } from "./swetrix";
import { applicationRuntime, type ApplicationRuntime } from "./runtime";

const DEFAULT_API_URL =
  import.meta.env.VITE_API_URL?.trim() || defaultApiUrl(applicationRuntime, window.location);
const SERVER_KEY = "mimorii.server";
let accessToken: string | null = null;

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export function getServerUrl(): string {
  const stored = localStorage.getItem(SERVER_KEY);
  if (!stored) return DEFAULT_API_URL;
  if (applicationRuntime === "android-client" && isInternalTauriUrl(stored)) {
    localStorage.removeItem(SERVER_KEY);
    return DEFAULT_API_URL;
  }
  return stored;
}

export function setServerUrl(value: string): string {
  const normalized = normalizeServerUrl(value, applicationRuntime);
  localStorage.setItem(SERVER_KEY, normalized);
  return normalized;
}

export function defaultApiUrl(
  runtime: ApplicationRuntime,
  location: Pick<Location, "origin" | "protocol">
): string {
  if (runtime === "android-client") return "https://mimorii.app/api";
  return location.protocol === "tauri:" ? "http://localhost:4310/api" : `${location.origin}/api`;
}

export function normalizeServerUrl(value: string, runtime: ApplicationRuntime): string {
  const parsed = new URL(value.trim());
  if (!new Set(["http:", "https:"]).has(parsed.protocol))
    throw new Error("Server must use HTTP or HTTPS");
  if (runtime === "android-client" && parsed.hostname === "tauri.localhost") {
    throw new Error("Enter your Mimorii server URL");
  }
  parsed.pathname = parsed.pathname.replace(/\/$/, "");
  if (!parsed.pathname.endsWith("/api"))
    parsed.pathname = `${parsed.pathname}/api`.replace(/\/+/g, "/");
  return parsed.toString().replace(/\/$/, "");
}

export function setAccessToken(token: string | null): void {
  accessToken = token;
}

export function getAccessToken(): string | null {
  return accessToken;
}

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getAccessToken();
  const method = (options.method ?? "GET").toUpperCase();
  const scope = apiScope(path);
  const headers = new Headers(options.headers);
  if (options.body && !(options.body instanceof FormData) && !headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }
  if (token && !headers.has("authorization")) headers.set("authorization", `Bearer ${token}`);
  const response = await fetch(`${getServerUrl()}${path}`, {
    ...options,
    headers,
  });
  if (!response.ok) {
    if (method !== "GET") {
      trackSwetrixEvent({
        ev: "API_MUTATION_FAILED",
        meta: { method, scope, status: response.status },
      });
    }
    throw await apiError(response, token);
  }
  if (response.status === 204) {
    if (method !== "GET") {
      trackSwetrixEvent({ ev: "API_MUTATION_SUCCEEDED", meta: { method, scope } });
    }
    return undefined as T;
  }
  let result: T;
  try {
    result = (await response.json()) as T;
  } catch {
    if (method !== "GET") {
      trackSwetrixEvent({
        ev: "API_MUTATION_FAILED",
        meta: { method, scope, status: response.status },
      });
    }
    throw new ApiError(
      response.status,
      "Server returned an invalid response. Check the server URL."
    );
  }
  if (method !== "GET") {
    trackSwetrixEvent({ ev: "API_MUTATION_SUCCEEDED", meta: { method, scope } });
  }
  return result;
}

export async function apiBlob(path: string, options: RequestInit = {}): Promise<Blob> {
  const token = getAccessToken();
  const headers = new Headers(options.headers);
  if (token && !headers.has("authorization")) headers.set("authorization", `Bearer ${token}`);
  const response = await fetch(`${getServerUrl()}${path}`, { ...options, headers });
  if (!response.ok) throw await apiError(response, token);
  return response.blob();
}

export function jsonBody(value: unknown): Pick<RequestInit, "body"> {
  return { body: JSON.stringify(value) };
}

export function apiAssetUrl(path: string): string {
  return `${getServerUrl()}${path.startsWith("/") ? path : `/${path}`}`;
}

function apiScope(path: string): string {
  const pathname = path.split("?")[0] ?? "";
  const segments = pathname.split("/").filter(Boolean);
  if (segments[0] === "teams") return segments[2] ?? "teams";
  return segments[0] ?? "unknown";
}

function isInternalTauriUrl(value: string): boolean {
  try {
    return new URL(value).hostname === "tauri.localhost";
  } catch {
    return false;
  }
}

async function apiError(response: Response, token: string | null): Promise<ApiError> {
  let message = response.status === 401 ? "Sign in required" : "Request failed";
  try {
    const body = (await response.json()) as {
      message?: string | string[];
      error_description?: string;
    };
    if (Array.isArray(body.message)) message = body.message[0] ?? message;
    else if (body.message) message = body.message;
    else if (body.error_description) message = body.error_description;
  } catch {
    message = response.statusText || message;
  }
  if (response.status === 401 && token) {
    window.dispatchEvent(new Event("mimorii:unauthorized"));
  }
  return new ApiError(response.status, message);
}
