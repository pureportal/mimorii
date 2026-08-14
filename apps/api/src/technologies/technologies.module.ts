import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { TeamsModule } from "../teams/teams.module.js";
import { TechnologiesController } from "./technologies.controller.js";
import { TechnologiesService } from "./technologies.service.js";

@Module({
  imports: [AuthModule, TeamsModule],
  controllers: [TechnologiesController],
  providers: [TechnologiesService],
  exports: [TechnologiesService],
})
export class TechnologiesModule {}
