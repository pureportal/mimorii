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
import { CreateAgentDto, UpdateAgentDto } from "./agents.dto.js";
import { AgentsService } from "./agents.service.js";

@ApiTags("Agents")
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller("teams/:teamId/agents")
export class AgentsController {
  constructor(private readonly agents: AgentsService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser, @Param("teamId") teamId: string) {
    return this.agents.list(user.id, teamId);
  }

  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Param("teamId") teamId: string,
    @Body() input: CreateAgentDto
  ) {
    return this.agents.create(user.id, teamId, input);
  }

  @Post(":id/rotate-key")
  @HttpCode(200)
  rotate(
    @CurrentUser() user: AuthenticatedUser,
    @Param("teamId") teamId: string,
    @Param("id") id: string
  ) {
    return this.agents.rotate(user.id, teamId, id);
  }

  @Patch(":id")
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param("teamId") teamId: string,
    @Param("id") id: string,
    @Body() input: UpdateAgentDto
  ) {
    return this.agents.update(user.id, teamId, id, input);
  }

  @Get(":id/snapshots")
  snapshots(
    @CurrentUser() user: AuthenticatedUser,
    @Param("teamId") teamId: string,
    @Param("id") id: string,
    @Query("limit") limit?: string
  ) {
    return this.agents.snapshots(user.id, teamId, id, limit ? Number(limit) : undefined);
  }

  @Get(":id/device-status")
  deviceStatus(
    @CurrentUser() user: AuthenticatedUser,
    @Param("teamId") teamId: string,
    @Param("id") id: string
  ) {
    return this.agents.deviceStatus(user.id, teamId, id);
  }

  @Delete(":id")
  @HttpCode(204)
  revoke(
    @CurrentUser() user: AuthenticatedUser,
    @Param("teamId") teamId: string,
    @Param("id") id: string
  ) {
    return this.agents.revoke(user.id, teamId, id);
  }
}
