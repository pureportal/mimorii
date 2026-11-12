import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  Param,
  Patch,
  Post,
  Put,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiCreatedResponse, ApiOkResponse, ApiTags } from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";
import type { AuthenticatedUser } from "../common/rows.js";
import { AuthGuard } from "./auth.guard.js";
import { ApiTokensService } from "./api-tokens.service.js";
import {
  ChangePasswordDto,
  CreateApiTokenDto,
  LoginDto,
  PasswordResetCompleteDto,
  PasswordResetRequestDto,
  PasswordResetTokenDto,
  RefreshSessionDto,
  RegisterDto,
  TourAcknowledgementParamsDto,
  UpdateProfileDto,
} from "./auth.dto.js";
import { AuthService } from "./auth.service.js";
import { CurrentUser } from "./current-user.decorator.js";
import { PasswordResetService } from "./password-reset.service.js";

@ApiTags("Authentication")
@Controller("auth")
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly apiTokens: ApiTokensService,
    private readonly passwordResets: PasswordResetService
  ) {}

  @Post("register")
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Header("Cache-Control", "no-store")
  @ApiCreatedResponse({ description: "Account and initial team created" })
  register(@Body() input: RegisterDto) {
    return this.auth.register(input);
  }

  @Post("login")
  @HttpCode(200)
  @Throttle({ default: { limit: 8, ttl: 60_000 } })
  @Header("Cache-Control", "no-store")
  @ApiOkResponse({ description: "Authenticated session" })
  login(@Body() input: LoginDto) {
    return this.auth.login(input);
  }

  @Post("password-reset")
  @HttpCode(202)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Header("Cache-Control", "no-store")
  async requestPasswordReset(@Body() input: PasswordResetRequestDto) {
    await this.passwordResets.request(input.email);
  }

  @Post("password-reset/inspect")
  @HttpCode(200)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Header("Cache-Control", "no-store")
  inspectPasswordReset(@Body() input: PasswordResetTokenDto) {
    return this.passwordResets.inspect(input.token);
  }

  @Post("password-reset/complete")
  @HttpCode(204)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Header("Cache-Control", "no-store")
  async completePasswordReset(@Body() input: PasswordResetCompleteDto) {
    await this.passwordResets.complete(input);
  }

  @Post("refresh")
  @HttpCode(200)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Header("Cache-Control", "no-store")
  @ApiOkResponse({ description: "Renewed session" })
  refresh(@Body() input: RefreshSessionDto) {
    return this.auth.refreshSession(input.refreshToken);
  }

  @Post("logout")
  @HttpCode(204)
  async logout(@Body() input: RefreshSessionDto) {
    await this.auth.revokeSession(input.refreshToken);
  }

  @Get("me")
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  current(@CurrentUser() user: AuthenticatedUser) {
    return this.auth.current(user);
  }

  @Patch("profile")
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  updateProfile(@CurrentUser() user: AuthenticatedUser, @Body() input: UpdateProfileDto) {
    return this.auth.updateProfile(user, input);
  }

  @Put("profile/tour-acknowledgements/:tourId")
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  acknowledgeTour(
    @CurrentUser() user: AuthenticatedUser,
    @Param() input: TourAcknowledgementParamsDto
  ) {
    return this.auth.acknowledgeTour(user, input.tourId);
  }

  @Post("password")
  @HttpCode(204)
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  async changePassword(@CurrentUser() user: AuthenticatedUser, @Body() input: ChangePasswordDto) {
    await this.auth.changePassword(user, input);
  }

  @Get("api-tokens")
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  apiTokenList(@CurrentUser() user: AuthenticatedUser) {
    return this.apiTokens.list(user.id);
  }

  @Post("api-tokens")
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  createApiToken(@CurrentUser() user: AuthenticatedUser, @Body() input: CreateApiTokenDto) {
    return this.apiTokens.create(user.id, input);
  }

  @Delete("api-tokens/:id")
  @HttpCode(204)
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  revokeApiToken(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string) {
    return this.apiTokens.revoke(user.id, id);
  }
}
