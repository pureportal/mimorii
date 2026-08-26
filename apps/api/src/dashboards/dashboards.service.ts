import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import {
  dashboardIncidentLimits,
  dashboardMetrics,
  dashboardWindowDays,
  resourceMetricNames,
  type DashboardAccessMode,
  type DashboardConfiguration,
  type DashboardIncidentLimit,
  type DashboardItem,
  type DashboardMetric,
  type DashboardMutationResult,
  type DashboardSummary,
  type DashboardView,
  type DashboardWidth,
  type DashboardWindowDays,
} from "@mimorii/contracts";
import { randomUUID } from "node:crypto";
import { AuditService } from "../common/audit.service.js";
import { createSecret, hashSecret, verifySecret } from "../common/crypto.js";
import { DatabaseService } from "../database/database.service.js";
import { TeamAccessService } from "../teams/team-access.service.js";
import { DashboardDataService } from "./dashboard-data.service.js";
import type { CreateDashboardDto, DashboardItemDto, UpdateDashboardDto } from "./dashboards.dto.js";

interface DashboardRow {
  id: string;
  team_id: string;
  name: string;
  slug: string;
  access_mode: DashboardAccessMode;
  access_key_hash: string | null;
  created_at: string;
  updated_at: string;
  item_count: number;
}

interface DashboardItemRow {
  id: string;
  type: DashboardItem["type"];
  title: string;
  width: number;
  resource_id: string | null;
  configuration_json: string;
}

interface StoredItemConfiguration {
  metric?: DashboardMetric;
  windowDays?: DashboardWindowDays;
  limit?: DashboardIncidentLimit;
}

type ParsedItemConfiguration =
  | {
      type: "metric";
      metric: DashboardMetric;
      windowDays: DashboardWindowDays;
      resourceId: string | null;
    }
  | { type: "uptime"; windowDays: 7 | 30 | 90; resourceId: string }
  | { type: "status"; resourceId: string }
  | { type: "incidents"; limit: DashboardIncidentLimit; resourceId: string | null };

@Injectable()
export class DashboardsService {
  constructor(
    private readonly database: DatabaseService,
    private readonly access: TeamAccessService,
    private readonly data: DashboardDataService,
    private readonly audit: AuditService
  ) {}

  async list(userId: string, teamId: string): Promise<DashboardSummary[]> {
    await this.access.require(userId, teamId, "viewer");
    const rows = await this.rows("d.team_id = ?", teamId);
    return rows.map((row) => this.summary(row));
  }

  async get(userId: string, teamId: string, id: string): Promise<DashboardConfiguration> {
    await this.access.require(userId, teamId, "viewer");
    return this.configuration(await this.requireRow(teamId, id));
  }

  async create(
    userId: string,
    teamId: string,
    input: CreateDashboardDto
  ): Promise<DashboardMutationResult> {
    await this.access.require(userId, teamId, "admin");
    const items = await this.validateItems(teamId, input.items);
    const id = randomUUID();
    const now = new Date().toISOString();
    const accessKey = input.accessMode === "protected" ? createSecret("mim_dash") : null;
    await this.database.transaction(async () => {
      await this.database.run(
        `INSERT INTO dashboards
         (id, team_id, name, slug, access_mode, access_key_hash, created_by, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        id,
        teamId,
        input.name.trim(),
        input.slug.toLowerCase(),
        input.accessMode,
        accessKey ? hashSecret(accessKey) : null,
        userId,
        now,
        now
      );
      await this.replaceItems(id, items);
    });
    await this.audit.record({
      teamId,
      userId,
      action: "dashboard.created",
      subjectType: "dashboard",
      subjectId: id,
    });
    return { dashboard: await this.configuration(await this.requireRow(teamId, id)), accessKey };
  }

  async update(
    userId: string,
    teamId: string,
    id: string,
    input: UpdateDashboardDto
  ): Promise<DashboardMutationResult> {
    await this.access.require(userId, teamId, "admin");
    const current = await this.requireRow(teamId, id);
    const items = input.items
      ? await this.validateItems(teamId, input.items, current.id)
      : undefined;
    const accessMode = input.accessMode ?? current.access_mode;
    let accessKey: string | null = null;
    let accessKeyHash = current.access_key_hash;
    if (accessMode !== current.access_mode) {
      if (accessMode === "protected") {
        accessKey = createSecret("mim_dash");
        accessKeyHash = hashSecret(accessKey);
      } else {
        accessKeyHash = null;
      }
    }
    if (accessMode !== "protected") accessKeyHash = null;
    await this.database.transaction(async () => {
      await this.database.run(
        `UPDATE dashboards SET name = ?, slug = ?, access_mode = ?, access_key_hash = ?, updated_at = ?
         WHERE id = ? AND team_id = ?`,
        input.name?.trim() ?? current.name,
        input.slug?.toLowerCase() ?? current.slug,
        accessMode,
        accessKeyHash,
        new Date().toISOString(),
        id,
        teamId
      );
      if (items) await this.replaceItems(id, items);
    });
    await this.audit.record({
      teamId,
      userId,
      action: "dashboard.updated",
      subjectType: "dashboard",
      subjectId: id,
    });
    return { dashboard: await this.configuration(await this.requireRow(teamId, id)), accessKey };
  }

  async remove(userId: string, teamId: string, id: string): Promise<void> {
    await this.access.require(userId, teamId, "admin");
    const result = await this.database.run(
      "DELETE FROM dashboards WHERE id = ? AND team_id = ?",
      id,
      teamId
    );
    if (result.changes === 0) throw new NotFoundException("Dashboard not found");
    await this.audit.record({
      teamId,
      userId,
      action: "dashboard.deleted",
      subjectType: "dashboard",
      subjectId: id,
    });
  }

  async regenerateAccessKey(
    userId: string,
    teamId: string,
    id: string
  ): Promise<{ accessKey: string }> {
    await this.access.require(userId, teamId, "admin");
    const dashboard = await this.requireRow(teamId, id);
    if (dashboard.access_mode !== "protected") {
      throw new BadRequestException("Protected access is not enabled");
    }
    const accessKey = createSecret("mim_dash");
    await this.database.run(
      "UPDATE dashboards SET access_key_hash = ?, updated_at = ? WHERE id = ? AND team_id = ?",
      hashSecret(accessKey),
      new Date().toISOString(),
      id,
      teamId
    );
    await this.audit.record({
      teamId,
      userId,
      action: "dashboard.access_key_regenerated",
      subjectType: "dashboard",
      subjectId: id,
    });
    return { accessKey };
  }

  async revokeAccessKey(userId: string, teamId: string, id: string): Promise<void> {
    await this.access.require(userId, teamId, "admin");
    const dashboard = await this.requireRow(teamId, id);
    if (dashboard.access_mode !== "protected") {
      throw new BadRequestException("Protected access is not enabled");
    }
    if (!dashboard.access_key_hash) return;
    await this.database.run(
      "UPDATE dashboards SET access_key_hash = NULL, updated_at = ? WHERE id = ? AND team_id = ?",
      new Date().toISOString(),
      id,
      teamId
    );
    await this.audit.record({
      teamId,
      userId,
      action: "dashboard.access_key_revoked",
      subjectType: "dashboard",
      subjectId: id,
    });
  }

  async view(
    id: string,
    user: { id: string } | undefined,
    accessKey: string | undefined
  ): Promise<DashboardView> {
    const row = await this.database.get<DashboardRow>(
      `${this.selectSql()} WHERE d.id = ? GROUP BY d.id`,
      id
    );
    if (!row) throw new NotFoundException("Dashboard not found");
    if (row.access_mode === "private") {
      if (!user) throw new UnauthorizedException("Sign in required");
      const membership = await this.database.get(
        "SELECT 1 FROM team_members WHERE team_id = ? AND user_id = ?",
        row.team_id,
        user.id
      );
      if (!membership) throw new NotFoundException("Dashboard not found");
    }
    if (
      row.access_mode === "protected" &&
      (!accessKey ||
        accessKey.length > 200 ||
        !row.access_key_hash ||
        !verifySecret(accessKey, row.access_key_hash))
    ) {
      throw new NotFoundException("Dashboard not found");
    }
    return this.data.render(
      row.team_id,
      { id: row.id, name: row.name, slug: row.slug, updatedAt: row.updated_at },
      await this.items(row.id)
    );
  }

  private async validateItems(
    teamId: string,
    inputs: DashboardItemDto[],
    dashboardId?: string
  ): Promise<DashboardItem[]> {
    const ids = inputs.map((item) => item.id);
    if (new Set(ids).size !== ids.length) {
      throw new BadRequestException("Dashboard item identifiers must be unique");
    }
    if (ids.length) {
      const placeholders = ids.map(() => "?").join(",");
      const conflict = dashboardId
        ? await this.database.get<{ count: number }>(
            `SELECT COUNT(*) AS count FROM dashboard_items
             WHERE id IN (${placeholders}) AND dashboard_id != ?`,
            ...ids,
            dashboardId
          )
        : await this.database.get<{ count: number }>(
            `SELECT COUNT(*) AS count FROM dashboard_items WHERE id IN (${placeholders})`,
            ...ids
          );
      if (conflict?.count) throw new BadRequestException("A dashboard item is unavailable");
    }

    const resourceIds = [
      ...new Set(inputs.flatMap((item) => (item.resourceId ? [item.resourceId] : []))),
    ];
    if (resourceIds.length) {
      const count = await this.database.get<{ count: number }>(
        `SELECT COUNT(*) AS count FROM resources
         WHERE team_id = ? AND id IN (${resourceIds.map(() => "?").join(",")})`,
        teamId,
        ...resourceIds
      );
      if (count?.count !== resourceIds.length) {
        throw new BadRequestException("A dashboard resource is unavailable");
      }
    }
    return inputs.map((item) => this.validatedItem(item));
  }

  private validatedItem(input: DashboardItemDto): DashboardItem {
    const base = { id: input.id, title: input.title.trim(), width: input.width };
    if (input.type === "metric") {
      if (
        !input.metric ||
        !input.windowDays ||
        input.limit !== undefined ||
        (resourceMetricNames.some((metric) => metric === input.metric) && !input.resourceId) ||
        ((input.metric === "monitorCount" || input.metric === "openIncidents") &&
          input.windowDays !== 1)
      ) {
        throw new BadRequestException("Metric configuration is invalid");
      }
      return {
        ...base,
        type: "metric",
        metric: input.metric,
        resourceId: input.resourceId ?? null,
        windowDays: input.windowDays,
      };
    }
    if (input.type === "uptime") {
      if (
        !input.resourceId ||
        !input.windowDays ||
        input.windowDays === 1 ||
        input.metric !== undefined ||
        input.limit !== undefined
      ) {
        throw new BadRequestException("Uptime configuration is invalid");
      }
      return {
        ...base,
        type: "uptime",
        resourceId: input.resourceId,
        windowDays: input.windowDays,
      };
    }
    if (input.type === "status") {
      if (
        !input.resourceId ||
        input.metric !== undefined ||
        input.windowDays !== undefined ||
        input.limit !== undefined
      ) {
        throw new BadRequestException("Status configuration is invalid");
      }
      return { ...base, type: "status", resourceId: input.resourceId };
    }
    if (!input.limit || input.metric !== undefined || input.windowDays !== undefined) {
      throw new BadRequestException("Incident configuration is invalid");
    }
    return {
      ...base,
      type: "incidents",
      resourceId: input.resourceId ?? null,
      limit: input.limit,
    };
  }

  private async replaceItems(dashboardId: string, items: DashboardItem[]): Promise<void> {
    await this.database.run("DELETE FROM dashboard_items WHERE dashboard_id = ?", dashboardId);
    if (!items.length) return;
    const placeholders = items.map(() => "(?, ?, ?, ?, ?, ?, ?, ?)").join(",");
    await this.database.run(
      `INSERT INTO dashboard_items
       (id, dashboard_id, resource_id, type, title, width, position, configuration_json)
       VALUES ${placeholders}`,
      ...items.flatMap((item, position) => [
        item.id,
        dashboardId,
        item.resourceId,
        item.type,
        item.title,
        item.width,
        position,
        JSON.stringify(this.storedConfiguration(item)),
      ])
    );
  }

  private storedConfiguration(item: DashboardItem): StoredItemConfiguration {
    switch (item.type) {
      case "metric":
        return { metric: item.metric, windowDays: item.windowDays };
      case "uptime":
        return { windowDays: item.windowDays };
      case "status":
        return {};
      case "incidents":
        return { limit: item.limit };
      default:
        return unreachable(item);
    }
  }

  private async items(dashboardId: string): Promise<DashboardItem[]> {
    const rows = await this.database.all<DashboardItemRow>(
      `SELECT id, type, title, width, resource_id, configuration_json::text AS configuration_json
       FROM dashboard_items WHERE dashboard_id = ? ORDER BY position`,
      dashboardId
    );
    return rows.map((row) => this.item(row));
  }

  private item(row: DashboardItemRow): DashboardItem {
    const width = row.width;
    if (!isDashboardWidth(width)) throw new Error("Dashboard item width is invalid");
    const configuration = this.readStoredConfiguration(row);
    const base = {
      id: row.id,
      title: row.title,
      width,
    };
    switch (configuration.type) {
      case "metric":
        return {
          ...base,
          type: "metric",
          metric: configuration.metric,
          resourceId: configuration.resourceId,
          windowDays: configuration.windowDays,
        };
      case "uptime":
        return {
          ...base,
          type: "uptime",
          resourceId: configuration.resourceId,
          windowDays: configuration.windowDays,
        };
      case "status":
        return { ...base, type: "status", resourceId: configuration.resourceId };
      case "incidents":
        return {
          ...base,
          type: "incidents",
          resourceId: configuration.resourceId,
          limit: configuration.limit,
        };
      default:
        return unreachable(configuration);
    }
  }

  private readStoredConfiguration(row: DashboardItemRow): ParsedItemConfiguration {
    const value: unknown = JSON.parse(row.configuration_json);
    if (!isRecord(value)) throw new Error("Dashboard item configuration is invalid");
    if (row.type === "metric") {
      if (!isDashboardMetric(value.metric) || !isDashboardWindowDays(value.windowDays)) {
        throw new Error("Dashboard metric configuration is invalid");
      }
      return {
        type: "metric",
        metric: value.metric,
        windowDays: value.windowDays,
        resourceId: row.resource_id,
      };
    }
    if (row.type === "uptime") {
      if (!row.resource_id || !isUptimeWindowDays(value.windowDays)) {
        throw new Error("Dashboard uptime configuration is invalid");
      }
      return { type: "uptime", windowDays: value.windowDays, resourceId: row.resource_id };
    }
    if (row.type === "status") {
      if (!row.resource_id) throw new Error("Dashboard status configuration is invalid");
      return { type: "status", resourceId: row.resource_id };
    }
    if (!isDashboardIncidentLimit(value.limit)) {
      throw new Error("Dashboard incident configuration is invalid");
    }
    return { type: "incidents", limit: value.limit, resourceId: row.resource_id };
  }

  private async configuration(row: DashboardRow): Promise<DashboardConfiguration> {
    return { ...this.summary(row), items: await this.items(row.id) };
  }

  private summary(row: DashboardRow): DashboardSummary {
    return {
      id: row.id,
      teamId: row.team_id,
      name: row.name,
      slug: row.slug,
      accessMode: row.access_mode,
      hasAccessKey: Boolean(row.access_key_hash),
      itemCount: row.item_count,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private rows(where: string, ...parameters: string[]): Promise<DashboardRow[]> {
    return this.database.all<DashboardRow>(
      `${this.selectSql()} WHERE ${where} GROUP BY d.id ORDER BY LOWER(d.name)`,
      ...parameters
    );
  }

  private async requireRow(teamId: string, id: string): Promise<DashboardRow> {
    const row = await this.database.get<DashboardRow>(
      `${this.selectSql()} WHERE d.team_id = ? AND d.id = ? GROUP BY d.id`,
      teamId,
      id
    );
    if (!row) throw new NotFoundException("Dashboard not found");
    return row;
  }

  private selectSql(): string {
    return `SELECT d.*, COUNT(di.id)::integer AS item_count FROM dashboards d
      LEFT JOIN dashboard_items di ON di.dashboard_id = d.id`;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isDashboardWidth(value: number): value is DashboardWidth {
  return value === 1 || value === 2 || value === 3;
}

function isDashboardMetric(value: unknown): value is DashboardMetric {
  return typeof value === "string" && dashboardMetrics.some((metric) => metric === value);
}

function isDashboardWindowDays(value: unknown): value is DashboardWindowDays {
  return typeof value === "number" && dashboardWindowDays.some((days) => days === value);
}

function isUptimeWindowDays(value: unknown): value is 7 | 30 | 90 {
  return value === 7 || value === 30 || value === 90;
}

function isDashboardIncidentLimit(value: unknown): value is DashboardIncidentLimit {
  return typeof value === "number" && dashboardIncidentLimits.some((limit) => limit === value);
}

function unreachable(_value: never): never {
  throw new Error("Unsupported dashboard value");
}
