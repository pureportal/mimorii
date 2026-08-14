import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type { CheckStatus, ResourceKind, ResourceSummary } from "@mimorii/contracts";
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
  target: string;
  description: string | null;
  tags_json: string;
  agent_id: string | null;
  status: CheckStatus;
  checks_up: number;
  checks_total: number;
  last_checked_at: string | null;
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
    await this.requireAgent(teamId, input.agentId);

    const id = randomUUID();
    const now = new Date().toISOString();
    const tags = this.tags(input.tags);
    await this.database.run(
      `INSERT INTO resources
       (id, team_id, name, kind, target, description, tags_json, agent_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      id,
      teamId,
      input.name.trim(),
      input.kind,
      input.target.trim(),
      input.description?.trim() || null,
      JSON.stringify(tags),
      input.agentId ?? null,
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
      target: string;
      description: string | null;
      tags_json: string;
      agent_id: string | null;
    }>("SELECT * FROM resources WHERE team_id = ? AND id = ?", teamId, id);
    if (!current) throw new NotFoundException("Resource not found");
    await this.requireAgent(teamId, input.agentId);

    await this.database.run(
      `UPDATE resources SET name = ?, kind = ?, target = ?, description = ?, tags_json = ?,
       agent_id = ?, updated_at = ? WHERE id = ? AND team_id = ?`,
      input.name?.trim() ?? current.name,
      input.kind ?? current.kind,
      input.target?.trim() ?? current.target,
      input.description === undefined ? current.description : input.description.trim() || null,
      input.tags === undefined ? current.tags_json : JSON.stringify(this.tags(input.tags)),
      input.agentId === undefined ? current.agent_id : input.agentId,
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
        SUM(CASE WHEN c.current_status = 'up' THEN 1 ELSE 0 END) AS checks_up,
        COUNT(c.id) AS checks_total,
        MAX(c.last_checked_at) AS last_checked_at
      FROM resources r LEFT JOIN checks c ON c.resource_id = r.id
      ${where}
      GROUP BY r.id
      ORDER BY LOWER(r.name)`;
  }

  private async map(row: ResourceRow): Promise<ResourceSummary> {
    return {
      id: row.id,
      teamId: row.team_id,
      name: row.name,
      kind: row.kind,
      target: row.target,
      description: row.description,
      tags: JSON.parse(row.tags_json) as string[],
      agentId: row.agent_id,
      status: row.status,
      checksUp: row.checks_up,
      checksTotal: row.checks_total,
      lastCheckedAt: row.last_checked_at,
      inMaintenance: await this.maintenance.isResourceActive(row.id),
      createdAt: row.created_at,
    };
  }

  private tags(tags: string[] | undefined): string[] {
    return [...new Set((tags ?? []).map((tag) => tag.trim()).filter(Boolean))].map((tag) =>
      tag.slice(0, 32)
    );
  }

  private async requireAgent(teamId: string, agentId: string | null | undefined): Promise<void> {
    if (!agentId) return;
    const agent = await this.database.get(
      "SELECT id FROM agents WHERE id = ? AND team_id = ? AND revoked_at IS NULL",
      agentId,
      teamId
    );
    if (!agent) throw new BadRequestException("Agent is unavailable");
  }
}
