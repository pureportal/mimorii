import { afterEach, describe, expect, it, vi } from "vitest";
import {
  mcpResourceUrl,
  oauthAuthorizationUrl,
  oauthIssuer,
  oauthProtectedResourceMetadataUrl,
  oauthTokenUrl,
  publicOrigin,
} from "./oauth-config.js";

afterEach(() => vi.unstubAllEnvs());

describe("OAuth public endpoints", () => {
  it("derives canonical OAuth and MCP URLs from the configured origin", () => {
    vi.stubEnv("MIMORII_PUBLIC_URL", "https://Mimorii.Example:8443/");
    expect(publicOrigin().href).toBe("https://mimorii.example:8443/");
    expect(oauthIssuer()).toBe("https://mimorii.example:8443");
    expect(mcpResourceUrl().href).toBe("https://mimorii.example:8443/api/mcp");
    expect(oauthAuthorizationUrl().href).toBe("https://mimorii.example:8443/api/oauth/authorize");
    expect(oauthTokenUrl().href).toBe("https://mimorii.example:8443/api/oauth/token");
    expect(oauthProtectedResourceMetadataUrl().href).toBe(
      "https://mimorii.example:8443/.well-known/oauth-protected-resource/api/mcp"
    );
  });

  it("requires HTTPS for non-loopback production origins", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("MIMORII_PUBLIC_URL", "http://mimorii.example");
    expect(() => publicOrigin()).toThrow("must use HTTPS");

    vi.stubEnv("MIMORII_PUBLIC_URL", "http://127.0.0.1:4310");
    expect(publicOrigin().origin).toBe("http://127.0.0.1:4310");
  });

  it("rejects credentials and ambiguous query or fragment components", () => {
    for (const value of [
      "https://user@mimorii.example",
      "https://mimorii.example?tenant=one",
      "https://mimorii.example#oauth",
    ]) {
      vi.stubEnv("MIMORII_PUBLIC_URL", value);
      expect(() => publicOrigin()).toThrow();
    }
  });
});
