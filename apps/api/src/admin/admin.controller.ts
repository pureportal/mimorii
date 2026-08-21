import { imageAssetMaxBytes } from "@mimorii/contracts";
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
  ApiExtraModels,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiProduces,
  ApiTags,
  getSchemaPath,
} from "@nestjs/swagger";
import { FileInterceptor } from "@nestjs/platform-express";
import { createHash } from "node:crypto";
import type { Request, Response } from "express";
import { AuthGuard } from "../auth/auth.guard.js";
import { CurrentUser } from "../auth/current-user.decorator.js";
import type { AuthenticatedUser } from "../common/rows.js";
import { PlatformSettingsService } from "../platform-settings/platform-settings.service.js";
import { optimizeImageAsset } from "../common/image-asset.js";
import {
  CreateSponsorDto,
  DeleteSponsorDto,
  ReorderSponsorsDto,
  ReviewSponsorshipApplicationDto,
  UpdateGlobalUserAccessDto,
  UpdatePlatformSettingsDto,
  UpdateSponsorDto,
} from "./admin.dto.js";
import { AdminSponsorshipsService } from "./admin-sponsorships.service.js";
import { AdminUsersService } from "./admin-users.service.js";
import { AdminService } from "./admin.service.js";
import { GlobalAdminGuard } from "./global-admin.guard.js";

interface UploadedFavicon {
  buffer: Buffer;
}

const FaviconUploadInterceptor = FileInterceptor("favicon", {
  limits: { fields: 7, files: 1, fileSize: imageAssetMaxBytes },
});

@ApiTags("Global administration")
@ApiBearerAuth()
@ApiExtraModels(CreateSponsorDto, UpdateSponsorDto)
@UseGuards(AuthGuard, GlobalAdminGuard)
@Controller("admin")
export class AdminController {
  constructor(
    private readonly admin: AdminService,
    private readonly users: AdminUsersService,
    private readonly sponsorships: AdminSponsorshipsService,
    private readonly settings: PlatformSettingsService
  ) {}

  @Get("statistics")
  statistics() {
    return this.admin.statistics();
  }

  @Get("users")
  userList(
    @Query("search") search?: string,
    @Query("status") status?: string,
    @Query("limit") limit?: string,
    @Query("offset") offset?: string
  ) {
    return this.users.list({ search, status, limit, offset });
  }

  @Patch("users/:id/access")
  updateUserAccess(
    @CurrentUser() actor: AuthenticatedUser,
    @Param("id") id: string,
    @Body() input: UpdateGlobalUserAccessDto
  ) {
    return this.users.updateAccess(actor, id, input);
  }

  @Post("users/:id/revoke-sessions")
  @HttpCode(204)
  revokeUserSessions(@CurrentUser() actor: AuthenticatedUser, @Param("id") id: string) {
    return this.users.revokeSessions(actor.id, id);
  }

  @Get("settings")
  platformSettings() {
    return this.settings.get();
  }

  @Patch("settings")
  updatePlatformSettings(
    @CurrentUser() actor: AuthenticatedUser,
    @Body() input: UpdatePlatformSettingsDto
  ) {
    return this.settings.update(actor.id, input);
  }

  @Get("sponsorship-applications")
  sponsorshipApplications(
    @Query("status") status?: string,
    @Query("limit") limit?: string,
    @Query("offset") offset?: string
  ) {
    return this.sponsorships.applications({ status, limit, offset });
  }

  @Patch("sponsorship-applications/:id")
  reviewSponsorshipApplication(
    @CurrentUser() actor: AuthenticatedUser,
    @Param("id") id: string,
    @Body() input: ReviewSponsorshipApplicationDto
  ) {
    return this.sponsorships.review(actor.id, id, input);
  }

  @Get("sponsors")
  sponsors() {
    return this.sponsorships.sponsors();
  }

  @Get("sponsors/:id/favicon")
  @ApiProduces("image/png")
  @ApiOkResponse({
    description: "Sponsor image",
    content: { "image/png": { schema: { type: "string", format: "binary" } } },
  })
  @ApiNotFoundResponse({ description: "Sponsor image not found" })
  async sponsorFavicon(
    @Param("id") id: string,
    @Req() request: Request,
    @Res() response: Response
  ): Promise<void> {
    const favicon = await this.sponsorships.sponsorFavicon(id);
    const etag = `"${createHash("sha256").update(favicon.favicon_data).digest("base64url")}"`;
    response.set({
      "Cache-Control": "private, max-age=0, must-revalidate",
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

  @Post("sponsors")
  @ApiConsumes("multipart/form-data")
  @ApiBody({
    schema: {
      allOf: [
        { $ref: getSchemaPath(CreateSponsorDto) },
        { type: "object", properties: { favicon: { type: "string", format: "binary" } } },
      ],
    },
  })
  @UseInterceptors(FaviconUploadInterceptor)
  async createSponsor(
    @CurrentUser() actor: AuthenticatedUser,
    @Body() input: CreateSponsorDto,
    @UploadedFile() favicon?: UploadedFavicon
  ) {
    const faviconData = favicon ? await optimizeImageAsset(favicon.buffer, 64) : undefined;
    return this.sponsorships.createSponsor(actor.id, input, faviconData);
  }

  @Patch("sponsors/order")
  reorderSponsors(@CurrentUser() actor: AuthenticatedUser, @Body() input: ReorderSponsorsDto) {
    return this.sponsorships.reorderSponsors(actor.id, input);
  }

  @Patch("sponsors/:id")
  @ApiConsumes("multipart/form-data")
  @ApiBody({
    schema: {
      allOf: [
        { $ref: getSchemaPath(UpdateSponsorDto) },
        { type: "object", properties: { favicon: { type: "string", format: "binary" } } },
      ],
    },
  })
  @UseInterceptors(FaviconUploadInterceptor)
  async updateSponsor(
    @CurrentUser() actor: AuthenticatedUser,
    @Param("id") id: string,
    @Body() input: UpdateSponsorDto,
    @UploadedFile() favicon?: UploadedFavicon
  ) {
    if (favicon && input.removeFavicon) {
      throw new BadRequestException("Choose either a replacement image or removal");
    }
    const faviconData = favicon ? await optimizeImageAsset(favicon.buffer, 64) : undefined;
    return this.sponsorships.updateSponsor(actor.id, id, input, faviconData);
  }

  @Delete("sponsors/:id")
  @HttpCode(204)
  removeSponsor(
    @CurrentUser() actor: AuthenticatedUser,
    @Param("id") id: string,
    @Body() input: DeleteSponsorDto
  ) {
    return this.sponsorships.removeSponsor(actor.id, id, input.expectedUpdatedAt);
  }

  @Get("audit")
  audit(
    @Query("limit") limit?: string,
    @Query("before") before?: string,
    @Query("action") action?: string
  ) {
    return this.admin.audit({ limit, before, action });
  }
}
