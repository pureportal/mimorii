import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Headers,
  HttpCode,
  Param,
  Patch,
  Post,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiHeader, ApiTags } from "@nestjs/swagger";
import { AuthGuard } from "../auth/auth.guard.js";
import { CurrentUser, OptionalCurrentUser } from "../auth/current-user.decorator.js";
import { OptionalAuthGuard } from "../auth/optional-auth.guard.js";
import type { AuthenticatedUser } from "../common/rows.js";
import { CreateDashboardDto, UpdateDashboardDto } from "./dashboards.dto.js";
import { DashboardsService } from "./dashboards.service.js";

@ApiTags("Dashboards")
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller("teams/:teamId/dashboards")
export class DashboardsController {
  constructor(private readonly dashboards: DashboardsService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser, @Param("teamId") teamId: string) {
    return this.dashboards.list(user.id, teamId);
  }

  @Post()
  @Header("Cache-Control", "no-store")
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Param("teamId") teamId: string,
    @Body() input: CreateDashboardDto
  ) {
    return this.dashboards.create(user.id, teamId, input);
  }

  @Get(":id")
  get(
    @CurrentUser() user: AuthenticatedUser,
    @Param("teamId") teamId: string,
    @Param("id") id: string
  ) {
    return this.dashboards.get(user.id, teamId, id);
  }

  @Patch(":id")
  @Header("Cache-Control", "no-store")
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param("teamId") teamId: string,
    @Param("id") id: string,
    @Body() input: UpdateDashboardDto
  ) {
    return this.dashboards.update(user.id, teamId, id, input);
  }

  @Delete(":id")
  @HttpCode(204)
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param("teamId") teamId: string,
    @Param("id") id: string
  ) {
    return this.dashboards.remove(user.id, teamId, id);
  }

  @Post(":id/access-key")
  @Header("Cache-Control", "no-store")
  regenerateAccessKey(
    @CurrentUser() user: AuthenticatedUser,
    @Param("teamId") teamId: string,
    @Param("id") id: string
  ) {
    return this.dashboards.regenerateAccessKey(user.id, teamId, id);
  }

  @Delete(":id/access-key")
  @HttpCode(204)
  revokeAccessKey(
    @CurrentUser() user: AuthenticatedUser,
    @Param("teamId") teamId: string,
    @Param("id") id: string
  ) {
    return this.dashboards.revokeAccessKey(user.id, teamId, id);
  }
}

@ApiTags("Dashboard views")
@UseGuards(OptionalAuthGuard)
@Controller("dashboards")
export class DashboardViewsController {
  constructor(private readonly dashboards: DashboardsService) {}

  @Get(":slug")
  @Header("Cache-Control", "no-store")
  @Header("Referrer-Policy", "no-referrer")
  @ApiHeader({ name: "X-Dashboard-Key", required: false })
  view(
    @OptionalCurrentUser() user: AuthenticatedUser | undefined,
    @Param("slug") slug: string,
    @Headers("x-dashboard-key") accessKey: string | undefined
  ) {
    return this.dashboards.view(slug, user, accessKey);
  }
}
