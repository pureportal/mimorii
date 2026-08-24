import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { ResourceFaviconRefresh } from "@mimorii/contracts";
import { randomUUID } from "node:crypto";
import { AuditService } from "../common/audit.service.js";
import { optimizeImageAsset } from "../common/image-asset.js";
import { DatabaseService } from "../database/database.service.js";
import { TeamAccessService } from "../teams/team-access.service.js";
import { FaviconFetcherService } from "./favicon-fetcher.service.js";

interface ResourceIdentityRow {
  id: string;
  check_id: string | null;
  website_url: string | null;
  agent_id: string | null;
  check_enabled: boolean | number | null;
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
      await this.clearFaviconRequests(resourceId);
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

  async refreshFavicon(
    userId: string,
    teamId: string,
    resourceId: string
  ): Promise<ResourceFaviconRefresh> {
    await this.access.require(userId, teamId, "member");
    const resource = await this.requireResource(teamId, resourceId);
    if (!resource.check_id || !resource.website_url) {
      throw new BadRequestException("Resource has no HTTP target");
    }

    if (resource.agent_id) {
      if (!resource.check_enabled) {
        throw new BadRequestException("Enable the first HTTP check to retrieve its favicon");
      }
      const requestId = randomUUID();
      const now = new Date().toISOString();
      await this.database.transaction(async () => {
        await this.clearFaviconRequests(resourceId);
        const queued = await this.database.run(
          `UPDATE checks SET favicon_request_id = ?, next_check_at = ?, updated_at = ?
           WHERE id = ? AND resource_id = ? AND type = 'http' AND agent_id IS NOT NULL AND enabled = 1`,
          requestId,
          now,
          now,
          resource.check_id,
          resourceId
        );
        if (queued.changes === 0) {
          throw new BadRequestException("HTTP check is unavailable");
        }
        await this.audit.record({
          teamId,
          userId,
          action: "resource.favicon_requested",
          subjectType: "resource",
          subjectId: resourceId,
        });
      });
      return { status: "queued", imageUpdatedAt: null };
    }

    let image: Buffer;
    try {
      image = await this.favicons.retrieve(resource.website_url);
    } catch {
      throw new BadGatewayException("Favicon could not be retrieved");
    }

    return this.database.transaction(async () => {
      await this.clearFaviconRequests(resourceId);
      const updatedAt = await this.store(resourceId, image);
      await this.audit.record({
        teamId,
        userId,
        action: "resource.favicon_updated",
        subjectType: "resource",
        subjectId: resourceId,
      });
      return { status: "updated", imageUpdatedAt: updatedAt } as const;
    });
  }

  async acceptAgentFavicon(
    resourceId: string,
    checkId: string,
    requestId: string,
    input: Buffer | null
  ): Promise<boolean> {
    const image = input ? await optimizeImageAsset(input, 128, true) : null;
    return this.database.transaction(async () => {
      const accepted = await this.database.run(
        `UPDATE checks SET favicon_request_id = NULL
         WHERE id = ? AND resource_id = ? AND type = 'http' AND favicon_request_id = ?`,
        checkId,
        resourceId,
        requestId
      );
      if (accepted.changes === 0) return false;
      if (image) await this.store(resourceId, image);
      return true;
    });
  }

  private async requireResource(teamId: string, resourceId: string): Promise<ResourceIdentityRow> {
    const resource = await this.database.get<ResourceIdentityRow>(
      `SELECT r.id, selected.id AS check_id,
        selected.config_json::jsonb #>> '{target,url}' AS website_url,
        selected.agent_id, selected.enabled AS check_enabled
       FROM resources r
       LEFT JOIN LATERAL (
         SELECT c.id, c.config_json, c.agent_id, c.enabled
         FROM checks c
         WHERE c.resource_id = r.id AND c.type = 'http'
         ORDER BY LOWER(c.name), c.name, c.id
         LIMIT 1
       ) selected ON TRUE
       WHERE r.id = ? AND r.team_id = ?`,
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

  private async clearFaviconRequests(resourceId: string): Promise<void> {
    await this.database.run(
      "UPDATE checks SET favicon_request_id = NULL WHERE resource_id = ? AND favicon_request_id IS NOT NULL",
      resourceId
    );
  }
}
