import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { ChecksModule } from "../checks/checks.module.js";
import { TeamsModule } from "../teams/teams.module.js";
import { TechnologiesModule } from "../technologies/technologies.module.js";
import { ResourceAlertsModule } from "../resource-alerts/resource-alerts.module.js";
import { ResourcesModule } from "../resources/resources.module.js";
import { AgentTransportController } from "./agent-transport.controller.js";
import { AgentGuard } from "./agent.guard.js";
import { AgentsController } from "./agents.controller.js";
import { AgentsService } from "./agents.service.js";
import { MobileDeviceStatusService } from "./mobile-device-status.service.js";

@Module({
  imports: [
    AuthModule,
    ChecksModule,
    ResourceAlertsModule,
    ResourcesModule,
    TeamsModule,
    TechnologiesModule,
  ],
  controllers: [AgentsController, AgentTransportController],
  providers: [AgentsService, AgentGuard, MobileDeviceStatusService],
  exports: [AgentsService],
})
export class AgentsModule {}
