import { Module } from "@nestjs/common";
import { MikroOrmModule } from "@mikro-orm/nestjs";
import { APP_GUARD } from "@nestjs/core";
import { ScheduleModule } from "@nestjs/schedule";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";
import { AgentsModule } from "./agents/agents.module.js";
import { AdminModule } from "./admin/admin.module.js";
import { AnalyticsModule } from "./analytics/analytics.module.js";
import { AuditModule } from "./audit/audit.module.js";
import { AuthModule } from "./auth/auth.module.js";
import { ChecksModule } from "./checks/checks.module.js";
import { CommonModule } from "./common/common.module.js";
import { DatabaseModule } from "./database/database.module.js";
import { DashboardsModule } from "./dashboards/dashboards.module.js";
import databaseConfig from "./mikro-orm.config.js";
import { HealthModule } from "./health/health.module.js";
import { HeartbeatsModule } from "./heartbeats/heartbeats.module.js";
import { IncidentsModule } from "./incidents/incidents.module.js";
import { MaintenanceModule } from "./maintenance/maintenance.module.js";
import { NotificationsModule } from "./notifications/notifications.module.js";
import { ObjectivesModule } from "./objectives/objectives.module.js";
import { PlatformSettingsModule } from "./platform-settings/platform-settings.module.js";
import { ResourcesModule } from "./resources/resources.module.js";
import { ResourceAlertsModule } from "./resource-alerts/resource-alerts.module.js";
import { RetentionModule } from "./retention/retention.module.js";
import { SponsorsModule } from "./sponsors/sponsors.module.js";
import { StatusPagesModule } from "./status-pages/status-pages.module.js";
import { TechnologiesModule } from "./technologies/technologies.module.js";
import { TeamsModule } from "./teams/teams.module.js";

@Module({
  imports: [
    MikroOrmModule.forRoot(databaseConfig),
    DatabaseModule,
    CommonModule,
    PlatformSettingsModule,
    ThrottlerModule.forRoot({
      skipIf: () => process.env.NODE_ENV === "test",
      throttlers: [
        {
          ttl: 60_000,
          limit: Math.min(Math.max(Number(process.env.MIMORII_RATE_LIMIT) || 180, 10), 100_000),
        },
      ],
    }),
    ScheduleModule.forRoot(),
    AuthModule,
    AdminModule,
    TeamsModule,
    DashboardsModule,
    ResourcesModule,
    ResourceAlertsModule,
    RetentionModule,
    ChecksModule,
    HeartbeatsModule,
    AgentsModule,
    IncidentsModule,
    MaintenanceModule,
    NotificationsModule,
    ObjectivesModule,
    StatusPagesModule,
    SponsorsModule,
    TechnologiesModule,
    AnalyticsModule,
    AuditModule,
    HealthModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
