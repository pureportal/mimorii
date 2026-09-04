import type { AuthSession } from "@mimorii/contracts";
import { getAuthSession, isAuthSession, storeAuthSession } from "./auth-session";
import { trackSwetrixEvent } from "./swetrix";
import { applicationRuntime, type ApplicationRuntime } from "./runtime";

const DEFAULT_API_URL =
  import.meta.env.VITE_API_URL?.trim() || defaultApiUrl(applicationRuntime, window.location);
const SERVER_KEY = "mimorii.server";
const ACCESS_TOKEN_REFRESH_WINDOW_MILLISECONDS = 60_000;
let refreshOperation: { refreshToken: string; promise: Promise<AuthSession> } | null = null;

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

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const method = (options.method ?? "GET").toUpperCase();
  const scope = apiScope(path);
  const response = await authenticatedFetch(path, options);
  if (!response.ok) {
    if (method !== "GET") {
      trackSwetrixEvent({
        ev: "API_MUTATION_FAILED",
        meta: { method, scope, status: response.status },
      });
    }
    throw await apiError(response);
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
  const response = await authenticatedFetch(path, options);
  if (!response.ok) throw await apiError(response);
  return response.blob();
}

export async function revokeAuthSession(refreshToken: string): Promise<void> {
  const response = await fetch(`${getServerUrl()}/auth/logout`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ refreshToken }),
  });
  if (!response.ok) throw await apiError(response);
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

async function authenticatedFetch(path: string, options: RequestInit): Promise<Response> {
  const baseHeaders = new Headers(options.headers);
  if (options.body && !(options.body instanceof FormData) && !baseHeaders.has("content-type")) {
    baseHeaders.set("content-type", "application/json");
  }
  const usesSession = !baseHeaders.has("authorization");
  const token = usesSession ? await accessTokenForRequest() : null;
  const request = (accessToken: string | null) => {
    const headers = new Headers(baseHeaders);
    if (accessToken) headers.set("authorization", `Bearer ${accessToken}`);
    return fetch(`${getServerUrl()}${path}`, { ...options, headers });
  };
  const response = await request(token);
  if (response.status !== 401 || !usesSession || !token) return response;

  const refreshedToken = await refreshAfterUnauthorized(token);
  if (!refreshedToken) return response;
  return request(refreshedToken);
}

async function accessTokenForRequest(): Promise<string | null> {
  const session = getAuthSession();
  if (!session) return null;
  const now = Date.now();
  if (new Date(session.refreshExpiresAt).getTime() <= now) {
    storeAuthSession(null);
    return null;
  }
  if (new Date(session.expiresAt).getTime() > now + ACCESS_TOKEN_REFRESH_WINDOW_MILLISECONDS) {
    return session.accessToken;
  }
  return (await refreshAuthSession()).accessToken;
}

async function refreshAfterUnauthorized(accessToken: string): Promise<string | null> {
  const current = getAuthSession();
  if (!current) return null;
  if (current.accessToken !== accessToken && new Date(current.expiresAt).getTime() > Date.now()) {
    return current.accessToken;
  }
  return (await refreshAuthSession()).accessToken;
}

async function refreshAuthSession(): Promise<AuthSession> {
  const current = getAuthSession();
  if (!current) throw new ApiError(401, "Sign in required");
  const refreshToken = current.refreshToken;
  if (refreshOperation?.refreshToken === refreshToken) return refreshOperation.promise;
  const operation = { refreshToken, promise: exchangeRefreshToken(refreshToken) };
  refreshOperation = operation;
  try {
    return await operation.promise;
  } finally {
    if (refreshOperation === operation) refreshOperation = null;
  }
}

async function exchangeRefreshToken(refreshToken: string): Promise<AuthSession> {
  const response = await fetch(`${getServerUrl()}/auth/refresh`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ refreshToken }),
  });
  if (!response.ok) {
    const error = await apiError(response);
    if (response.status === 401 && getAuthSession()?.refreshToken === refreshToken) {
      storeAuthSession(null);
    }
    throw error;
  }

  let session: unknown;
  try {
    session = await response.json();
  } catch {
    throw invalidServerResponse(response.status);
  }
  if (!isAuthSession(session)) throw invalidServerResponse(response.status);
  if (getAuthSession()?.refreshToken !== refreshToken) {
    throw new ApiError(401, "Session changed");
  }
  storeAuthSession(session);
  return session;
}

async function apiError(response: Response): Promise<ApiError> {
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
  return new ApiError(response.status, message);
}

function invalidServerResponse(status: number): ApiError {
  return new ApiError(status, "Server returned an invalid response. Check the server URL.");
}
