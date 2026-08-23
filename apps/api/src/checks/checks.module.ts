import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { TeamsModule } from "../teams/teams.module.js";
import { IncidentsModule } from "../incidents/incidents.module.js";
import { MaintenanceModule } from "../maintenance/maintenance.module.js";
import { NotificationsModule } from "../notifications/notifications.module.js";
import { TechnologiesModule } from "../technologies/technologies.module.js";
import { CheckConfigService } from "./check-config.service.js";
import { CheckOrchestratorService } from "./check-orchestrator.service.js";
import { CheckRunnerService } from "./check-runner.service.js";
import { DatabaseCheckService } from "./database-check.service.js";
import { IcmpService } from "./icmp.service.js";
import { ChecksController } from "./checks.controller.js";
import { ChecksService } from "./checks.service.js";
import { ResultsService } from "./results.service.js";

@Module({
  imports: [
    AuthModule,
    TeamsModule,
    IncidentsModule,
    MaintenanceModule,
    NotificationsModule,
    TechnologiesModule,
  ],
  controllers: [ChecksController],
  providers: [
    CheckConfigService,
    CheckOrchestratorService,
    CheckRunnerService,
    DatabaseCheckService,
    IcmpService,
    ChecksService,
    ResultsService,
  ],
  exports: [CheckConfigService, CheckOrchestratorService, ResultsService],
})
export class ChecksModule {}
