import { imageAssetMaxBytes } from "@mimorii/contracts";
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Req,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiProduces,
  ApiTags,
} from "@nestjs/swagger";
import { createHash } from "node:crypto";
import type { Request, Response } from "express";
import { AuthGuard } from "../auth/auth.guard.js";
import { CurrentUser } from "../auth/current-user.decorator.js";
import type { AuthenticatedUser } from "../common/rows.js";
import {
  CreateTeamDto,
  DeleteTeamDto,
  InviteMemberDto,
  UpdateMemberRoleDto,
  UpdateTeamDto,
} from "./teams.dto.js";
import { TeamsService } from "./teams.service.js";
import { TeamLogosService } from "./team-logos.service.js";

interface UploadedTeamLogo {
  buffer: Buffer;
}

const TeamLogoUploadInterceptor = FileInterceptor("logo", {
  limits: { fields: 1, files: 1, fileSize: imageAssetMaxBytes },
});

const teamMutationBody = {
  schema: {
    type: "object" as const,
    required: ["name"],
    properties: {
      name: { type: "string", minLength: 2, maxLength: 80 },
      logo: { type: "string", format: "binary" },
    },
  },
};

@ApiTags("Teams")
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller()
export class TeamsController {
  constructor(
    private readonly teams: TeamsService,
    private readonly logos: TeamLogosService
  ) {}

  @Get("teams")
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.teams.list(user.id);
  }

  @Post("teams")
  @ApiConsumes("application/json", "multipart/form-data")
  @ApiBody(teamMutationBody)
  @UseInterceptors(TeamLogoUploadInterceptor)
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() input: CreateTeamDto,
    @UploadedFile() logo?: UploadedTeamLogo
  ) {
    return this.teams.create(user.id, input, logo?.buffer);
  }

  @Get("teams/:teamId/logo")
  @ApiProduces("image/png")
  @ApiOkResponse({
    description: "Team logo",
    content: { "image/png": { schema: { type: "string", format: "binary" } } },
  })
  @ApiNotFoundResponse({ description: "Team logo not found" })
  async logo(
    @CurrentUser() user: AuthenticatedUser,
    @Param("teamId") teamId: string,
    @Req() request: Request,
    @Res() response: Response
  ): Promise<void> {
    const logo = await this.logos.image(user.id, teamId);
    const etag = `"${createHash("sha256").update(logo.image_data).digest("base64url")}"`;
    response.set({
      "Cache-Control": "private, max-age=0, must-revalidate",
      "Content-Type": "image/png",
      ETag: etag,
      "Last-Modified": new Date(logo.updated_at).toUTCString(),
    });
    if (request.headers["if-none-match"]?.split(/\s*,\s*/).includes(etag)) {
      response.status(304).end();
      return;
    }
    response.send(logo.image_data);
  }

  @Patch("teams/:teamId")
  @ApiConsumes("application/json", "multipart/form-data")
  @ApiBody(teamMutationBody)
  @UseInterceptors(TeamLogoUploadInterceptor)
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param("teamId") teamId: string,
    @Body() input: UpdateTeamDto,
    @UploadedFile() logo?: UploadedTeamLogo
  ) {
    return this.teams.update(user.id, teamId, input, logo?.buffer);
  }

  @Delete("teams/:teamId")
  @HttpCode(204)
  removeTeam(
    @CurrentUser() user: AuthenticatedUser,
    @Param("teamId") teamId: string,
    @Body() input: DeleteTeamDto
  ) {
    return this.teams.remove(user.id, teamId, input);
  }

  @Get("teams/:teamId/members")
  members(@CurrentUser() user: AuthenticatedUser, @Param("teamId") teamId: string) {
    return this.teams.members(user.id, teamId);
  }

  @Get("teams/:teamId/invitations")
  invitations(@CurrentUser() user: AuthenticatedUser, @Param("teamId") teamId: string) {
    return this.teams.invitations(user.id, teamId);
  }

  @Post("teams/:teamId/invitations")
  invite(
    @CurrentUser() user: AuthenticatedUser,
    @Param("teamId") teamId: string,
    @Body() input: InviteMemberDto
  ) {
    return this.teams.invite(user.id, teamId, input);
  }

  @Delete("teams/:teamId/invitations/:id")
  @HttpCode(204)
  revokeInvitation(
    @CurrentUser() user: AuthenticatedUser,
    @Param("teamId") teamId: string,
    @Param("id") id: string
  ) {
    return this.teams.revokeInvitation(user.id, teamId, id);
  }

  @Post("team-invitations/:token/accept")
  accept(@CurrentUser() user: AuthenticatedUser, @Param("token") token: string) {
    return this.teams.accept(user.id, token);
  }

  @Patch("teams/:teamId/members/:memberId")
  @HttpCode(204)
  updateRole(
    @CurrentUser() user: AuthenticatedUser,
    @Param("teamId") teamId: string,
    @Param("memberId") memberId: string,
    @Body() input: UpdateMemberRoleDto
  ) {
    return this.teams.updateRole(user.id, teamId, memberId, input);
  }

  @Delete("teams/:teamId/members/:memberId")
  @HttpCode(204)
  removeMember(
    @CurrentUser() user: AuthenticatedUser,
    @Param("teamId") teamId: string,
    @Param("memberId") memberId: string
  ) {
    return this.teams.removeMember(user.id, teamId, memberId);
  }
}
