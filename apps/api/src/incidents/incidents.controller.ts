import {
  Body,
  Controller,
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
import { AddIncidentUpdateDto, CreateIncidentDto, UpdateIncidentDto } from "./incidents.dto.js";
import { IncidentsService } from "./incidents.service.js";

@ApiTags("Incidents")
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller("teams/:teamId/incidents")
export class IncidentsController {
  constructor(private readonly incidents: IncidentsService) {}

  @Get()
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Param("teamId") teamId: string,
    @Query("status") status?: "active" | "resolved",
    @Query("limit") limit?: string
  ) {
    return this.incidents.list(user.id, teamId, { status, limit: Number(limit) || 100 });
  }

  @Get(":id")
  get(
    @CurrentUser() user: AuthenticatedUser,
    @Param("teamId") teamId: string,
    @Param("id") id: string
  ) {
    return this.incidents.get(user.id, teamId, id);
  }

  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Param("teamId") teamId: string,
    @Body() input: CreateIncidentDto
  ) {
    return this.incidents.create(user.id, teamId, input);
  }

  @Patch(":id")
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param("teamId") teamId: string,
    @Param("id") id: string,
    @Body() input: UpdateIncidentDto
  ) {
    return this.incidents.update(user.id, teamId, id, input);
  }

  @Post(":id/updates")
  @HttpCode(200)
  addUpdate(
    @CurrentUser() user: AuthenticatedUser,
    @Param("teamId") teamId: string,
    @Param("id") id: string,
    @Body() input: AddIncidentUpdateDto
  ) {
    return this.incidents.addUpdate(user.id, teamId, id, input);
  }
}
