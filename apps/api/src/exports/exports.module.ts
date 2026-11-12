import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { TeamsModule } from "../teams/teams.module.js";
import { AuditLogExport, IncidentsExport } from "./datasets/operations-exports.js";
import {
  AvailabilityExport,
  CheckResultsExport,
  ChecksExport,
  ResourcesExport,
} from "./datasets/monitoring-exports.js";
import type { ExportDataset } from "./export-dataset.js";
import { CsvExportFormat, JsonExportFormat, NdjsonExportFormat } from "./export-formats.js";
import { ExportsController } from "./exports.controller.js";
import { EXPORT_DATASETS, EXPORT_FORMATS, ExportsService } from "./exports.service.js";

const datasets = [
  ResourcesExport,
  ChecksExport,
  CheckResultsExport,
  AvailabilityExport,
  IncidentsExport,
  AuditLogExport,
];

@Module({
  imports: [AuthModule, TeamsModule],
  controllers: [ExportsController],
  providers: [
    ...datasets,
    {
      provide: EXPORT_DATASETS,
      useFactory: (...instances: ExportDataset[]) => instances,
      inject: datasets,
    },
    {
      provide: EXPORT_FORMATS,
      useValue: [new CsvExportFormat(), new JsonExportFormat(), new NdjsonExportFormat()],
    },
    ExportsService,
  ],
})
export class ExportsModule {}
