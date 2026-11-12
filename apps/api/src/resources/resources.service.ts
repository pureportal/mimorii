import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type {
  AgentKind,
  AgentStatus,
  MonitorStatus,
  ResourceKind,
  ResourceSummary,
} from "@mimorii/contracts";
import { randomUUID } from "node:crypto";
import { AuditService } from "../common/audit.service.js";
import { resolveAgentStatus } from "../common/agent-status.js";
import { ResourceHealthService } from "../common/resource-health.service.js";
import { DatabaseService } from "../database/database.service.js";
import { TeamAccessService } from "../teams/team-access.service.js";
import { MaintenanceService } from "../maintenance/maintenance.service.js";
import { logStreamMatchers, parseLogQueryInput } from "../logs/log-query-sql.js";
import { LogSearchService } from "../logs/log-search.service.js";
import type { CreateResourceDto, UpdateResourceDto } from "./resources.dto.js";

interface ResourceRow {
  id: string;
  team_id: string;
  name: string;
  kind: ResourceKind;
  description: string | null;
  tags_json: string;
  log_query: string | null;
  agent_id: string | null;
  agent_kind: AgentKind | null;
  agent_platform: string | null;
  agent_version: string | null;
  agent_last_seen_at: string | null;
  agent_collection_interval_seconds: number | null;
  checks_passing: number;
  checks_total: number;
  last_checked_at: string | null;
  image_updated_at: string | null;
  created_at: string;
}

@Injectable()
export class ResourcesService {
  constructor(
    private readonly database: DatabaseService,
    private readonly access: TeamAccessService,
    private readonly maintenance: MaintenanceService,
    private readonly audit: AuditService,
    private readonly health: ResourceHealthService,
    private readonly logSearch: LogSearchService
  ) {}

  async list(userId: string, teamId: string): Promise<ResourceSummary[]> {
    await this.access.require(userId, teamId, "viewer");
    const rows = await this.database.all<ResourceRow>(
      this.selectSql("WHERE r.team_id = ?"),
      teamId
    );
    const statuses = await this.health.forResources(
      teamId,
      rows.map((resource) => resource.id)
    );
    return Promise.all(
      rows.map((resource) => this.map(resource, statuses.get(resource.id) ?? "pending"))
    );
  }

  async get(userId: string, teamId: string, id: string): Promise<ResourceSummary> {
    await this.access.require(userId, teamId, "viewer");
    const row = await this.database.get<ResourceRow>(
      this.selectSql("WHERE r.team_id = ? AND r.id = ?"),
      teamId,
      id
    );
    if (!row) throw new NotFoundException("Resource not found");
    const statuses = await this.health.forResources(teamId, [row.id]);
    return this.map(row, statuses.get(row.id) ?? "pending");
  }

  async create(userId: string, teamId: string, input: CreateResourceDto): Promise<ResourceSummary> {
    await this.access.require(userId, teamId, "member");
    const count = (await this.database.get<{ count: number }>(
      "SELECT COUNT(*) AS count FROM resources WHERE team_id = ?",
      teamId
    ))!.count;
    if (count >= 1_000) throw new BadRequestException("Resource limit reached");
    const id = randomUUID();
    const now = new Date().toISOString();
    const tags = this.tags(input.tags);
    const logQuery = await this.logQuery(input.logQuery);
    await this.database.run(
      `INSERT INTO resources
       (id, team_id, name, kind, description, tags_json, log_query, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      id,
      teamId,
      input.name.trim(),
      input.kind,
      input.description?.trim() || null,
      JSON.stringify(tags),
      logQuery ?? null,
      now,
      now
    );
    await this.audit.record({
      teamId,
      userId,
      action: "resource.created",
      subjectType: "resource",
      subjectId: id,
    });
    return this.get(userId, teamId, id);
  }

  async update(
    userId: string,
    teamId: string,
    id: string,
    input: UpdateResourceDto
  ): Promise<ResourceSummary> {
    await this.access.require(userId, teamId, "member");
    const current = await this.database.get<{
      name: string;
      kind: ResourceKind;
      description: string | null;
      tags_json: string;
      log_query: string | null;
    }>("SELECT * FROM resources WHERE team_id = ? AND id = ?", teamId, id);
    if (!current) throw new NotFoundException("Resource not found");
    const logQuery = await this.logQuery(input.logQuery);

    await this.database.run(
      `UPDATE resources SET name = ?, kind = ?, description = ?, tags_json = ?, log_query = ?,
       updated_at = ? WHERE id = ? AND team_id = ?`,
      input.name?.trim() ?? current.name,
      input.kind ?? current.kind,
      input.description === undefined ? current.description : input.description.trim() || null,
      input.tags === undefined ? current.tags_json : JSON.stringify(this.tags(input.tags)),
      logQuery === undefined ? current.log_query : logQuery,
      new Date().toISOString(),
      id,
      teamId
    );
    await this.audit.record({
      teamId,
      userId,
      action: "resource.updated",
      subjectType: "resource",
      subjectId: id,
    });
    return this.get(userId, teamId, id);
  }

  async remove(userId: string, teamId: string, id: string): Promise<void> {
    await this.access.require(userId, teamId, "member");
    const agent = await this.database.get<{ id: string }>(
      "SELECT id FROM agents WHERE resource_id = ?",
      id
    );
    if (agent) {
      await this.access.require(userId, teamId, "admin");
      const assigned = await this.database.get<{ count: number }>(
        `SELECT COUNT(*)::int AS count FROM checks c
         JOIN agents a ON a.id = c.agent_id
         WHERE a.resource_id = ? AND c.resource_id != ?`,
        id,
        id
      );
      if (assigned?.count) {
        throw new BadRequestException("Reassign checks that use this agent before deleting it");
      }
    }
    const result = agent
      ? await this.database.transaction(async () => {
          await this.database.run(
            "DELETE FROM checks WHERE resource_id = ? AND team_id = ?",
            id,
            teamId
          );
          return this.database.run(
            "DELETE FROM resources WHERE id = ? AND team_id = ?",
            id,
            teamId
          );
        })
      : await this.database.run("DELETE FROM resources WHERE id = ? AND team_id = ?", id, teamId);
    if (result.changes === 0) throw new NotFoundException("Resource not found");
    await this.audit.record({
      teamId,
      userId,
      action: "resource.deleted",
      subjectType: "resource",
      subjectId: id,
    });
  }

  private selectSql(where: string): string {
    return `
      SELECT r.*,
        a.id AS agent_id,
        a.kind AS agent_kind,
        a.platform AS agent_platform,
        a.version AS agent_version,
        a.last_seen_at AS agent_last_seen_at,
        a.collection_interval_seconds AS agent_collection_interval_seconds,
        SUM(CASE WHEN c.current_status = 'up' THEN 1 ELSE 0 END) AS checks_passing,
        COUNT(c.id) AS checks_total,
        MAX(c.last_checked_at) AS last_checked_at,
        (SELECT ri.updated_at FROM resource_images ri WHERE ri.resource_id = r.id) AS image_updated_at
      FROM resources r
      LEFT JOIN agents a ON a.resource_id = r.id AND a.revoked_at IS NULL
      LEFT JOIN checks c ON c.resource_id = r.id
      ${where}
      GROUP BY r.id, a.id
      ORDER BY LOWER(r.name)`;
  }

  private async map(row: ResourceRow, status: MonitorStatus): Promise<ResourceSummary> {
    return {
      id: row.id,
      teamId: row.team_id,
      name: row.name,
      kind: row.kind,
      description: row.description,
      tags: JSON.parse(row.tags_json) as string[],
      logQuery: row.log_query,
      agent: row.agent_id
        ? {
            id: row.agent_id,
            kind: row.agent_kind!,
            status: this.agentStatus(row),
            platform: row.agent_platform,
            version: row.agent_version,
            lastSeenAt: row.agent_last_seen_at,
          }
        : null,
      status,
      checksPassing: row.checks_passing,
      checksTotal: row.checks_total,
      lastCheckedAt: row.last_checked_at,
      inMaintenance: await this.maintenance.isResourceActive(row.id),
      imageUpdatedAt: row.image_updated_at,
      createdAt: row.created_at,
    };
  }

  private async logQuery(value: string | null | undefined): Promise<string | null | undefined> {
    if (value === undefined) return undefined;
    const text = value?.trim();
    if (!text) return null;
    const query = parseLogQueryInput(text);
    if (!logStreamMatchers(query).length) {
      throw new BadRequestException("Log query must select streams by label");
    }
    await this.logSearch.validate(query);
    return text;
  }

  private tags(tags: string[] | undefined): string[] {
    return [...new Set((tags ?? []).map((tag) => tag.trim()).filter(Boolean))].map((tag) =>
      tag.slice(0, 32)
    );
  }

  private agentStatus(row: ResourceRow): AgentStatus {
    return resolveAgentStatus({
      kind: row.agent_kind!,
      collectionIntervalSeconds: row.agent_collection_interval_seconds ?? 30,
      lastSeenAt: row.agent_last_seen_at,
    });
  }
}
