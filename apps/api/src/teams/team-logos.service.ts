import { Injectable, NotFoundException } from "@nestjs/common";
import { optimizeImageAsset } from "../common/image-asset.js";
import { DatabaseService } from "../database/database.service.js";
import { TeamAccessService } from "./team-access.service.js";

export interface TeamLogoRow {
  image_data: Buffer;
  updated_at: string;
}

@Injectable()
export class TeamLogosService {
  constructor(
    private readonly database: DatabaseService,
    private readonly access: TeamAccessService
  ) {}

  async image(userId: string, teamId: string): Promise<TeamLogoRow> {
    await this.access.require(userId, teamId, "viewer");
    const image = await this.database.get<TeamLogoRow>(
      "SELECT image_data, updated_at FROM team_logos WHERE team_id = ?",
      teamId
    );
    if (!image) throw new NotFoundException("Team logo not found");
    return image;
  }

  prepare(input: Buffer): Promise<Buffer> {
    return optimizeImageAsset(input, 128);
  }

  async store(teamId: string, image: Buffer): Promise<string> {
    const updatedAt = new Date().toISOString();
    const stored = await this.database.get<{ updated_at: string }>(
      `INSERT INTO team_logos (team_id, image_data, updated_at)
       VALUES (?, ?, ?)
       ON CONFLICT (team_id) DO UPDATE SET
         image_data = EXCLUDED.image_data,
         updated_at = GREATEST(EXCLUDED.updated_at, team_logos.updated_at + INTERVAL '1 millisecond')
       RETURNING updated_at`,
      teamId,
      image,
      updatedAt
    );
    if (!stored) throw new Error("Team logo could not be stored");
    return stored.updated_at;
  }
}
