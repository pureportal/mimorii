import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { LogsModule } from "../logs/logs.module.js";
import { PlatformSettingsModule } from "../platform-settings/platform-settings.module.js";
import { AdminController } from "./admin.controller.js";
import { AdminSponsorshipsService } from "./admin-sponsorships.service.js";
import { AdminTeamsService } from "./admin-teams.service.js";
import { AdminUsersService } from "./admin-users.service.js";
import { AdminService } from "./admin.service.js";
import { GlobalAdminGuard } from "./global-admin.guard.js";

@Module({
  imports: [AuthModule, LogsModule, PlatformSettingsModule],
  controllers: [AdminController],
  providers: [
    AdminService,
    AdminUsersService,
    AdminTeamsService,
    AdminSponsorshipsService,
    GlobalAdminGuard,
  ],
})
export class AdminModule {}
