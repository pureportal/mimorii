import {
  Controller,
  Get,
  Header,
  HttpCode,
  Post,
  Query,
  Req,
  UnauthorizedException,
} from "@nestjs/common";
import { ApiExcludeController } from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";
import type { Request } from "express";
import { trackerScript } from "./tracker-script.js";
import { TrafficCollectorService } from "./traffic-collector.service.js";
import { verifiedHeatmapSite } from "./traffic-heatmap-token.js";
import { TrafficReportsService } from "./traffic-reports.service.js";

const collectRateLimit = Math.min(
  Math.max(Number(process.env.MIMORII_TRAFFIC_RATE_LIMIT) || 600, 10),
  100_000
);

@ApiExcludeController()
@Controller("traffic")
export class TrafficPublicController {
  constructor(
    private readonly collector: TrafficCollectorService,
    private readonly reports: TrafficReportsService
  ) {}

  @Get("script.js")
  @Header("Content-Type", "application/javascript; charset=utf-8")
  @Header("Cache-Control", "public, max-age=3600")
  script(): string {
    return trackerScript;
  }

  @Post("collect")
  @HttpCode(202)
  @Throttle({ default: { limit: collectRateLimit, ttl: 60_000 } })
  async collect(@Req() request: Request): Promise<{ heatmaps: boolean }> {
    const result = await this.collector.collect(request.body, {
      ip: request.ip ?? "",
      userAgent: request.get("user-agent") ?? "",
    });
    return { heatmaps: result.accepted && result.heatmaps };
  }

  @Get("heatmap")
  @Header("Cache-Control", "no-store")
  overlay(
    @Query("token") token?: string,
    @Query("path") path?: string,
    @Query("device") device?: string
  ) {
    const siteId = verifiedHeatmapSite(token);
    if (!siteId) throw new UnauthorizedException("Heatmap link expired");
    return this.reports.overlay(siteId, { path, device });
  }
}
