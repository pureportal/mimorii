import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { TeamsModule } from "../teams/teams.module.js";
import { DashboardDataService } from "./dashboard-data.service.js";
import { DashboardsController, DashboardViewsController } from "./dashboards.controller.js";
import { DashboardsService } from "./dashboards.service.js";

@Module({
  imports: [AuthModule, TeamsModule],
  controllers: [DashboardsController, DashboardViewsController],
  providers: [DashboardsService, DashboardDataService],
})
export class DashboardsModule {}
