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
import {
  CreateTeamDto,
  DeleteTeamDto,
  InviteMemberDto,
  UpdateMemberRoleDto,
  UpdateTeamDto,
} from "./teams.dto.js";
import { TeamsService } from "./teams.service.js";

@ApiTags("Teams")
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller()
export class TeamsController {
  constructor(private readonly teams: TeamsService) {}

  @Get("teams")
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.teams.list(user.id);
  }

  @Post("teams")
  create(@CurrentUser() user: AuthenticatedUser, @Body() input: CreateTeamDto) {
    return this.teams.create(user.id, input);
  }

  @Patch("teams/:teamId")
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param("teamId") teamId: string,
    @Body() input: UpdateTeamDto
  ) {
    return this.teams.update(user.id, teamId, input);
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
