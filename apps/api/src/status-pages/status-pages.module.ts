import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { IncidentsModule } from "../incidents/incidents.module.js";
import { MaintenanceModule } from "../maintenance/maintenance.module.js";
import { NotificationsModule } from "../notifications/notifications.module.js";
import { TeamsModule } from "../teams/teams.module.js";
import { PublicStatusPagesController, StatusPagesController } from "./status-pages.controller.js";
import { StatusPagesService } from "./status-pages.service.js";

@Module({
  imports: [AuthModule, TeamsModule, IncidentsModule, MaintenanceModule, NotificationsModule],
  controllers: [StatusPagesController, PublicStatusPagesController],
  providers: [StatusPagesService],
})
export class StatusPagesModule {}
