import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  api,
  apiAssetUrl,
  defaultApiUrl,
  getServerUrl,
  normalizeServerUrl,
  setServerUrl,
} from "./api";

describe("server URL configuration", () => {
  beforeEach(() => localStorage.clear());
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
});
