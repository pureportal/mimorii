import { Body, Controller, Get, Param, Patch, Query, Res, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import type { Response } from "express";
import { responseAbortSignal } from "../common/abort-signal.js";
import { AuthGuard } from "../auth/auth.guard.js";
import { CurrentUser } from "../auth/current-user.decorator.js";
import type { AuthenticatedUser } from "../common/rows.js";
import { LogInsightsService } from "./log-insights.service.js";
import { LogSettingsService } from "./log-settings.service.js";
import {
  LogContextQueryDto,
  LogEntriesQueryDto,
  LogPatternsQueryDto,
  LogRangeQueryDto,
  UpdateTeamLogSettingsDto,
} from "./logs.dto.js";
import { LogsQueryService } from "./logs-query.service.js";

@ApiTags("Logs")
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller("teams/:teamId/logs")
export class LogsController {
  constructor(
    private readonly logs: LogsQueryService,
    private readonly insights: LogInsightsService,
    private readonly settings: LogSettingsService
  ) {}

  @Get()
  entries(
    @CurrentUser() user: AuthenticatedUser,
    @Param("teamId") teamId: string,
    @Query() input: LogEntriesQueryDto,
    @Res({ passthrough: true }) response: Response
  ) {
    return this.logs.entries(user.id, teamId, input, responseAbortSignal(response));
  }

  @Get("volume")
  volume(
    @CurrentUser() user: AuthenticatedUser,
    @Param("teamId") teamId: string,
    @Query() input: LogRangeQueryDto,
    @Res({ passthrough: true }) response: Response
  ) {
    return this.logs.volume(user.id, teamId, input, responseAbortSignal(response));
  }

  @Get("patterns")
  patterns(
    @CurrentUser() user: AuthenticatedUser,
    @Param("teamId") teamId: string,
    @Query() input: LogPatternsQueryDto,
    @Res({ passthrough: true }) response: Response
  ) {
    return this.insights.patterns(user.id, teamId, input, responseAbortSignal(response));
  }

  @Get("fields")
  fields(
    @CurrentUser() user: AuthenticatedUser,
    @Param("teamId") teamId: string,
    @Query() input: LogRangeQueryDto,
    @Res({ passthrough: true }) response: Response
  ) {
    return this.insights.fields(user.id, teamId, input, responseAbortSignal(response));
  }

  @Get("labels")
  labels(
    @CurrentUser() user: AuthenticatedUser,
    @Param("teamId") teamId: string,
    @Query() input: LogRangeQueryDto
  ) {
    return this.logs.labels(user.id, teamId, input);
  }

  @Get("entries/:entryId/context")
  context(
    @CurrentUser() user: AuthenticatedUser,
    @Param("teamId") teamId: string,
    @Param("entryId") entryId: string,
    @Query() input: LogContextQueryDto
  ) {
    return this.logs.context(user.id, teamId, entryId, input.limit);
  }

  @Get("settings")
  getSettings(@CurrentUser() user: AuthenticatedUser, @Param("teamId") teamId: string) {
    return this.settings.get(user.id, teamId);
  }

  @Patch("settings")
  updateSettings(
    @CurrentUser() user: AuthenticatedUser,
    @Param("teamId") teamId: string,
    @Body() input: UpdateTeamLogSettingsDto
  ) {
    return this.settings.updateRetention(user.id, teamId, input.retentionDays);
  }
}
