import { Controller, Get, Param, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { AuthGuard } from "../auth/auth.guard.js";
import { CurrentUser } from "../auth/current-user.decorator.js";
import type { AuthenticatedUser } from "../common/rows.js";
import { TechnologiesService } from "./technologies.service.js";

@ApiTags("Technologies")
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller("teams/:teamId/resources/:resourceId/technologies")
export class TechnologiesController {
  constructor(private readonly technologies: TechnologiesService) {}

  @Get()
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Param("teamId") teamId: string,
    @Param("resourceId") resourceId: string
  ) {
    return this.technologies.list(user.id, teamId, resourceId);
  }
}
