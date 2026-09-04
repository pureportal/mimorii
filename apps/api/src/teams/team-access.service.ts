import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import type { TeamRole } from "@mimorii/contracts";
import type { MembershipRow } from "../common/rows.js";
import { DatabaseService } from "../database/database.service.js";

const roleRank: Record<TeamRole, number> = {
  viewer: 0,
  member: 1,
  admin: 2,
  owner: 3,
};

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
    if (
      !membership.team_id ||
      !membership.user_id ||
      !membership.role ||
      !membership.joined_at ||
      roleRank[membership.role] < roleRank[minimum]
    ) {
      throw new ForbiddenException("You do not have access to this team");
    }
    return {
      team_id: membership.team_id,
      user_id: membership.user_id,
      role: membership.role,
      joined_at: membership.joined_at,
    };
  }
}
