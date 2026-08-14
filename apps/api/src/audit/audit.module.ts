import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { TeamsModule } from "../teams/teams.module.js";
import { AuditController } from "./audit.controller.js";

@Module({
  imports: [AuthModule, TeamsModule],
  controllers: [AuditController],
})
export class AuditModule {}
