import { Controller, Get, Logger, Param, Query, Res, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiProduces, ApiTags } from "@nestjs/swagger";
import type { Response } from "express";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { AuthGuard } from "../auth/auth.guard.js";
import { CurrentUser } from "../auth/current-user.decorator.js";
import type { AuthenticatedUser } from "../common/rows.js";
import { ExportsService, type ExportQuery } from "./exports.service.js";

@ApiTags("Exports")
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller("teams/:teamId/exports")
export class ExportsController {
  private readonly logger = new Logger(ExportsController.name);

  constructor(private readonly exports: ExportsService) {}

  @Get()
  catalog(@CurrentUser() user: AuthenticatedUser, @Param("teamId") teamId: string) {
    return this.exports.catalog(user.id, teamId);
  }

  @Get(":dataset")
  @ApiProduces("text/csv", "application/json", "application/x-ndjson")
  async download(
    @CurrentUser() user: AuthenticatedUser,
    @Param("teamId") teamId: string,
    @Param("dataset") dataset: string,
    @Query() query: ExportQuery,
    @Res() response: Response
  ): Promise<void> {
    const prepared = await this.exports.prepare(user.id, teamId, dataset, query);
    response.set({
      "Content-Type": prepared.mediaType,
      "Content-Disposition": `attachment; filename="${prepared.filename}"`,
      "Cache-Control": "no-store",
    });
    try {
      await pipeline(Readable.from(prepared.body), response);
    } catch (error) {
      this.logger.warn(
        `Export ${dataset} stopped: ${error instanceof Error ? error.message : String(error)}`
      );
      response.destroy();
    }
  }
}
