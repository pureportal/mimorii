import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { MaintenanceModule } from "../maintenance/maintenance.module.js";
import { NotificationsModule } from "../notifications/notifications.module.js";
import { TeamsModule } from "../teams/teams.module.js";
import { IncidentsController } from "./incidents.controller.js";
import { IncidentsService } from "./incidents.service.js";

@Module({
  imports: [AuthModule, TeamsModule, MaintenanceModule, NotificationsModule],
  controllers: [IncidentsController],
  providers: [IncidentsService],
  exports: [IncidentsService],
})
export class IncidentsModule {}
