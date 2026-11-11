import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Header,
  HttpCode,
  Post,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiNoContentResponse, ApiOkResponse, ApiTags } from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";
import type { AuthenticatedUser } from "../common/rows.js";
import { AuthGuard } from "./auth.guard.js";
import { AuthService } from "./auth.service.js";
import { CurrentCredential, CurrentUser, type AuthCredential } from "./current-user.decorator.js";
import { TwoFactorChallengeDto, TwoFactorStepUpDto } from "./two-factor.dto.js";
import { TwoFactorSettingsService } from "./two-factor-settings.service.js";

const codeThrottle = { default: { limit: 10, ttl: 60_000 } };

@ApiTags("Authentication")
@Controller("auth/two-factor")
export class TwoFactorController {
  constructor(
    private readonly auth: AuthService,
    private readonly settings: TwoFactorSettingsService
  ) {}

  @Post("verify")
  @HttpCode(200)
  @Throttle(codeThrottle)
  @Header("Cache-Control", "no-store")
  @ApiOkResponse({ description: "Authenticated session" })
  verify(@Body() input: TwoFactorChallengeDto) {
    return this.auth.verifyTwoFactor(input);
  }

  @Post("enroll")
  @HttpCode(200)
  @Throttle(codeThrottle)
  @Header("Cache-Control", "no-store")
  @ApiOkResponse({ description: "Authenticated session and recovery codes" })
  enroll(@Body() input: TwoFactorChallengeDto) {
    return this.auth.enrollTwoFactor(input);
  }

  @Get()
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  status(@CurrentUser() user: AuthenticatedUser) {
    return this.settings.status(user.id);
  }

  @Post("recovery-codes")
  @HttpCode(200)
  @UseGuards(AuthGuard)
  @Throttle(codeThrottle)
  @Header("Cache-Control", "no-store")
  @ApiBearerAuth()
  @ApiOkResponse({ description: "New recovery codes" })
  regenerateRecoveryCodes(
    @CurrentUser() user: AuthenticatedUser,
    @Body() input: TwoFactorStepUpDto
  ) {
    return this.settings.regenerateRecoveryCodes(user, input);
  }

  @Post("replacement")
  @HttpCode(200)
  @UseGuards(AuthGuard)
  @Throttle(codeThrottle)
  @Header("Cache-Control", "no-store")
  @ApiBearerAuth()
  @ApiOkResponse({ description: "Pending authenticator setup" })
  startReplacement(@CurrentUser() user: AuthenticatedUser, @Body() input: TwoFactorStepUpDto) {
    return this.settings.startReplacement(user, input);
  }

  @Post("replacement/confirm")
  @HttpCode(204)
  @UseGuards(AuthGuard)
  @Throttle(codeThrottle)
  @ApiBearerAuth()
  @ApiNoContentResponse({ description: "Authenticator replaced" })
  async confirmReplacement(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentCredential() credential: AuthCredential | undefined,
    @Body() input: TwoFactorChallengeDto
  ) {
    if (credential?.type !== "session") {
      throw new ForbiddenException("Browser sign-in is required");
    }
    await this.settings.confirmReplacement(user, credential.id, input);
  }
}
