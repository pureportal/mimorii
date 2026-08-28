import { ForbiddenException, UnauthorizedException, type ExecutionContext } from "@nestjs/common";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { OAuthAccessTokenAuthentication, OAuthService } from "../auth/oauth.service.js";
import { McpAuthGuard } from "./mcp-auth.guard.js";

afterEach(() => vi.unstubAllEnvs());

describe("MCP authentication guard", () => {
  it("rejects missing, session, and personal API tokens without authenticating them", async () => {
    vi.stubEnv("MIMORII_PUBLIC_URL", "https://mimorii.example");
    const oauth = oauthService(null);
    const guard = new McpAuthGuard(oauth.service);

    const fixtures = [undefined, "Bearer signed-session", "Bearer mim_pat_token"].map(
      (authorization) => requestContext(authorization)
    );
    await Promise.all(
      fixtures.map((fixture) =>
        expect(guard.canActivate(fixture.context)).rejects.toThrow(UnauthorizedException)
      )
    );
    for (const fixture of fixtures) {
      expect(fixture.setHeader).toHaveBeenCalledWith(
        "WWW-Authenticate",
        expect.stringMatching(
          /^Bearer realm="mimorii-mcp", resource_metadata="https:\/\/mimorii\.example\/.well-known\/oauth-protected-resource\/api\/mcp", scope="mcp:read"$/
        )
      );
    }
    expect(oauth.authenticateAccessToken).not.toHaveBeenCalled();
  });

  it("binds a valid resource token to the request", async () => {
    const authentication = oauthAuthentication(["mcp:read"]);
    const oauth = oauthService(authentication);
    const fixture = requestContext("Bearer mim_oat_valid");
    const guard = new McpAuthGuard(oauth.service);

    await expect(guard.canActivate(fixture.context)).resolves.toBe(true);
    expect(oauth.authenticateAccessToken).toHaveBeenCalledWith("mim_oat_valid");
    expect(fixture.request.user).toEqual(authentication.user);
    expect(fixture.request.authCredential).toEqual(authentication.credential);
  });

  it("challenges invalid or expired OAuth access tokens", async () => {
    const oauth = oauthService(null);
    const fixture = requestContext("Bearer mim_oat_expired");
    const guard = new McpAuthGuard(oauth.service);

    await expect(guard.canActivate(fixture.context)).rejects.toThrow(
      "OAuth access token is invalid or expired"
    );
    expect(fixture.setHeader).toHaveBeenCalledWith(
      "WWW-Authenticate",
      expect.stringContaining('error="invalid_token"')
    );
  });

  it("returns a step-up challenge before write tool execution", async () => {
    const oauth = oauthService(oauthAuthentication(["mcp:read"]));
    const fixture = requestContext("Bearer mim_oat_read", {
      "mcp-method": "tools/call",
      "mcp-name": "create_incident",
    });
    const guard = new McpAuthGuard(oauth.service);

    await expect(guard.canActivate(fixture.context)).rejects.toThrow(ForbiddenException);
    expect(fixture.setHeader).toHaveBeenCalledWith(
      "WWW-Authenticate",
      expect.stringMatching(/error="insufficient_scope".*scope="mcp:read mcp:write"/)
    );
  });

  it("returns a step-up challenge for clients without MCP routing headers", async () => {
    const oauth = oauthService(oauthAuthentication(["mcp:read"]));
    const fixture = requestContext(
      "Bearer mim_oat_read",
      {},
      {
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: { name: "create_incident", arguments: {} },
      }
    );
    const guard = new McpAuthGuard(oauth.service);

    await expect(guard.canActivate(fixture.context)).rejects.toThrow(ForbiddenException);
    expect(fixture.setHeader).toHaveBeenCalledWith(
      "WWW-Authenticate",
      expect.stringMatching(/error="insufficient_scope".*scope="mcp:read mcp:write"/)
    );
  });

  it("detects write tools in a JSON-RPC batch", async () => {
    const oauth = oauthService(null);
    const fixture = requestContext(undefined, {}, [
      { jsonrpc: "2.0", id: 1, method: "tools/list", params: {} },
      {
        jsonrpc: "2.0",
        id: 2,
        method: "tools/call",
        params: { name: "update_resource", arguments: {} },
      },
    ]);
    const guard = new McpAuthGuard(oauth.service);

    await expect(guard.canActivate(fixture.context)).rejects.toThrow(UnauthorizedException);
    expect(fixture.setHeader).toHaveBeenCalledWith(
      "WWW-Authenticate",
      expect.stringContaining('scope="mcp:read mcp:write"')
    );
  });

  it("advertises the write scope on an unauthenticated direct mutation call", async () => {
    const oauth = oauthService(null);
    const fixture = requestContext(undefined, {
      "mcp-method": "tools/call",
      "mcp-name": "add_incident_update",
    });
    const guard = new McpAuthGuard(oauth.service);

    await expect(guard.canActivate(fixture.context)).rejects.toThrow(UnauthorizedException);
    expect(fixture.setHeader).toHaveBeenCalledWith(
      "WWW-Authenticate",
      expect.stringContaining('scope="mcp:read mcp:write"')
    );
  });

  it("allows write tools only when both MCP scopes are present", async () => {
    const oauth = oauthService(oauthAuthentication(["mcp:read", "mcp:write"]));
    const fixture = requestContext("Bearer mim_oat_write", {
      "mcp-method": "tools/call",
      "mcp-name": "update_resource",
    });
    const guard = new McpAuthGuard(oauth.service);

    await expect(guard.canActivate(fixture.context)).resolves.toBe(true);
  });

  it("does not apply a tool-name scope policy to another MCP method", async () => {
    const oauth = oauthService(oauthAuthentication(["mcp:read"]));
    const fixture = requestContext("Bearer mim_oat_read", {
      "mcp-method": "server/discover",
      "mcp-name": "update_resource",
    });
    const guard = new McpAuthGuard(oauth.service);

    await expect(guard.canActivate(fixture.context)).resolves.toBe(true);
  });
});

function oauthService(authentication: OAuthAccessTokenAuthentication | null) {
  const authenticateAccessToken = vi.fn(async () => authentication);
  return {
    authenticateAccessToken,
    service: { authenticateAccessToken } as unknown as OAuthService,
  };
}

function oauthAuthentication(scopes: Array<"mcp:read" | "mcp:write">) {
  return {
    user: {
      id: "user-1",
      email: "user@example.com",
      name: "User",
      tokenVersion: 2,
      isGlobalAdmin: true,
      authMethod: "oauth" as const,
    },
    credential: {
      type: "oauth" as const,
      id: "access-token-1",
      clientId: "https://client.example/metadata.json",
      scopes,
      resource: "http://localhost:4310/api/mcp",
      expiresAt: "2026-08-28T12:00:00.000Z",
    },
  } satisfies OAuthAccessTokenAuthentication;
}

function requestContext(
  authorization?: string,
  additionalHeaders: Record<string, string> = {},
  body?: unknown
) {
  const request: Record<string, unknown> & {
    headers: Record<string, string>;
  } = {
    headers: {
      ...(authorization ? { authorization } : {}),
      ...additionalHeaders,
    },
    body,
  };
  const setHeader = vi.fn();
  const context = {
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => ({ setHeader }),
    }),
  } as unknown as ExecutionContext;
  return { context, request, setHeader };
}
