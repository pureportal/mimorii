import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type {
  AgentKind,
  AgentStatus,
  CheckStatus,
  ResourceKind,
  ResourceSummary,
} from "@mimorii/contracts";
import { randomUUID } from "node:crypto";
import { AuditService } from "../common/audit.service.js";
import { DatabaseService } from "../database/database.service.js";
import { TeamAccessService } from "../teams/team-access.service.js";
import { MaintenanceService } from "../maintenance/maintenance.service.js";
import type { CreateResourceDto, UpdateResourceDto } from "./resources.dto.js";

interface ResourceRow {
  id: string;
  team_id: string;
  name: string;
  kind: ResourceKind;
  description: string | null;
  tags_json: string;
  agent_id: string | null;
  agent_kind: AgentKind | null;
  agent_platform: string | null;
  agent_version: string | null;
  agent_last_seen_at: string | null;
  agent_collection_interval_seconds: number | null;
  status: CheckStatus;
  has_monitors: boolean;
  checks_up: number;
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
    private readonly audit: AuditService
  ) {}

  async list(userId: string, teamId: string): Promise<ResourceSummary[]> {
    await this.access.require(userId, teamId, "viewer");
    const rows = await this.database.all<ResourceRow>(
      this.selectSql("WHERE r.team_id = ?"),
      teamId
    );
    return Promise.all(rows.map((resource) => this.map(resource)));
  }

  async get(userId: string, teamId: string, id: string): Promise<ResourceSummary> {
    await this.access.require(userId, teamId, "viewer");
    const row = await this.database.get<ResourceRow>(
      this.selectSql("WHERE r.team_id = ? AND r.id = ?"),
      teamId,
      id
    );
    if (!row) throw new NotFoundException("Resource not found");
    return this.map(row);
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
    await this.database.run(
      `INSERT INTO resources
       (id, team_id, name, kind, description, tags_json, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      id,
      teamId,
      input.name.trim(),
      input.kind,
      input.description?.trim() || null,
      JSON.stringify(tags),
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
    }>("SELECT * FROM resources WHERE team_id = ? AND id = ?", teamId, id);
    if (!current) throw new NotFoundException("Resource not found");

    await this.database.run(
      `UPDATE resources SET name = ?, kind = ?, description = ?, tags_json = ?,
       updated_at = ? WHERE id = ? AND team_id = ?`,
      input.name?.trim() ?? current.name,
      input.kind ?? current.kind,
      input.description === undefined ? current.description : input.description.trim() || null,
      input.tags === undefined ? current.tags_json : JSON.stringify(this.tags(input.tags)),
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
        "SELECT COUNT(*)::int AS count FROM checks WHERE agent_id = ? AND resource_id != ?",
        agent.id,
        id
      );
      if (assigned?.count) {
        throw new BadRequestException("Reassign checks that use this agent before deleting it");
      }
    }
    const result = await this.database.run(
      "DELETE FROM resources WHERE id = ? AND team_id = ?",
      id,
      teamId
    );
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
        CASE
          WHEN COUNT(c.id) = 0 AND NOT EXISTS (
            SELECT 1 FROM heartbeat_monitors hm WHERE hm.resource_id = r.id
          ) THEN 'pending'
          WHEN SUM(CASE WHEN c.current_status = 'down' THEN 1 ELSE 0 END) > 0 OR EXISTS (
            SELECT 1 FROM heartbeat_monitors hm
            WHERE hm.resource_id = r.id AND hm.current_status = 'down'
          ) THEN 'down'
          WHEN SUM(CASE WHEN c.current_status = 'degraded' THEN 1 ELSE 0 END) > 0 THEN 'degraded'
          WHEN SUM(CASE WHEN c.current_status = 'up' THEN 1 ELSE 0 END) > 0 OR EXISTS (
            SELECT 1 FROM heartbeat_monitors hm
            WHERE hm.resource_id = r.id AND hm.current_status = 'up'
          ) THEN 'up'
          WHEN (COUNT(c.id) = 0 OR SUM(CASE WHEN c.current_status = 'paused' THEN 1 ELSE 0 END) = COUNT(c.id))
            AND NOT EXISTS (
              SELECT 1 FROM heartbeat_monitors hm
              WHERE hm.resource_id = r.id AND hm.current_status != 'paused'
            ) THEN 'paused'
          ELSE 'pending'
        END AS status,
        (COUNT(c.id) > 0 OR EXISTS (
          SELECT 1 FROM heartbeat_monitors hm WHERE hm.resource_id = r.id
        )) AS has_monitors,
        SUM(CASE WHEN c.current_status = 'up' THEN 1 ELSE 0 END) AS checks_up,
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

  private async map(row: ResourceRow): Promise<ResourceSummary> {
    return {
      id: row.id,
      teamId: row.team_id,
      name: row.name,
      kind: row.kind,
      description: row.description,
      tags: JSON.parse(row.tags_json) as string[],
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
      status: this.resourceStatus(row),
      checksUp: row.checks_up,
      checksTotal: row.checks_total,
      lastCheckedAt: row.last_checked_at,
      inMaintenance: await this.maintenance.isResourceActive(row.id),
      imageUpdatedAt: row.image_updated_at,
      createdAt: row.created_at,
    };
  }

  private tags(tags: string[] | undefined): string[] {
    return [...new Set((tags ?? []).map((tag) => tag.trim()).filter(Boolean))].map((tag) =>
      tag.slice(0, 32)
    );
  }

  private resourceStatus(row: ResourceRow): CheckStatus {
    if (!row.agent_id) return row.status;
    const agentStatus = this.agentStatus(row);
    if (agentStatus === "offline") return "down";
    if (agentStatus === "stale" && row.status !== "down") return "degraded";
    if (agentStatus === "online" && !row.has_monitors) return "up";
    return row.status;
  }

  private agentStatus(row: ResourceRow): AgentStatus {
    if (!row.agent_last_seen_at) return "never";
    const interval = (row.agent_collection_interval_seconds ?? 30) * 1_000;
    const age = Date.now() - new Date(row.agent_last_seen_at).getTime();
    const online = row.agent_kind === "mobile" ? Math.max(30 * 60_000, interval * 2) : 90_000;
    const stale = row.agent_kind === "mobile" ? Math.max(2 * 60 * 60_000, interval * 4) : 300_000;
    return age <= online ? "online" : age <= stale ? "stale" : "offline";
  }
}
