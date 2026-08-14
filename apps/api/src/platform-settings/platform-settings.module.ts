import { Module } from "@nestjs/common";
import { PlatformSettingsService } from "./platform-settings.service.js";

@Module({
  providers: [PlatformSettingsService],
  exports: [PlatformSettingsService],
})
export class PlatformSettingsModule {}
