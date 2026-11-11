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
import { LogAlertsService } from "./log-alerts.service.js";
import {
  CreateLogAlertRuleDto,
  PreviewLogAlertRuleDto,
  UpdateLogAlertRuleDto,
} from "./logs.dto.js";

@ApiTags("Logs")
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller("teams/:teamId/logs/alerts")
export class LogAlertsController {
  constructor(private readonly alerts: LogAlertsService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser, @Param("teamId") teamId: string) {
    return this.alerts.list(user.id, teamId);
  }

  @Post("preview")
  @HttpCode(200)
  preview(
    @CurrentUser() user: AuthenticatedUser,
    @Param("teamId") teamId: string,
    @Body() input: PreviewLogAlertRuleDto
  ) {
    return this.alerts.preview(user.id, teamId, input);
  }

  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Param("teamId") teamId: string,
    @Body() input: CreateLogAlertRuleDto
  ) {
    return this.alerts.create(user.id, teamId, input);
  }

  @Patch(":id")
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param("teamId") teamId: string,
    @Param("id") id: string,
    @Body() input: UpdateLogAlertRuleDto
  ) {
    return this.alerts.update(user.id, teamId, id, input);
  }

  @Delete(":id")
  @HttpCode(204)
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param("teamId") teamId: string,
    @Param("id") id: string
  ) {
    return this.alerts.remove(user.id, teamId, id);
  }
}
