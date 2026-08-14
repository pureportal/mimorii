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
import { CreateMaintenanceDto, UpdateMaintenanceDto } from "./maintenance.dto.js";
import { MaintenanceService } from "./maintenance.service.js";

@ApiTags("Maintenance")
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller("teams/:teamId/maintenance")
export class MaintenanceController {
  constructor(private readonly maintenance: MaintenanceService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser, @Param("teamId") teamId: string) {
    return this.maintenance.list(user.id, teamId);
  }

  @Get(":id")
  get(
    @CurrentUser() user: AuthenticatedUser,
    @Param("teamId") teamId: string,
    @Param("id") id: string
  ) {
    return this.maintenance.get(user.id, teamId, id);
  }

  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Param("teamId") teamId: string,
    @Body() input: CreateMaintenanceDto
  ) {
    return this.maintenance.create(user.id, teamId, input);
  }

  @Patch(":id")
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param("teamId") teamId: string,
    @Param("id") id: string,
    @Body() input: UpdateMaintenanceDto
  ) {
    return this.maintenance.update(user.id, teamId, id, input);
  }

  @Post(":id/cancel")
  @HttpCode(200)
  cancel(
    @CurrentUser() user: AuthenticatedUser,
    @Param("teamId") teamId: string,
    @Param("id") id: string
  ) {
    return this.maintenance.cancel(user.id, teamId, id);
  }

  @Delete(":id")
  @HttpCode(204)
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param("teamId") teamId: string,
    @Param("id") id: string
  ) {
    return this.maintenance.remove(user.id, teamId, id);
  }
}
