import { BadRequestException, Injectable } from "@nestjs/common";
import { DatabaseService } from "../database/database.service.js";
import { ResourcesService } from "../resources/resources.service.js";
import { HeartbeatsService } from "./heartbeats.service.js";

@Injectable()
export class FoxytailService {
  constructor(
    private readonly database: DatabaseService,
    private readonly resources: ResourcesService,
    private readonly heartbeats: HeartbeatsService
  ) {}

  async enroll(userId: string, teamId: string, name: string) {
    if (!name.trim()) throw new BadRequestException("Enter a server name");
    return this.database.transaction(async () => {
      const resource = await this.resources.create(userId, teamId, {
        name: name.trim(),
        kind: "service",
        tags: ["foxytail"],
      });
      return this.heartbeats.create(userId, teamId, {
        resourceId: resource.id,
        name: name.trim(),
        intervalSeconds: 60,
        graceSeconds: 120,
        enabled: false,
      });
    });
  }
}
