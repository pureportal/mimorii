import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { ChecksModule } from "../checks/checks.module.js";
import { TeamsModule } from "../teams/teams.module.js";
import { TechnologiesModule } from "../technologies/technologies.module.js";
import { AgentTransportController } from "./agent-transport.controller.js";
import { AgentGuard } from "./agent.guard.js";
import { AgentsController } from "./agents.controller.js";
import { AgentsService } from "./agents.service.js";
import { MobileDeviceStatusService } from "./mobile-device-status.service.js";

@Module({
  imports: [AuthModule, ChecksModule, TeamsModule, TechnologiesModule],
  controllers: [AgentsController, AgentTransportController],
  providers: [AgentsService, AgentGuard, MobileDeviceStatusService],
  exports: [AgentsService],
})
export class AgentsModule {}
