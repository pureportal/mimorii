import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { ChecksModule } from "../checks/checks.module.js";
import { HeartbeatsModule } from "../heartbeats/heartbeats.module.js";
import { LogsModule } from "../logs/logs.module.js";
import { ResourcesModule } from "../resources/resources.module.js";
import { TeamsModule } from "../teams/teams.module.js";
import { AppIntegrationsController } from "./app-integrations.controller.js";
import { AppIntegrationsService } from "./app-integrations.service.js";

@Module({
  imports: [AuthModule, TeamsModule, ResourcesModule, ChecksModule, HeartbeatsModule, LogsModule],
  controllers: [AppIntegrationsController],
  providers: [AppIntegrationsService],
})
export class AppIntegrationsModule {}
