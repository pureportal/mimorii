import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { AuditService } from "../common/audit.service.js";
import { optimizeImageAsset } from "../common/image-asset.js";
import { DatabaseService } from "../database/database.service.js";
import { TeamAccessService } from "../teams/team-access.service.js";
import { FaviconFetcherService } from "./favicon-fetcher.service.js";

interface ResourceIdentityRow {
  id: string;
  website_url: string | null;
}

export interface ResourceImageRow {
  image_data: Buffer;
  updated_at: string;
}

@Injectable()
export class ResourceImagesService {
  constructor(
    private readonly database: DatabaseService,
    private readonly access: TeamAccessService,
    private readonly audit: AuditService,
    private readonly favicons: FaviconFetcherService
  ) {}

  async image(userId: string, teamId: string, resourceId: string): Promise<ResourceImageRow> {
    await this.access.require(userId, teamId, "viewer");
    const image = await this.database.get<ResourceImageRow>(
      `SELECT ri.image_data, ri.updated_at FROM resource_images ri
       JOIN resources r ON r.id = ri.resource_id
       WHERE ri.resource_id = ? AND r.team_id = ?`,
      resourceId,
      teamId
    );
    if (!image) throw new NotFoundException("Resource image not found");
    return image;
  }

  async replace(
    userId: string,
    teamId: string,
    resourceId: string,
    input: Buffer
  ): Promise<string> {
    await this.access.require(userId, teamId, "member");
    await this.requireResource(teamId, resourceId);
    const image = await optimizeImageAsset(input, 128);
    return this.database.transaction(async () => {
      const updatedAt = await this.store(resourceId, image);
      await this.audit.record({
        teamId,
        userId,
        action: "resource.image_updated",
        subjectType: "resource",
        subjectId: resourceId,
      });
      return updatedAt;
    });
  }

  async refreshFavicon(userId: string, teamId: string, resourceId: string): Promise<string> {
    await this.access.require(userId, teamId, "member");
    const resource = await this.requireResource(teamId, resourceId);
    if (!resource.website_url) throw new BadRequestException("Resource has no HTTP target");

    let image: Buffer;
    try {
      image = await this.favicons.retrieve(resource.website_url);
    } catch {
      throw new BadGatewayException("Favicon could not be retrieved");
    }

    return this.database.transaction(async () => {
      const updatedAt = await this.store(resourceId, image);
      await this.audit.record({
        teamId,
        userId,
        action: "resource.favicon_updated",
        subjectType: "resource",
        subjectId: resourceId,
      });
      return updatedAt;
    });
  }

  private async requireResource(teamId: string, resourceId: string): Promise<ResourceIdentityRow> {
    const resource = await this.database.get<ResourceIdentityRow>(
      `SELECT r.id,
        (SELECT c.config_json::jsonb #>> '{target,url}'
         FROM checks c
         WHERE c.resource_id = r.id AND c.type = 'http'
         ORDER BY c.created_at LIMIT 1) AS website_url
       FROM resources r WHERE r.id = ? AND r.team_id = ?`,
      resourceId,
      teamId
    );
    if (!resource) throw new NotFoundException("Resource not found");
    return resource;
  }

  private async store(resourceId: string, image: Buffer): Promise<string> {
    const updatedAt = new Date().toISOString();
    const stored = await this.database.get<{ updated_at: string }>(
      `INSERT INTO resource_images (resource_id, image_data, updated_at)
       VALUES (?, ?, ?)
       ON CONFLICT (resource_id) DO UPDATE SET
         image_data = EXCLUDED.image_data,
         updated_at = GREATEST(EXCLUDED.updated_at, resource_images.updated_at + INTERVAL '1 millisecond')
       RETURNING updated_at`,
      resourceId,
      image,
      updatedAt
    );
    if (!stored) throw new Error("Resource image could not be stored");
    return stored.updated_at;
  }
}
