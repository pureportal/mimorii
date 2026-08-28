export const mcpScopes = ["mcp:read", "mcp:write"] as const;
export type McpScope = (typeof mcpScopes)[number];

export function publicOrigin(
  configured = process.env.MIMORII_PUBLIC_URL ?? "http://localhost:4310"
): URL {
  const parsed = new URL(configured);
  if (
    !["http:", "https:"].includes(parsed.protocol) ||
    parsed.username ||
    parsed.password ||
    parsed.search ||
    parsed.hash
  ) {
    throw new Error("MIMORII_PUBLIC_URL must be an HTTP or HTTPS URL without credentials");
  }
  if (
    process.env.NODE_ENV === "production" &&
    parsed.protocol !== "https:" &&
    !["localhost", "127.0.0.1", "[::1]"].includes(parsed.hostname.toLowerCase())
  ) {
    throw new Error("MIMORII_PUBLIC_URL must use HTTPS in production");
  }
  return new URL(parsed.origin);
}

export function oauthIssuer(): string {
  return publicOrigin().origin;
}

export function mcpResourceUrl(): URL {
  return new URL("/api/mcp", publicOrigin());
}

export function oauthProtectedResourceMetadataUrl(): URL {
  return new URL("/.well-known/oauth-protected-resource/api/mcp", publicOrigin());
}

export function oauthAuthorizationUrl(): URL {
  return new URL("/api/oauth/authorize", publicOrigin());
}

export function oauthTokenUrl(): URL {
  return new URL("/api/oauth/token", publicOrigin());
}

export function oauthRevocationUrl(): URL {
  return new URL("/api/oauth/revoke", publicOrigin());
}
