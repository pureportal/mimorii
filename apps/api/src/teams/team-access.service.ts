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

@Injectable()
export class TeamAccessService {
  constructor(private readonly database: DatabaseService) {}

  async require(
    userId: string,
    teamId: string,
    minimum: TeamRole = "viewer"
  ): Promise<MembershipRow> {
    const team = await this.database.get("SELECT id FROM teams WHERE id = ?", teamId);
    if (!team) throw new NotFoundException("Team not found");
    const membership = await this.database.get<MembershipRow>(
      "SELECT * FROM team_members WHERE team_id = ? AND user_id = ?",
      teamId,
      userId
    );
    if (!membership || roleRank[membership.role] < roleRank[minimum]) {
      throw new ForbiddenException("You do not have access to this team");
    }
    return membership;
  }
}
