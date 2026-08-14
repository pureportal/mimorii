import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { NotificationsModule } from "../notifications/notifications.module.js";
import { TeamsModule } from "../teams/teams.module.js";
import { ObjectivesController } from "./objectives.controller.js";
import { ObjectivesService } from "./objectives.service.js";

@Module({
  imports: [AuthModule, TeamsModule, NotificationsModule],
  controllers: [ObjectivesController],
  providers: [ObjectivesService],
  exports: [ObjectivesService],
})
export class ObjectivesModule {}
