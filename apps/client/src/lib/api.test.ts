import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  api,
  apiAssetUrl,
  defaultApiUrl,
  getServerUrl,
  normalizeServerUrl,
  setServerUrl,
} from "./api";
import { getAuthSession, storeAuthSession } from "./auth-session";

describe("server URL configuration", () => {
  beforeEach(() => {
    storeAuthSession(null);
    localStorage.clear();
  });
  afterEach(() => vi.unstubAllGlobals());

  it("normalizes API paths", () => {
    expect(setServerUrl("https://monitor.example.com/")).toBe("https://monitor.example.com/api");
    expect(getServerUrl()).toBe("https://monitor.example.com/api");
  });

  it("preserves an explicit API path", () => {
    expect(setServerUrl("https://monitor.example.com/mimorii/api")).toBe(
      "https://monitor.example.com/mimorii/api"
    );
    expect(apiAssetUrl("/sponsors/company/favicon")).toBe(
      "https://monitor.example.com/mimorii/api/sponsors/company/favicon"
    );
  });

  it("uses the Mimorii API instead of the Android WebView origin", () => {
    expect(defaultApiUrl("android-client", new URL("http://tauri.localhost"))).toBe(
      "https://mimorii.app/api"
    );
    expect(() => normalizeServerUrl("http://tauri.localhost/api", "android-client")).toThrow(
      "Enter your Mimorii server URL"
    );
  });

  it("lets the browser set the multipart boundary for FormData", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);
    const body = new FormData();
    body.set("name", "Example Sponsor");

    await api("/admin/sponsors", { method: "POST", body });

    const request = fetchMock.mock.calls[0]?.[1];
    if (!request) throw new Error("Expected a fetch request");
    expect(new Headers(request.headers).has("content-type")).toBe(false);
  });

  it("does not expire a session for an anonymous unauthorized request", async () => {
    const unauthorized = vi.fn();
    window.addEventListener("mimorii:unauthorized", unauthorized);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ message: "Sign in required" }), {
          status: 401,
          headers: { "content-type": "application/json" },
        })
      )
    );

    await expect(api("/dashboards/private")).rejects.toThrow("Sign in required");
    expect(unauthorized).not.toHaveBeenCalled();
    window.removeEventListener("mimorii:unauthorized", unauthorized);
  });

  it("replaces raw JSON parser failures with a recoverable server error", async () => {
    setServerUrl("https://monitor.example.com");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response("<!doctype html><title>Not the API</title>", {
          status: 200,
          headers: { "content-type": "text/html" },
        })
      )
    );

    await expect(api("/auth/login", { method: "POST", body: JSON.stringify({}) })).rejects.toThrow(
      "Server returned an invalid response. Check the server URL."
    );
  });

  it("renews an expired access token before making the request", async () => {
    const renewed = authSession("renewed-access", Date.now() + 60 * 60_000);
    storeAuthSession(authSession("expired-access", Date.now() - 1_000));
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse(renewed))
      .mockResolvedValueOnce(jsonResponse({ user: renewed.user, teams: renewed.teams }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(api("/auth/me")).resolves.toMatchObject({ user: renewed.user });

    expect(fetchMock.mock.calls[0]?.[0]).toBe("http://localhost:3000/api/auth/refresh");
    const refreshBody = fetchMock.mock.calls[0]?.[1]?.body;
    if (typeof refreshBody !== "string") throw new Error("Expected a JSON refresh request");
    expect(JSON.parse(refreshBody)).toEqual({
      refreshToken: "refresh-token",
    });
    expect(new Headers(fetchMock.mock.calls[1]?.[1]?.headers).get("authorization")).toBe(
      "Bearer renewed-access"
    );
    expect(getAuthSession()?.accessToken).toBe("renewed-access");
  });

  it("renews and retries once when the server rejects an access token", async () => {
    const renewed = authSession("renewed-access", Date.now() + 60 * 60_000);
    storeAuthSession(authSession("rejected-access", Date.now() + 60 * 60_000));
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ message: "Session expired" }, 401))
      .mockResolvedValueOnce(jsonResponse(renewed))
      .mockResolvedValueOnce(jsonResponse({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(api("/checks")).resolves.toEqual({ ok: true });

    expect(new Headers(fetchMock.mock.calls[0]?.[1]?.headers).get("authorization")).toBe(
      "Bearer rejected-access"
    );
    expect(fetchMock.mock.calls[1]?.[0]).toBe("http://localhost:3000/api/auth/refresh");
    expect(new Headers(fetchMock.mock.calls[2]?.[1]?.headers).get("authorization")).toBe(
      "Bearer renewed-access"
    );
  });

  it("clears only the invalid session when refresh is rejected", async () => {
    storeAuthSession(authSession("expired-access", Date.now() - 1_000));
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse({ message: "Session expired" }, 401))
    );

    await expect(api("/auth/me")).rejects.toThrow("Session expired");
    expect(getAuthSession()).toBeNull();
    expect(localStorage.getItem("mimorii.session")).toBeNull();
  });

  it("keeps a valid session when the retried operation itself is unauthorized", async () => {
    const renewed = authSession("renewed-access", Date.now() + 60 * 60_000);
    storeAuthSession(authSession("current-access", Date.now() + 60 * 60_000));
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(jsonResponse({ message: "Current password is incorrect" }, 401))
        .mockResolvedValueOnce(jsonResponse(renewed))
        .mockResolvedValueOnce(jsonResponse({ message: "Current password is incorrect" }, 401))
    );

    await expect(
      api("/auth/password", { method: "POST", body: JSON.stringify({}) })
    ).rejects.toThrow("Current password is incorrect");
    expect(getAuthSession()?.accessToken).toBe("renewed-access");
  });
});

function authSession(accessToken: string, expiresAt: number) {
  return {
    accessToken,
    expiresAt: new Date(expiresAt).toISOString(),
    refreshToken: "refresh-token",
    refreshExpiresAt: new Date(Date.now() + 30 * 86_400_000).toISOString(),
    user: {
      id: "user-1",
      email: "user@example.com",
      name: "User",
      isGlobalAdmin: false,
      acknowledgedTourIds: [],
      createdAt: "2026-08-14T08:00:00.000Z",
    },
    teams: [
      {
        id: "team-1",
        name: "Operations",
        role: "owner" as const,
        createdAt: "2026-08-14T08:00:00.000Z",
      },
    ],
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}
