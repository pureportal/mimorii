import { Body, Controller, Get, Param, Post, Req, Res } from "@nestjs/common";
import {
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiProduces,
  ApiTags,
} from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";
import { createHash } from "node:crypto";
import type { Request, Response } from "express";
import { CreateSponsorshipApplicationDto } from "./sponsors.dto.js";
import { SponsorsService } from "./sponsors.service.js";

@ApiTags("Sponsors")
@Controller("sponsors")
export class SponsorsController {
  constructor(private readonly sponsors: SponsorsService) {}

  @Get()
  @ApiOkResponse({ description: "Published sponsors" })
  list() {
    return this.sponsors.list();
  }

  @Get(":id/favicon")
  @ApiProduces("image/png")
  @ApiOkResponse({
    description: "Sponsor favicon",
    content: { "image/png": { schema: { type: "string", format: "binary" } } },
  })
  @ApiNotFoundResponse({ description: "Published sponsor favicon not found" })
  async favicon(
    @Param("id") id: string,
    @Req() request: Request,
    @Res() response: Response
  ): Promise<void> {
    const favicon = await this.sponsors.favicon(id);
    const etag = `"${createHash("sha256").update(favicon.favicon_data).digest("base64url")}"`;
    response.set({
      "Cache-Control": "public, max-age=0, must-revalidate",
      "Content-Type": "image/png",
      ETag: etag,
      "Last-Modified": new Date(favicon.favicon_updated_at).toUTCString(),
    });
    if (request.headers["if-none-match"]?.split(/\s*,\s*/).includes(etag)) {
      response.status(304).end();
      return;
    }
    response.send(favicon.favicon_data);
  }

  @Post("applications")
  @Throttle({ default: { limit: 3, ttl: 3_600_000 } })
  @ApiCreatedResponse({ description: "Sponsorship application received" })
  apply(@Body() input: CreateSponsorshipApplicationDto) {
    return this.sponsors.apply(input);
  }
}
