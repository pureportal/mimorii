import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import type { Response } from "express";
import { readBearerToken } from "../auth/bearer-token.js";
import type { AuthenticatedRequest } from "../auth/current-user.decorator.js";
import { oauthProtectedResourceMetadataUrl } from "../auth/oauth-config.js";
import { OAuthService } from "../auth/oauth.service.js";
import { requiresMcpWriteScope } from "./mcp-tools.js";

@Injectable()
export class McpAuthGuard implements CanActivate {
  constructor(private readonly oauth: OAuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const response = context.switchToHttp().getResponse<Response>();
    const token = readBearerToken(request);
    const requiredScopes = requestRequiresWriteScope(request)
      ? ["mcp:read", "mcp:write"]
      : ["mcp:read"];

    if (!token?.startsWith("mim_oat_")) {
      this.reject(response, "MCP OAuth access token required", requiredScopes);
    }

    const authentication = await this.oauth.authenticateAccessToken(token);
    if (!authentication) {
      response.setHeader("WWW-Authenticate", bearerChallenge(requiredScopes, "invalid_token"));
      throw new UnauthorizedException("OAuth access token is invalid or expired");
    }
    request.user = authentication.user;
    request.authCredential = authentication.credential;

    const credential = request.authCredential;
    if (request.user.authMethod !== "oauth" || credential?.type !== "oauth") {
      this.reject(response, "MCP OAuth access token required", requiredScopes);
    }
    if (!requiredScopes.every((scope) => credential.scopes.includes(scope))) {
      response.setHeader("WWW-Authenticate", bearerChallenge(requiredScopes, "insufficient_scope"));
      throw new ForbiddenException("OAuth scope is insufficient for this MCP request");
    }

    return true;
  }

  private reject(response: Response, message: string, scopes: string[]): never {
    response.setHeader("WWW-Authenticate", bearerChallenge(scopes));
    throw new UnauthorizedException(message);
  }
}

function bearerChallenge(scopes: string[], error?: "invalid_token" | "insufficient_scope"): string {
  const parameters = [
    'realm="mimorii-mcp"',
    `resource_metadata="${oauthProtectedResourceMetadataUrl().href}"`,
    `scope="${scopes.join(" ")}"`,
  ];
  if (error) parameters.splice(1, 0, `error="${error}"`);
  return `Bearer ${parameters.join(", ")}`;
}

function header(request: AuthenticatedRequest, name: string): string | undefined {
  const value = request.headers[name];
  return Array.isArray(value) ? undefined : value;
}

function requestRequiresWriteScope(request: AuthenticatedRequest): boolean {
  if (
    header(request, "mcp-method") === "tools/call" &&
    requiresMcpWriteScope(header(request, "mcp-name"))
  ) {
    return true;
  }
  const messages = Array.isArray(request.body) ? request.body : [request.body];
  return messages.some((message) => {
    if (!isRecord(message) || message.method !== "tools/call" || !isRecord(message.params)) {
      return false;
    }
    const toolName = message.params.name;
    return typeof toolName === "string" && requiresMcpWriteScope(toolName);
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
