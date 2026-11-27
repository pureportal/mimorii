import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { TeamsModule } from "../teams/teams.module.js";
import { TrafficCollectorService } from "./traffic-collector.service.js";
import { TrafficController } from "./traffic.controller.js";
import { TrafficPublicController } from "./traffic-public.controller.js";
import { TrafficReportsService } from "./traffic-reports.service.js";
import { TrafficSitesService } from "./traffic-sites.service.js";

@Module({
  imports: [AuthModule, TeamsModule],
  controllers: [TrafficController, TrafficPublicController],
  providers: [TrafficSitesService, TrafficCollectorService, TrafficReportsService],
  exports: [TrafficSitesService, TrafficReportsService],
})
export class TrafficModule {}
