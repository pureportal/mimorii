import { Controller, Get, Param, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { AuthGuard } from "../auth/auth.guard.js";
import { CurrentUser } from "../auth/current-user.decorator.js";
import type { AuthenticatedUser } from "../common/rows.js";
import { AnalyticsService } from "./analytics.service.js";

@ApiTags("Analytics")
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller("teams/:teamId/analytics")
export class AnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  @Get("overview")
  overview(@CurrentUser() user: AuthenticatedUser, @Param("teamId") teamId: string) {
    return this.analytics.overview(user.id, teamId);
  }

  @Get("report")
  report(
    @CurrentUser() user: AuthenticatedUser,
    @Param("teamId") teamId: string,
    @Query("from") from?: string,
    @Query("to") to?: string,
    @Query("resourceId") resourceId?: string,
    @Query("checkId") checkId?: string
  ) {
    return this.analytics.report(user.id, teamId, { from, to, resourceId, checkId });
  }
}
