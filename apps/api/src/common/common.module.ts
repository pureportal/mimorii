import { Global, Module } from "@nestjs/common";
import { AuditService } from "./audit.service.js";
import { TargetSafetyService } from "./target-safety.service.js";
import { ResourceTelemetryService } from "./resource-telemetry.service.js";

@Global()
@Module({
  providers: [AuditService, ResourceTelemetryService, TargetSafetyService],
  exports: [AuditService, ResourceTelemetryService, TargetSafetyService],
})
export class CommonModule {}
