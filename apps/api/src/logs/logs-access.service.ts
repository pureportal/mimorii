import { ForbiddenException, Injectable } from "@nestjs/common";
import { logsDisabledMessage, type TeamRole } from "@mimorii/contracts";
import { settleInOrder } from "../common/promises.js";
import { DatabaseService } from "../database/database.service.js";
import { TeamAccessService } from "../teams/team-access.service.js";

@Injectable()
export class LogsAccessService {
  constructor(
    private readonly database: DatabaseService,
    private readonly teamAccess: TeamAccessService
  ) {}

  async require(userId: string, teamId: string, minimum: TeamRole = "viewer"): Promise<void> {
    const [, settings] = await settleInOrder(
      this.teamAccess.require(userId, teamId, minimum),
      this.database.get<{ enabled: boolean }>(
        "SELECT enabled FROM team_log_settings WHERE team_id = ?",
        teamId
      )
    );
    if (!settings?.enabled) throw new ForbiddenException(logsDisabledMessage);
  }
}
