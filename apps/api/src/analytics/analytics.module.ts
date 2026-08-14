import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { TeamsModule } from "../teams/teams.module.js";
import { IncidentsModule } from "../incidents/incidents.module.js";
import { MaintenanceModule } from "../maintenance/maintenance.module.js";
import { ObjectivesModule } from "../objectives/objectives.module.js";
import { AnalyticsController } from "./analytics.controller.js";
import { AnalyticsService } from "./analytics.service.js";

@Module({
  imports: [AuthModule, TeamsModule, IncidentsModule, MaintenanceModule, ObjectivesModule],
  controllers: [AnalyticsController],
  providers: [AnalyticsService],
})
export class AnalyticsModule {}
