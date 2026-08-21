import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { TeamsModule } from "../teams/teams.module.js";
import { MaintenanceModule } from "../maintenance/maintenance.module.js";
import { ResourcesController } from "./resources.controller.js";
import { ResourcesService } from "./resources.service.js";
import { FaviconFetcherService } from "./favicon-fetcher.service.js";
import { ResourceImagesService } from "./resource-images.service.js";

@Module({
  imports: [AuthModule, TeamsModule, MaintenanceModule],
  controllers: [ResourcesController],
  providers: [FaviconFetcherService, ResourceImagesService, ResourcesService],
  exports: [ResourcesService],
})
export class ResourcesModule {}
