import { Module } from "@nestjs/common";
import { AnalyticsModule } from "../analytics/analytics.module.js";
import { AuthModule } from "../auth/auth.module.js";
import { ChecksModule } from "../checks/checks.module.js";
import { HeartbeatsModule } from "../heartbeats/heartbeats.module.js";
import { IncidentsModule } from "../incidents/incidents.module.js";
import { MaintenanceModule } from "../maintenance/maintenance.module.js";
import { ObjectivesModule } from "../objectives/objectives.module.js";
import { ResourcesModule } from "../resources/resources.module.js";
import { TeamsModule } from "../teams/teams.module.js";
import { McpAuthGuard } from "./mcp-auth.guard.js";
import { McpController } from "./mcp.controller.js";
import { McpRequestGuard } from "./mcp-request.guard.js";
import { McpService } from "./mcp.service.js";

@Module({
  imports: [
    AuthModule,
    AnalyticsModule,
    TeamsModule,
    ResourcesModule,
    ChecksModule,
    HeartbeatsModule,
    IncidentsModule,
    MaintenanceModule,
    ObjectivesModule,
  ],
  controllers: [McpController],
  providers: [McpAuthGuard, McpRequestGuard, McpService],
})
export class McpModule {}
