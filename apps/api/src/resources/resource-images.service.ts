import type { ResourceKind } from "@mimorii/contracts";
import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { AuditService } from "../common/audit.service.js";
import { optimizeImageAsset } from "../common/image-asset.js";
import { DatabaseService } from "../database/database.service.js";
import { TeamAccessService } from "../teams/team-access.service.js";
import { FaviconFetcherService } from "./favicon-fetcher.service.js";

interface ResourceIdentityRow {
  id: string;
  kind: ResourceKind;
  target: string;
}

export interface ResourceImageRow {
  image_data: Buffer;
  updated_at: string;
}

@Injectable()
export class ResourceImagesService {
  private readonly logger = new Logger(ResourceImagesService.name);

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
    const websiteUrl = websiteTarget(resource.kind, resource.target);
    if (!websiteUrl) throw new BadRequestException("Resource is not a website");

    let image: Buffer;
    try {
      image = await this.favicons.retrieve(websiteUrl);
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

  async tryAssignFavicon(
    userId: string,
    teamId: string,
    resourceId: string,
    kind: ResourceKind,
    target: string
  ): Promise<boolean> {
    const websiteUrl = websiteTarget(kind, target);
    if (!websiteUrl) return false;
    try {
      const image = await this.favicons.retrieve(websiteUrl);
      await this.database.transaction(async () => {
        await this.store(resourceId, image);
        await this.audit.record({
          teamId,
          userId,
          action: "resource.favicon_updated",
          subjectType: "resource",
          subjectId: resourceId,
          metadata: { automatic: true },
        });
      });
      return true;
    } catch (error) {
      const reason = error instanceof Error ? error.message : "Unknown error";
      this.logger.warn(`Could not assign favicon to resource ${resourceId}: ${reason}`);
      return false;
    }
  }

  private async requireResource(teamId: string, resourceId: string): Promise<ResourceIdentityRow> {
    const resource = await this.database.get<ResourceIdentityRow>(
      "SELECT id, kind, target FROM resources WHERE id = ? AND team_id = ?",
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

function websiteTarget(kind: ResourceKind, target: string): string | null {
  if (kind !== "endpoint") return null;
  try {
    const url = new URL(target);
    if (!new Set(["http:", "https:"]).has(url.protocol) || url.username || url.password) {
      return null;
    }
    return url.toString();
  } catch {
    return null;
  }
}
