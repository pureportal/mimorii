import { exportFormatIds, type ExportDatasetSummary } from "@mimorii/contracts";
import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { AuditService } from "../common/audit.service.js";
import { teamRoleAtLeast } from "../common/team-roles.js";
import { TeamAccessService } from "../teams/team-access.service.js";
import type { ExportDataset } from "./export-dataset.js";
import type { ExportFormat } from "./export-formats.js";

export const EXPORT_DATASETS = Symbol("EXPORT_DATASETS");
export const EXPORT_FORMATS = Symbol("EXPORT_FORMATS");

export interface ExportQuery {
  format?: string;
  from?: string;
  to?: string;
  [filter: string]: string | undefined;
}

export interface PreparedExport {
  filename: string;
  mediaType: string;
  body: AsyncIterable<string>;
}

const defaultRangeDays = 30;
const maximumRangeDays = 366;

@Injectable()
export class ExportsService {
  private readonly datasets: ReadonlyMap<string, ExportDataset>;
  private readonly formats: ReadonlyMap<string, ExportFormat>;

  constructor(
    @Inject(EXPORT_DATASETS) datasets: ExportDataset[],
    @Inject(EXPORT_FORMATS) formats: ExportFormat[],
    private readonly access: TeamAccessService,
    private readonly audit: AuditService
  ) {
    this.datasets = new Map(datasets.map((dataset) => [dataset.id, dataset]));
    this.formats = new Map(formats.map((format) => [format.id, format]));
  }

  async catalog(userId: string, teamId: string): Promise<ExportDatasetSummary[]> {
    const membership = await this.access.require(userId, teamId, "viewer");
    return [...this.datasets.values()]
      .filter((dataset) => teamRoleAtLeast(membership.role, dataset.minimumRole))
      .map((dataset) => ({
        id: dataset.id,
        label: dataset.label,
        usesTimeRange: dataset.usesTimeRange,
        filters: [...dataset.filters],
        formats: exportFormatIds.filter((id) => this.formats.has(id)),
      }));
  }

  async prepare(
    userId: string,
    teamId: string,
    datasetId: string,
    query: ExportQuery
  ): Promise<PreparedExport> {
    const dataset = this.datasets.get(datasetId);
    if (!dataset) throw new NotFoundException("Export not found");
    const format = this.formats.get(query.format ?? "csv");
    if (!format) throw new BadRequestException("Export format is not supported");
    await this.access.require(userId, teamId, dataset.minimumRole);
    const to = query.to ? new Date(query.to) : new Date();
    const from = query.from
      ? new Date(query.from)
      : new Date(to.getTime() - defaultRangeDays * 86_400_000);
    if (!Number.isFinite(from.getTime()) || !Number.isFinite(to.getTime()) || from >= to) {
      throw new BadRequestException("Export time range is invalid");
    }
    if (to.getTime() - from.getTime() > maximumRangeDays * 86_400_000) {
      throw new BadRequestException(`Exports can cover up to ${maximumRangeDays} days`);
    }
    const filters = Object.fromEntries(
      dataset.filters.flatMap((name) => {
        const value = query[name]?.trim();
        return value ? [[name, value]] : [];
      })
    );
    const request = { userId, teamId, from, to, filters };
    await this.audit.record({
      teamId,
      userId,
      action: "export.downloaded",
      subjectType: "export",
      subjectId: dataset.id,
      metadata: { format: format.id, ...(dataset.usesTimeRange ? { from, to } : {}), ...filters },
    });
    return {
      filename: `${dataset.filename(request)}.${format.extension}`,
      mediaType: format.mediaType,
      body: format.encode(dataset.columns, dataset.rows(request)),
    };
  }
}
