import { imageAssetMaxBytes, resourceMetricNames } from "@mimorii/contracts";
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiProduces,
  ApiTags,
} from "@nestjs/swagger";
import { FileInterceptor } from "@nestjs/platform-express";
import { createHash } from "node:crypto";
import type { Request, Response } from "express";
import { AuthGuard } from "../auth/auth.guard.js";
import { CurrentUser } from "../auth/current-user.decorator.js";
import type { AuthenticatedUser } from "../common/rows.js";
import { ResourceTelemetryService } from "../common/resource-telemetry.service.js";
import { CreateResourceDto, UpdateResourceDto } from "./resources.dto.js";
import { ResourcesService } from "./resources.service.js";
import { ResourceImagesService } from "./resource-images.service.js";

interface UploadedResourceImage {
  buffer: Buffer;
}

const ResourceImageUploadInterceptor = FileInterceptor("image", {
  limits: { fields: 0, files: 1, fileSize: imageAssetMaxBytes },
});

@ApiTags("Resources")
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller("teams/:teamId/resources")
export class ResourcesController {
  constructor(
    private readonly resources: ResourcesService,
    private readonly images: ResourceImagesService,
    private readonly telemetry: ResourceTelemetryService
  ) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser, @Param("teamId") teamId: string) {
    return this.resources.list(user.id, teamId);
  }

  @Get(":id")
  get(
    @CurrentUser() user: AuthenticatedUser,
    @Param("teamId") teamId: string,
    @Param("id") id: string
  ) {
    return this.resources.get(user.id, teamId, id);
  }

  @Get(":id/metrics")
  async metrics(
    @CurrentUser() user: AuthenticatedUser,
    @Param("teamId") teamId: string,
    @Param("id") id: string,
    @Query("from") from?: string,
    @Query("to") to?: string
  ) {
    await this.resources.get(user.id, teamId, id);
    const end = to ? new Date(to) : new Date();
    const start = from ? new Date(from) : new Date(end.getTime() - 24 * 60 * 60 * 1_000);
    if (
      !Number.isFinite(start.getTime()) ||
      !Number.isFinite(end.getTime()) ||
      start >= end ||
      end.getTime() - start.getTime() > 90 * 24 * 60 * 60 * 1_000
    ) {
      throw new BadRequestException("Choose a valid range of up to 90 days");
    }
    return this.telemetry.series(id, start.toISOString(), end.toISOString(), [
      ...resourceMetricNames,
    ]);
  }

  @Get(":id/image")
  @ApiProduces("image/png")
  @ApiOkResponse({
    description: "Resource image",
    content: { "image/png": { schema: { type: "string", format: "binary" } } },
  })
  @ApiNotFoundResponse({ description: "Resource image not found" })
  async image(
    @CurrentUser() user: AuthenticatedUser,
    @Param("teamId") teamId: string,
    @Param("id") id: string,
    @Req() request: Request,
    @Res() response: Response
  ): Promise<void> {
    const image = await this.images.image(user.id, teamId, id);
    const etag = `"${createHash("sha256").update(image.image_data).digest("base64url")}"`;
    response.set({
      "Cache-Control": "private, max-age=0, must-revalidate",
      "Content-Type": "image/png",
      ETag: etag,
      "Last-Modified": new Date(image.updated_at).toUTCString(),
    });
    if (request.headers["if-none-match"]?.split(/\s*,\s*/).includes(etag)) {
      response.status(304).end();
      return;
    }
    response.send(image.image_data);
  }

  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Param("teamId") teamId: string,
    @Body() input: CreateResourceDto
  ) {
    return this.resources.create(user.id, teamId, input);
  }

  @Patch(":id")
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param("teamId") teamId: string,
    @Param("id") id: string,
    @Body() input: UpdateResourceDto
  ) {
    return this.resources.update(user.id, teamId, id, input);
  }

  @Post(":id/image")
  @HttpCode(200)
  @ApiConsumes("multipart/form-data")
  @ApiBody({
    schema: {
      type: "object",
      required: ["image"],
      properties: { image: { type: "string", format: "binary" } },
    },
  })
  @UseInterceptors(ResourceImageUploadInterceptor)
  async replaceImage(
    @CurrentUser() user: AuthenticatedUser,
    @Param("teamId") teamId: string,
    @Param("id") id: string,
    @UploadedFile() image?: UploadedResourceImage
  ) {
    if (!image) throw new BadRequestException("Choose an image");
    const imageUpdatedAt = await this.images.replace(user.id, teamId, id, image.buffer);
    return { imageUpdatedAt };
  }

  @Post(":id/favicon")
  @HttpCode(200)
  async refreshFavicon(
    @CurrentUser() user: AuthenticatedUser,
    @Param("teamId") teamId: string,
    @Param("id") id: string
  ) {
    const imageUpdatedAt = await this.images.refreshFavicon(user.id, teamId, id);
    return { imageUpdatedAt };
  }

  @Delete(":id")
  @HttpCode(204)
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param("teamId") teamId: string,
    @Param("id") id: string
  ) {
    return this.resources.remove(user.id, teamId, id);
  }
}
