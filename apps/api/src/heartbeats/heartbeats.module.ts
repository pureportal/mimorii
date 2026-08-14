import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { IncidentsModule } from "../incidents/incidents.module.js";
import { TeamsModule } from "../teams/teams.module.js";
import { HeartbeatIngestionController, HeartbeatsController } from "./heartbeats.controller.js";
import { HeartbeatsService } from "./heartbeats.service.js";

@Module({
  imports: [AuthModule, TeamsModule, IncidentsModule],
  controllers: [HeartbeatsController, HeartbeatIngestionController],
  providers: [HeartbeatsService],
  exports: [HeartbeatsService],
})
export class HeartbeatsModule {}
