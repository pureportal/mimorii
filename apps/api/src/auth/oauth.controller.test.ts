import type { Response } from "express";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OAuthController } from "./oauth.controller.js";
import type { OAuthService } from "./oauth.service.js";

beforeEach(() => vi.stubEnv("MIMORII_PUBLIC_URL", "https://mimorii.example"));
afterEach(() => vi.unstubAllEnvs());

describe("OAuth controller", () => {
  it("publishes MCP resource and authorization-server discovery metadata", () => {
    const controller = new OAuthController({} as OAuthService);
    const resourceResponse = responseFixture();
    const serverResponse = responseFixture();

    expect(controller.protectedResourceMetadata(resourceResponse.response)).toEqual({
      resource: "https://mimorii.example/api/mcp",
      authorization_servers: ["https://mimorii.example"],
      bearer_methods_supported: ["header"],
      scopes_supported: ["mcp:read"],
    });
    expect(controller.authorizationServerMetadata(serverResponse.response)).toMatchObject({
      issuer: "https://mimorii.example",
      authorization_endpoint: "https://mimorii.example/api/oauth/authorize",
      token_endpoint: "https://mimorii.example/api/oauth/token",
      revocation_endpoint: "https://mimorii.example/api/oauth/revoke",
      grant_types_supported: ["authorization_code", "refresh_token"],
      token_endpoint_auth_methods_supported: ["none"],
      revocation_endpoint_auth_methods_supported: ["none"],
      code_challenge_methods_supported: ["S256"],
      scopes_supported: ["mcp:read", "mcp:write"],
      authorization_response_iss_parameter_supported: true,
      client_id_metadata_document_supported: true,
      protected_resources: ["https://mimorii.example/api/mcp"],
    });
    expect(resourceResponse.set).toHaveBeenCalledWith(
      expect.objectContaining({ "Cache-Control": "public, max-age=3600" })
    );
  });

  it("moves syntactically valid authorization requests to the local consent page", () => {
    const controller = new OAuthController({} as OAuthService);
    const fixture = responseFixture();

    controller.authorize(authorizationRequest(), fixture.response);

    expect(fixture.redirect).toHaveBeenCalledWith(
      303,
      expect.stringMatching(/^https:\/\/mimorii\.example\/oauth\/authorize\?/)
    );
    expect(fixture.set).toHaveBeenCalledWith({
      "Cache-Control": "no-store",
      Pragma: "no-cache",
    });
    const target = new URL(fixture.redirect.mock.calls[0]![1]);
    expect(target.searchParams.get("client_id")).toBe("https://client.example/oauth/metadata.json");
    expect(target.searchParams.get("state")).toBe("state-value");
  });

  it("uses the OAuth-specific error for unsupported authorization response types", () => {
    const controller = new OAuthController({} as OAuthService);
    const fixture = responseFixture();

    expect(() =>
      controller.authorize({ ...authorizationRequest(), response_type: "token" }, fixture.response)
    ).toThrow(
      expect.objectContaining({
        code: "unsupported_response_type",
      })
    );
    expect(fixture.set).toHaveBeenCalledWith({
      "Cache-Control": "no-store",
      Pragma: "no-cache",
    });
  });

  it("requires exact form media types and strict token parameters", async () => {
    const exchange = vi.fn(async () => ({ access_token: "token" }));
    const controller = new OAuthController({ exchange } as unknown as OAuthService);
    const fixture = responseFixture();
    const tokenRequest = {
      grant_type: "authorization_code",
      client_id: "https://client.example/oauth/metadata.json",
      resource: "https://mimorii.example/api/mcp",
      code: "code",
      code_verifier: "a".repeat(64),
      redirect_uri: "https://client.example/callback",
    };

    expect(() => controller.token("application/json", tokenRequest, fixture.response)).toThrow();
    expect(() =>
      controller.token("application/x-www-form-urlencoded-invalid", tokenRequest, fixture.response)
    ).toThrow();
    expect(() =>
      controller.token(
        "application/x-www-form-urlencoded",
        { ...tokenRequest, client_secret: "unexpected" },
        fixture.response
      )
    ).toThrow();
    await expect(
      controller.token(
        "application/x-www-form-urlencoded; charset=UTF-8",
        tokenRequest,
        fixture.response
      )
    ).resolves.toEqual({ access_token: "token" });
    expect(exchange).toHaveBeenCalledWith(tokenRequest);
  });
});

function authorizationRequest() {
  return {
    response_type: "code",
    client_id: "https://client.example/oauth/metadata.json",
    redirect_uri: "https://client.example/callback",
    scope: "mcp:read",
    state: "state-value",
    code_challenge: "a".repeat(43),
    code_challenge_method: "S256",
    resource: "https://mimorii.example/api/mcp",
  };
}

function responseFixture() {
  const set = vi.fn();
  const redirect = vi.fn();
  return {
    set,
    redirect,
    response: { set, redirect } as unknown as Response,
  };
}
