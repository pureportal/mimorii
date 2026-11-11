import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { IncidentsModule } from "../incidents/incidents.module.js";
import { TeamsModule } from "../teams/teams.module.js";
import { LogAlertsController } from "./log-alerts.controller.js";
import { LogAlertsService } from "./log-alerts.service.js";
import { LogIngestionController } from "./log-ingestion.controller.js";
import { LogIngestionLimiter } from "./log-ingestion-limiter.js";
import { LogIngestionService } from "./log-ingestion.service.js";
import { LogInsightsService } from "./log-insights.service.js";
import { LogRetentionService } from "./log-retention.service.js";
import { LogSavedSearchesController } from "./log-saved-searches.controller.js";
import { LogSavedSearchesService } from "./log-saved-searches.service.js";
import { LogSearchDatabase } from "./log-search-database.js";
import { LogSearchService } from "./log-search.service.js";
import { LogSettingsService } from "./log-settings.service.js";
import { LogSourcesController } from "./log-sources.controller.js";
import { LogSourcesService } from "./log-sources.service.js";
import { LogsAccessService } from "./logs-access.service.js";
import { LogsController } from "./logs.controller.js";
import { LogsQueryService } from "./logs-query.service.js";

@Module({
  imports: [AuthModule, TeamsModule, IncidentsModule],
  controllers: [
    LogsController,
    LogSourcesController,
    LogAlertsController,
    LogSavedSearchesController,
    LogIngestionController,
  ],
  providers: [
    LogsAccessService,
    LogSearchDatabase,
    LogSearchService,
    LogsQueryService,
    LogInsightsService,
    LogSettingsService,
    LogSourcesService,
    LogAlertsService,
    LogIngestionService,
    LogIngestionLimiter,
    LogRetentionService,
    LogSavedSearchesService,
  ],
  exports: [
    LogSettingsService,
    LogAlertsService,
    LogRetentionService,
    LogsQueryService,
    LogInsightsService,
  ],
})
export class LogsModule {}
