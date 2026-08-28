import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Post,
  Query,
  Res,
  UseGuards,
} from "@nestjs/common";
import { ApiExcludeController } from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";
import type { Response } from "express";
import type { AuthenticatedUser } from "../common/rows.js";
import { AuthGuard } from "./auth.guard.js";
import { CurrentUser } from "./current-user.decorator.js";
import {
  mcpResourceUrl,
  mcpScopes,
  oauthAuthorizationUrl,
  oauthIssuer,
  oauthRevocationUrl,
  oauthTokenUrl,
  publicOrigin,
} from "./oauth-config.js";
import { OAuthException } from "./oauth-error.js";
import {
  oauthAuthorizationDecisionSchema,
  oauthAuthorizationEndpointRequestSchema,
  oauthAuthorizationRequestSchema,
  oauthRevocationRequestSchema,
  oauthTokenRequestSchema,
  parseOAuthInput,
} from "./oauth-input.js";
import { OAuthService } from "./oauth.service.js";

@ApiExcludeController()
@Controller()
export class OAuthController {
  constructor(private readonly oauth: OAuthService) {}

  @Get(".well-known/oauth-protected-resource/api/mcp")
  protectedResourceMetadata(@Res({ passthrough: true }) response: Response) {
    cacheMetadata(response);
    return {
      resource: mcpResourceUrl().href,
      authorization_servers: [oauthIssuer()],
      bearer_methods_supported: ["header"],
      scopes_supported: ["mcp:read"],
    };
  }

  @Get(".well-known/oauth-authorization-server")
  authorizationServerMetadata(@Res({ passthrough: true }) response: Response) {
    cacheMetadata(response);
    return {
      issuer: oauthIssuer(),
      authorization_endpoint: oauthAuthorizationUrl().href,
      token_endpoint: oauthTokenUrl().href,
      revocation_endpoint: oauthRevocationUrl().href,
      response_types_supported: ["code"],
      grant_types_supported: ["authorization_code", "refresh_token"],
      token_endpoint_auth_methods_supported: ["none"],
      revocation_endpoint_auth_methods_supported: ["none"],
      code_challenge_methods_supported: ["S256"],
      scopes_supported: [...mcpScopes],
      authorization_response_iss_parameter_supported: true,
      client_id_metadata_document_supported: true,
      protected_resources: [mcpResourceUrl().href],
    };
  }

  @Get("oauth/authorize")
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  authorize(@Query() query: Record<string, unknown>, @Res() response: Response): void {
    preventCaching(response);
    if (typeof query.response_type === "string" && query.response_type !== "code") {
      throw new OAuthException("unsupported_response_type", "OAuth response type is not supported");
    }
    const input = parseOAuthInput(oauthAuthorizationEndpointRequestSchema, query);
    const target = new URL("/oauth/authorize", publicOrigin());
    for (const [name, value] of Object.entries(input)) {
      if (value !== undefined) target.searchParams.set(name, value);
    }
    response.redirect(303, target.href);
  }

  @Get("oauth/authorization-request")
  @UseGuards(AuthGuard)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  authorizationRequest(
    @Query() query: Record<string, unknown>,
    @Res({ passthrough: true }) response: Response
  ) {
    preventCaching(response);
    return this.oauth.authorizationRequest(parseOAuthInput(oauthAuthorizationRequestSchema, query));
  }

  @Post("oauth/authorization")
  @HttpCode(200)
  @UseGuards(AuthGuard)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  authorizationDecision(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: unknown,
    @Res({ passthrough: true }) response: Response
  ) {
    preventCaching(response);
    return this.oauth.decideAuthorization(
      user,
      parseOAuthInput(oauthAuthorizationDecisionSchema, body)
    );
  }

  @Post("oauth/token")
  @HttpCode(200)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  token(
    @Headers("content-type") contentType: string | undefined,
    @Body() body: unknown,
    @Res({ passthrough: true }) response: Response
  ) {
    preventCaching(response);
    requireFormContentType(contentType);
    return this.oauth.exchange(parseOAuthInput(oauthTokenRequestSchema, body));
  }

  @Post("oauth/revoke")
  @HttpCode(200)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  async revoke(
    @Headers("content-type") contentType: string | undefined,
    @Body() body: unknown,
    @Res({ passthrough: true }) response: Response
  ): Promise<void> {
    preventCaching(response);
    requireFormContentType(contentType);
    await this.oauth.revoke(parseOAuthInput(oauthRevocationRequestSchema, body));
  }
}

function requireFormContentType(contentType: string | undefined): void {
  const mediaType = contentType?.split(";", 1)[0]?.trim().toLowerCase();
  if (mediaType !== "application/x-www-form-urlencoded") {
    throw new OAuthException("invalid_request", "OAuth endpoint requires form data");
  }
}

function cacheMetadata(response: Response): void {
  response.set({
    "Cache-Control": "public, max-age=3600",
    "Content-Type": "application/json",
  });
}

function preventCaching(response: Response): void {
  response.set({ "Cache-Control": "no-store", Pragma: "no-cache" });
}
