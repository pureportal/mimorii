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
import { LogSourcesService } from "./log-sources.service.js";
import { CreateLogSourceDto, UpdateLogSourceDto } from "./logs.dto.js";

@ApiTags("Logs")
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller("teams/:teamId/logs/sources")
export class LogSourcesController {
  constructor(private readonly sources: LogSourcesService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser, @Param("teamId") teamId: string) {
    return this.sources.list(user.id, teamId);
  }

  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Param("teamId") teamId: string,
    @Body() input: CreateLogSourceDto
  ) {
    return this.sources.create(user.id, teamId, input);
  }

  @Patch(":id")
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param("teamId") teamId: string,
    @Param("id") id: string,
    @Body() input: UpdateLogSourceDto
  ) {
    return this.sources.update(user.id, teamId, id, input);
  }

  @Post(":id/test")
  @HttpCode(200)
  sendTest(
    @CurrentUser() user: AuthenticatedUser,
    @Param("teamId") teamId: string,
    @Param("id") id: string
  ) {
    return this.sources.sendTest(user.id, user.name, teamId, id);
  }

  @Post(":id/rotate-token")
  @HttpCode(200)
  rotateToken(
    @CurrentUser() user: AuthenticatedUser,
    @Param("teamId") teamId: string,
    @Param("id") id: string
  ) {
    return this.sources.rotateToken(user.id, teamId, id);
  }

  @Delete(":id")
  @HttpCode(204)
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param("teamId") teamId: string,
    @Param("id") id: string
  ) {
    return this.sources.remove(user.id, teamId, id);
  }
}
