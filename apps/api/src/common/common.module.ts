import { Global, Module } from "@nestjs/common";
import { AuditService } from "./audit.service.js";
import { TargetSafetyService } from "./target-safety.service.js";

@Global()
@Module({
  providers: [AuditService, TargetSafetyService],
  exports: [AuditService, TargetSafetyService],
})
export class CommonModule {}
