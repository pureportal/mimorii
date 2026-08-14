import { Module } from "@nestjs/common";
import { PlatformSettingsModule } from "../platform-settings/platform-settings.module.js";
import { SponsorsController } from "./sponsors.controller.js";
import { SponsorsService } from "./sponsors.service.js";

@Module({
  imports: [PlatformSettingsModule],
  controllers: [SponsorsController],
  providers: [SponsorsService],
})
export class SponsorsModule {}
