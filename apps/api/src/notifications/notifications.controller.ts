import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { AuthGuard } from "../auth/auth.guard.js";
import { CurrentUser } from "../auth/current-user.decorator.js";
import type { AuthenticatedUser } from "../common/rows.js";
import { NotificationPoliciesService } from "./notification-policies.service.js";
import {
  CreateNotificationChannelDto,
  CreateNotificationPolicyDto,
  RegisterAndroidEndpointDto,
  RegisterWebPushEndpointDto,
  UpdateNotificationChannelDto,
  UpdateNotificationPolicyDto,
} from "./notifications.dto.js";
import { NotificationsService } from "./notifications.service.js";
import { PushEndpointsService } from "./push-endpoints.service.js";

@ApiTags("Notifications")
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller("teams/:teamId/notifications")
export class NotificationsController {
  constructor(
    private readonly notifications: NotificationsService,
    private readonly policyService: NotificationPoliciesService,
    private readonly pushEndpoints: PushEndpointsService
  ) {}

  @Get("channels")
  list(@CurrentUser() user: AuthenticatedUser, @Param("teamId") teamId: string) {
    return this.notifications.list(user.id, teamId);
  }

  @Get("push")
  push(@CurrentUser() user: AuthenticatedUser, @Param("teamId") teamId: string) {
    return this.pushEndpoints.capabilities(user.id, teamId);
  }

  @Post("endpoints/web")
  registerWebEndpoint(
    @CurrentUser() user: AuthenticatedUser,
    @Param("teamId") teamId: string,
    @Body() input: RegisterWebPushEndpointDto
  ) {
    return this.pushEndpoints.registerWeb(user.id, teamId, input);
  }

  @Post("endpoints/android")
  registerAndroidEndpoint(
    @CurrentUser() user: AuthenticatedUser,
    @Param("teamId") teamId: string,
    @Body() input: RegisterAndroidEndpointDto
  ) {
    return this.pushEndpoints.registerAndroid(user.id, teamId, input);
  }

  @Delete("endpoints/:id")
  @HttpCode(204)
  removeEndpoint(
    @CurrentUser() user: AuthenticatedUser,
    @Param("teamId") teamId: string,
    @Param("id") id: string
  ) {
    return this.pushEndpoints.remove(user.id, teamId, id);
  }

  @Post("channels")
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Param("teamId") teamId: string,
    @Body() input: CreateNotificationChannelDto
  ) {
    return this.notifications.create(user.id, teamId, input);
  }

  @Patch("channels/:id")
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param("teamId") teamId: string,
    @Param("id") id: string,
    @Body() input: UpdateNotificationChannelDto
  ) {
    return this.notifications.update(user.id, teamId, id, input);
  }

  @Post("channels/:id/test")
  @HttpCode(200)
  test(
    @CurrentUser() user: AuthenticatedUser,
    @Param("teamId") teamId: string,
    @Param("id") id: string
  ) {
    return this.notifications.test(user.id, teamId, id);
  }

  @Delete("channels/:id")
  @HttpCode(204)
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param("teamId") teamId: string,
    @Param("id") id: string
  ) {
    return this.notifications.remove(user.id, teamId, id);
  }

  @Get("policies")
  policies(@CurrentUser() user: AuthenticatedUser, @Param("teamId") teamId: string) {
    return this.policyService.list(user.id, teamId);
  }

  @Post("policies")
  createPolicy(
    @CurrentUser() user: AuthenticatedUser,
    @Param("teamId") teamId: string,
    @Body() input: CreateNotificationPolicyDto
  ) {
    return this.policyService.create(user.id, teamId, input);
  }

  @Patch("policies/:id")
  updatePolicy(
    @CurrentUser() user: AuthenticatedUser,
    @Param("teamId") teamId: string,
    @Param("id") id: string,
    @Body() input: UpdateNotificationPolicyDto
  ) {
    return this.policyService.update(user.id, teamId, id, input);
  }

  @Delete("policies/:id")
  @HttpCode(204)
  removePolicy(
    @CurrentUser() user: AuthenticatedUser,
    @Param("teamId") teamId: string,
    @Param("id") id: string
  ) {
    return this.policyService.remove(user.id, teamId, id);
  }

  @Get("deliveries")
  deliveries(
    @CurrentUser() user: AuthenticatedUser,
    @Param("teamId") teamId: string,
    @Query("limit") limit?: string
  ) {
    return this.notifications.deliveries(user.id, teamId, Number(limit) || 100);
  }

  @Post("deliveries/:id/retry")
  @HttpCode(200)
  retry(
    @CurrentUser() user: AuthenticatedUser,
    @Param("teamId") teamId: string,
    @Param("id") id: string
  ) {
    return this.notifications.retry(user.id, teamId, id);
  }
}
