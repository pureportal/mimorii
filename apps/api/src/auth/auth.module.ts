import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { PlatformSettingsModule } from "../platform-settings/platform-settings.module.js";
import { ApiTokensService } from "./api-tokens.service.js";
import { AuthController } from "./auth.controller.js";
import { AuthGuard } from "./auth.guard.js";
import { AuthService } from "./auth.service.js";
import { OptionalAuthGuard } from "./optional-auth.guard.js";

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
  controllers: [AuthController],
  providers: [AuthService, AuthGuard, OptionalAuthGuard, ApiTokensService],
  exports: [AuthService, AuthGuard, OptionalAuthGuard, JwtModule],
})
export class AuthModule {}
