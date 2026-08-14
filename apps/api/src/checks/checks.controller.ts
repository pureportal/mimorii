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
import { ApiBearerAuth, ApiQuery, ApiTags } from "@nestjs/swagger";
import { AuthGuard } from "../auth/auth.guard.js";
import { CurrentUser } from "../auth/current-user.decorator.js";
import type { AuthenticatedUser } from "../common/rows.js";
import { CheckOrchestratorService } from "./check-orchestrator.service.js";
import { CreateCheckDto, UpdateCheckDto } from "./checks.dto.js";
import { ChecksService } from "./checks.service.js";

@ApiTags("Checks")
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller("teams/:teamId/checks")
export class ChecksController {
  constructor(
    private readonly checks: ChecksService,
    private readonly orchestrator: CheckOrchestratorService
  ) {}

  @Get()
  @ApiQuery({ name: "resourceId", required: false })
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Param("teamId") teamId: string,
    @Query("resourceId") resourceId?: string
  ) {
    return this.checks.list(user.id, teamId, resourceId);
  }

  @Get(":id")
  get(
    @CurrentUser() user: AuthenticatedUser,
    @Param("teamId") teamId: string,
    @Param("id") id: string
  ) {
    return this.checks.get(user.id, teamId, id);
  }

  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Param("teamId") teamId: string,
    @Body() input: CreateCheckDto
  ) {
    return this.checks.create(user.id, teamId, input);
  }

  @Patch(":id")
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param("teamId") teamId: string,
    @Param("id") id: string,
    @Body() input: UpdateCheckDto
  ) {
    return this.checks.update(user.id, teamId, id, input);
  }

  @Delete(":id")
  @HttpCode(204)
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param("teamId") teamId: string,
    @Param("id") id: string
  ) {
    return this.checks.remove(user.id, teamId, id);
  }

  @Get(":id/history")
  history(
    @CurrentUser() user: AuthenticatedUser,
    @Param("teamId") teamId: string,
    @Param("id") id: string,
    @Query("from") from?: string,
    @Query("to") to?: string,
    @Query("limit") limit?: string
  ) {
    return this.checks.history(user.id, teamId, id, {
      from,
      to,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Post(":id/run")
  @HttpCode(200)
  run(
    @CurrentUser() user: AuthenticatedUser,
    @Param("teamId") teamId: string,
    @Param("id") id: string
  ) {
    return this.orchestrator.runNow(user.id, teamId, id);
  }
}
