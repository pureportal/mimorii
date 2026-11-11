import { Body, Controller, Delete, Get, HttpCode, Param, Post, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { AuthGuard } from "../auth/auth.guard.js";
import { CurrentUser } from "../auth/current-user.decorator.js";
import type { AuthenticatedUser } from "../common/rows.js";
import { LogSavedSearchesService } from "./log-saved-searches.service.js";
import { CreateLogSavedSearchDto } from "./logs.dto.js";

@ApiTags("Logs")
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller("teams/:teamId/logs/searches")
export class LogSavedSearchesController {
  constructor(private readonly searches: LogSavedSearchesService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser, @Param("teamId") teamId: string) {
    return this.searches.list(user.id, teamId);
  }

  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Param("teamId") teamId: string,
    @Body() input: CreateLogSavedSearchDto
  ) {
    return this.searches.create(user.id, teamId, input);
  }

  @Delete(":id")
  @HttpCode(204)
  async remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param("teamId") teamId: string,
    @Param("id") id: string
  ): Promise<void> {
    await this.searches.remove(user.id, teamId, id);
  }
}
