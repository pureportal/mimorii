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
import { CreateObjectiveDto, UpdateObjectiveDto } from "./objectives.dto.js";
import { ObjectivesService } from "./objectives.service.js";

@ApiTags("Service objectives")
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller("teams/:teamId/objectives")
export class ObjectivesController {
  constructor(private readonly objectives: ObjectivesService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser, @Param("teamId") teamId: string) {
    return this.objectives.list(user.id, teamId);
  }

  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Param("teamId") teamId: string,
    @Body() input: CreateObjectiveDto
  ) {
    return this.objectives.create(user.id, teamId, input);
  }

  @Patch(":id")
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param("teamId") teamId: string,
    @Param("id") id: string,
    @Body() input: UpdateObjectiveDto
  ) {
    return this.objectives.update(user.id, teamId, id, input);
  }

  @Delete(":id")
  @HttpCode(204)
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param("teamId") teamId: string,
    @Param("id") id: string
  ) {
    return this.objectives.remove(user.id, teamId, id);
  }
}
