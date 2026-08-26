import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { TeamAccessService } from "./team-access.service.js";
import { TeamLogosService } from "./team-logos.service.js";
import { TeamsController } from "./teams.controller.js";
import { TeamsService } from "./teams.service.js";

@Module({
  imports: [AuthModule],
  controllers: [TeamsController],
  providers: [TeamsService, TeamAccessService, TeamLogosService],
  exports: [TeamsService, TeamAccessService, TeamLogosService],
})
export class TeamsModule {}
