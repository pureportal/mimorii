import { Global, Module } from "@nestjs/common";
import { AuditService } from "./audit.service.js";
import { MailService } from "./mail.service.js";
import { TargetSafetyService } from "./target-safety.service.js";
import { ResourceTelemetryService } from "./resource-telemetry.service.js";
import { ResourceHealthService } from "./resource-health.service.js";

@Global()
@Module({
  providers: [
    AuditService,
    MailService,
    ResourceHealthService,
    ResourceTelemetryService,
    TargetSafetyService,
  ],
  exports: [
    AuditService,
    MailService,
    ResourceHealthService,
    ResourceTelemetryService,
    TargetSafetyService,
  ],
})
export class CommonModule {}
