import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { IncidentsModule } from "../incidents/incidents.module.js";
import { TeamsModule } from "../teams/teams.module.js";
import { HeartbeatIngestionController, HeartbeatsController } from "./heartbeats.controller.js";
import { HeartbeatsService } from "./heartbeats.service.js";
import { ResourcesModule } from "../resources/resources.module.js";
import { FoxytailController } from "./foxytail.controller.js";
import { FoxytailService } from "./foxytail.service.js";

@Module({
  imports: [AuthModule, TeamsModule, IncidentsModule, ResourcesModule],
  controllers: [FoxytailController, HeartbeatsController, HeartbeatIngestionController],
  providers: [HeartbeatsService, FoxytailService],
  exports: [HeartbeatsService],
})
export class HeartbeatsModule {}
