import { BadRequestException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import type { TargetSafetyService } from "../common/target-safety.service.js";
import { OAuthException } from "./oauth-error.js";
import {
  clientMetadataCacheDuration,
  OAuthClientMetadataService,
  parseClientMetadata,
  validRedirectUri,
  validateClientIdUrl,
} from "./oauth-client-metadata.service.js";

const clientId = "https://client.example/oauth/mimorii.json";

describe("OAuth client metadata", () => {
  it("accepts public clients and records declared refresh-token support", () => {
    expect(
      parseClientMetadata(
        JSON.stringify({
          client_id: clientId,
          client_name: "Operations assistant",
          redirect_uris: [
            "https://client.example/oauth/callback",
            "http://127.0.0.1:9123/callback",
            "http://127.0.0.1:9123/callback",
          ],
          grant_types: ["authorization_code", "refresh_token", "custom_grant"],
          response_types: ["code", "custom_response"],
          token_endpoint_auth_method: "none",
        }),
        clientId
      )
    ).toEqual({
      clientId,
      clientName: "Operations assistant",
      redirectUris: ["https://client.example/oauth/callback", "http://127.0.0.1:9123/callback"],
      allowRefresh: true,
    });
  });

  it("does not issue refresh tokens when the client does not declare that grant", () => {
    expect(
      parseClientMetadata(
        JSON.stringify({
          client_id: clientId,
          client_name: "Read-only client",
          redirect_uris: ["https://client.example/callback"],
        }),
        clientId
      ).allowRefresh
    ).toBe(false);
  });

  it("rejects mismatched identities, confidential clients, and unsafe redirects", () => {
    const base = {
      client_id: clientId,
      client_name: "Client",
      redirect_uris: ["https://client.example/callback"],
      token_endpoint_auth_method: "none",
    };
    expect(() =>
      parseClientMetadata(JSON.stringify({ ...base, client_id: `${clientId}/other` }), clientId)
    ).toThrow(OAuthException);
    expect(() =>
      parseClientMetadata(
        JSON.stringify({ ...base, token_endpoint_auth_method: "client_secret_basic" }),
        clientId
      )
    ).toThrow(OAuthException);
    expect(() =>
      parseClientMetadata(
        JSON.stringify({ ...base, redirect_uris: ["http://private.example/callback"] }),
        clientId
      )
    ).toThrow(OAuthException);
    expect(() =>
      parseClientMetadata(JSON.stringify({ ...base, client_name: "Trusted\u202eClient" }), clientId)
    ).toThrow(OAuthException);
  });

  it("requires an unambiguous HTTPS metadata-document URL", () => {
    expect(validateClientIdUrl(clientId).href).toBe(clientId);
    for (const invalid of [
      "http://client.example/metadata.json",
      "https://client.example/",
      "https://client.example/a/../metadata.json",
      "https://client.example/metadata.json?",
      "https://client.example/metadata.json#",
    ]) {
      expect(() => validateClientIdUrl(invalid)).toThrow(OAuthException);
    }
  });

  it("allows HTTPS and exact loopback callbacks but no other HTTP or fragment URI", () => {
    expect(validRedirectUri("https://client.example/callback?channel=mcp")).toBe(true);
    expect(validRedirectUri("http://localhost:4312/callback")).toBe(true);
    expect(validRedirectUri("http://[::1]:4312/callback")).toBe(true);
    expect(validRedirectUri("http://192.168.1.2/callback")).toBe(false);
    expect(validRedirectUri("https://client.example/callback#")).toBe(false);
  });

  it("uses strict public DNS resolution before any metadata request", async () => {
    const resolveStrictPublicHost = vi.fn(async () => {
      throw new BadRequestException("Target cannot use a private network");
    });
    const service = new OAuthClientMetadataService({
      resolveStrictPublicHost,
    } as unknown as TargetSafetyService);

    await expect(service.resolve(clientId)).rejects.toMatchObject({ code: "invalid_client" });
    expect(resolveStrictPublicHost).toHaveBeenCalledWith("client.example");
  });

  it("honors metadata cache directives within the local cache cap", () => {
    expect(clientMetadataCacheDuration({ "cache-control": "no-store" })).toBe(0);
    expect(clientMetadataCacheDuration({ "cache-control": "no-cache, max-age=600" })).toBe(0);
    expect(clientMetadataCacheDuration({ "cache-control": "public, max-age=120", age: "20" })).toBe(
      100_000
    );
    expect(clientMetadataCacheDuration({ "cache-control": "max-age=86400" })).toBe(600_000);
    expect(clientMetadataCacheDuration({ "cache-control": "max-age=invalid" })).toBe(0);
    expect(
      clientMetadataCacheDuration(
        { expires: "2026-08-28T00:05:00.000Z" },
        Date.parse("2026-08-28T00:00:00.000Z")
      )
    ).toBe(300_000);
  });
});
