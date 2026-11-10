import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import type { TeamRole, TeamSummary } from "@mimorii/contracts";
import { apiTokenTeamRoles } from "../auth/api-token-scope.js";
import type { MembershipRow } from "../common/rows.js";
import { lowerTeamRole, teamRoleAtLeast } from "../common/team-roles.js";
import { DatabaseService } from "../database/database.service.js";

interface TeamMembershipRow {
  team_id: string | null;
  user_id: string | null;
  role: TeamRole | null;
  joined_at: string | null;
}

@Injectable()
export class TeamAccessService {
  constructor(private readonly database: DatabaseService) {}

  async require(
    userId: string,
    teamId: string,
    minimum: TeamRole = "viewer"
  ): Promise<MembershipRow> {
    const membership = await this.database.get<TeamMembershipRow>(
      `SELECT tm.team_id, tm.user_id, tm.role, tm.joined_at
       FROM teams t
       LEFT JOIN team_members tm ON tm.team_id = t.id AND tm.user_id = ?
       WHERE t.id = ?`,
      userId,
      teamId
    );
    if (!membership) throw new NotFoundException("Team not found");
    const role = membership.role ? this.scopedRole(teamId, membership.role) : undefined;
    if (
      !membership.team_id ||
      !membership.user_id ||
      !role ||
      !membership.joined_at ||
      !teamRoleAtLeast(role, minimum)
    ) {
      throw new ForbiddenException("You do not have access to this team");
    }
    return {
      team_id: membership.team_id,
      user_id: membership.user_id,
      role,
      joined_at: membership.joined_at,
    };
  }

  limitToApiTokenScope(teams: TeamSummary[]): TeamSummary[] {
    return teams.flatMap((team) => {
      const role = this.scopedRole(team.id, team.role);
      return role ? [{ ...team, role }] : [];
    });
  }

  private scopedRole(teamId: string, role: TeamRole): TeamRole | undefined {
    const tokenRoles = apiTokenTeamRoles.getStore();
    if (!tokenRoles) return role;
    const tokenRole = tokenRoles.get(teamId);
    return tokenRole && lowerTeamRole(role, tokenRole);
  }
}
