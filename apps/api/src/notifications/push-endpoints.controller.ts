import { Body, Controller, Delete, Get, HttpCode, Param, Post, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { AuthGuard } from "../auth/auth.guard.js";
import { CurrentUser } from "../auth/current-user.decorator.js";
import type { AuthenticatedUser } from "../common/rows.js";
import { RegisterAndroidEndpointDto, RegisterWebPushEndpointDto } from "./notifications.dto.js";
import { PushEndpointsService } from "./push-endpoints.service.js";

@ApiTags("Notifications")
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller("notifications")
export class PushEndpointsController {
  constructor(private readonly pushEndpoints: PushEndpointsService) {}

  @Get("push")
  capabilities(@CurrentUser() user: AuthenticatedUser) {
    return this.pushEndpoints.capabilities(user.id);
  }

  @Post("endpoints/web")
  registerWeb(@CurrentUser() user: AuthenticatedUser, @Body() input: RegisterWebPushEndpointDto) {
    return this.pushEndpoints.registerWeb(user.id, input);
  }

  @Post("endpoints/android")
  registerAndroid(
    @CurrentUser() user: AuthenticatedUser,
    @Body() input: RegisterAndroidEndpointDto
  ) {
    return this.pushEndpoints.registerAndroid(user.id, input);
  }

  @Delete("endpoints/:id")
  @HttpCode(204)
  remove(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string) {
    return this.pushEndpoints.remove(user.id, id);
  }
}
