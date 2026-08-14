import { Module } from "@nestjs/common";
import { PlatformSettingsModule } from "../platform-settings/platform-settings.module.js";
import { RetentionService } from "./retention.service.js";

@Module({ imports: [PlatformSettingsModule], providers: [RetentionService] })
export class RetentionModule {}
