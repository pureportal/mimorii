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
import type { TrafficHeatmapLink } from "@mimorii/contracts";
import { AuthGuard } from "../auth/auth.guard.js";
import { CurrentUser } from "../auth/current-user.decorator.js";
import { createSignedReference } from "../common/crypto.js";
import type { AuthenticatedUser } from "../common/rows.js";
import { CreateHeatmapLinkDto, CreateTrafficSiteDto, UpdateTrafficSiteDto } from "./traffic.dto.js";
import { heatmapTokenPrefix } from "./traffic-heatmap-token.js";
import { TrafficReportsService } from "./traffic-reports.service.js";
import { TrafficSitesService } from "./traffic-sites.service.js";

const heatmapLinkLifetimeMs = 60 * 60_000;

@ApiTags("Traffic")
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller("teams/:teamId/traffic/sites")
export class TrafficController {
  constructor(
    private readonly sites: TrafficSitesService,
    private readonly reports: TrafficReportsService
  ) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser, @Param("teamId") teamId: string) {
    return this.sites.list(user.id, teamId);
  }

  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Param("teamId") teamId: string,
    @Body() input: CreateTrafficSiteDto
  ) {
    return this.sites.create(user.id, teamId, input);
  }

  @Get(":id")
  get(
    @CurrentUser() user: AuthenticatedUser,
    @Param("teamId") teamId: string,
    @Param("id") id: string
  ) {
    return this.sites.get(user.id, teamId, id);
  }

  @Patch(":id")
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param("teamId") teamId: string,
    @Param("id") id: string,
    @Body() input: UpdateTrafficSiteDto
  ) {
    return this.sites.update(user.id, teamId, id, input);
  }

  @Delete(":id")
  @HttpCode(204)
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param("teamId") teamId: string,
    @Param("id") id: string
  ) {
    return this.sites.remove(user.id, teamId, id);
  }

  @Get(":id/report")
  async report(
    @CurrentUser() user: AuthenticatedUser,
    @Param("teamId") teamId: string,
    @Param("id") id: string,
    @Query("from") from?: string,
    @Query("to") to?: string
  ) {
    await this.sites.require(user.id, teamId, id, "viewer");
    return this.reports.report(id, { from, to });
  }

  @Get(":id/live")
  async live(
    @CurrentUser() user: AuthenticatedUser,
    @Param("teamId") teamId: string,
    @Param("id") id: string
  ) {
    await this.sites.require(user.id, teamId, id, "viewer");
    return this.reports.live(id);
  }

  @Get(":id/heatmap")
  async heatmap(
    @CurrentUser() user: AuthenticatedUser,
    @Param("teamId") teamId: string,
    @Param("id") id: string,
    @Query("path") path?: string,
    @Query("device") device?: string,
    @Query("from") from?: string,
    @Query("to") to?: string
  ) {
    await this.sites.require(user.id, teamId, id, "viewer");
    return this.reports.heatmap(id, { path, device, from, to });
  }

  @Post(":id/heatmap-link")
  @HttpCode(200)
  async heatmapLink(
    @CurrentUser() user: AuthenticatedUser,
    @Param("teamId") teamId: string,
    @Param("id") id: string,
    @Body() input: CreateHeatmapLinkDto
  ): Promise<TrafficHeatmapLink> {
    const site = await this.sites.require(user.id, teamId, id, "viewer");
    const expiresAt = Date.now() + heatmapLinkLifetimeMs;
    const token = createSignedReference(heatmapTokenPrefix, `${site.id}~${expiresAt}`);
    const url = new URL(input.path, `https://${site.domains[0]}`);
    url.hash = `mimorii-heatmap=${encodeURIComponent(token)}`;
    return { url: url.toString(), expiresAt: new Date(expiresAt).toISOString() };
  }
}
