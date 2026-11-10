import { Module } from "@nestjs/common";
import { APP_INTERCEPTOR } from "@nestjs/core";
import { JwtModule } from "@nestjs/jwt";
import { PlatformSettingsModule } from "../platform-settings/platform-settings.module.js";
import { ApiTokenScopeInterceptor } from "./api-token-scope.interceptor.js";
import { ApiTokensService } from "./api-tokens.service.js";
import { AuthController } from "./auth.controller.js";
import { AuthGuard } from "./auth.guard.js";
import { AuthService } from "./auth.service.js";
import { OptionalAuthGuard } from "./optional-auth.guard.js";
import { OAuthClientMetadataService } from "./oauth-client-metadata.service.js";
import { OAuthController } from "./oauth.controller.js";
import { OAuthService } from "./oauth.service.js";
import { SessionService } from "./session.service.js";

function jwtSecret(): string {
  const configured = process.env.MIMORII_JWT_SECRET;
  if (configured && configured.length >= 32) return configured;
  if (process.env.NODE_ENV === "production") {
    throw new Error("MIMORII_JWT_SECRET must contain at least 32 characters");
  }
  return "mimorii-local-development-secret-change-me";
}

@Module({
  imports: [
    PlatformSettingsModule,
    JwtModule.register({
      secret: jwtSecret(),
      signOptions: { issuer: "mimorii", audience: "mimorii-web" },
      verifyOptions: { issuer: "mimorii", audience: "mimorii-web" },
    }),
  ],
  controllers: [AuthController, OAuthController],
  providers: [
    AuthService,
    AuthGuard,
    OptionalAuthGuard,
    ApiTokensService,
    OAuthClientMetadataService,
    OAuthService,
    SessionService,
    { provide: APP_INTERCEPTOR, useClass: ApiTokenScopeInterceptor },
  ],
  exports: [AuthService, AuthGuard, OptionalAuthGuard, OAuthService, JwtModule],
})
export class AuthModule {}
