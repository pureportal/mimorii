import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { NotificationsModule } from "../notifications/notifications.module.js";
import { TeamsModule } from "../teams/teams.module.js";
import { ResourceAlertsController } from "./resource-alerts.controller.js";
import { ResourceAlertsService } from "./resource-alerts.service.js";

@Module({
  imports: [AuthModule, NotificationsModule, TeamsModule],
  controllers: [ResourceAlertsController],
  providers: [ResourceAlertsService],
  exports: [ResourceAlertsService],
})
export class ResourceAlertsModule {}
