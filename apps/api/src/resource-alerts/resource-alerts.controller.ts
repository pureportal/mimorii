import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { AuthGuard } from "../auth/auth.guard.js";
import { CurrentUser } from "../auth/current-user.decorator.js";
import type { AuthenticatedUser } from "../common/rows.js";
import { CreateResourceAlertDto, UpdateResourceAlertDto } from "./resource-alerts.dto.js";
import { ResourceAlertsService } from "./resource-alerts.service.js";

@ApiTags("Resource alerts")
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller("teams/:teamId/resources/:resourceId/alerts")
export class ResourceAlertsController {
  constructor(private readonly alerts: ResourceAlertsService) {}

  @Get()
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Param("teamId") teamId: string,
    @Param("resourceId") resourceId: string
  ) {
    return this.alerts.list(user.id, teamId, resourceId);
  }

  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Param("teamId") teamId: string,
    @Param("resourceId") resourceId: string,
    @Body() input: CreateResourceAlertDto
  ) {
    return this.alerts.create(user.id, teamId, resourceId, input);
  }

  @Patch(":id")
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param("teamId") teamId: string,
    @Param("resourceId") resourceId: string,
    @Param("id") id: string,
    @Body() input: UpdateResourceAlertDto
  ) {
    return this.alerts.update(user.id, teamId, resourceId, id, input);
  }

  @Delete(":id")
  @HttpCode(204)
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param("teamId") teamId: string,
    @Param("resourceId") resourceId: string,
    @Param("id") id: string
  ) {
    return this.alerts.remove(user.id, teamId, resourceId, id);
  }
}
