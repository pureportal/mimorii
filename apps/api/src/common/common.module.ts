import { Global, Module } from "@nestjs/common";
import { AuditService } from "./audit.service.js";
import { TargetSafetyService } from "./target-safety.service.js";
import { ResourceTelemetryService } from "./resource-telemetry.service.js";
import { ResourceHealthService } from "./resource-health.service.js";

@Global()
@Module({
  providers: [AuditService, ResourceHealthService, ResourceTelemetryService, TargetSafetyService],
  exports: [AuditService, ResourceHealthService, ResourceTelemetryService, TargetSafetyService],
})
export class CommonModule {}
