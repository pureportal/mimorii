import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type { CheckConfig, CheckSummary, CheckType } from "@mimorii/contracts";
import { randomUUID } from "node:crypto";
import { AuditService } from "../common/audit.service.js";
import { DatabaseService } from "../database/database.service.js";
import { TeamAccessService } from "../teams/team-access.service.js";
import { CheckConfigService } from "./check-config.service.js";
import type { CreateCheckDto, UpdateCheckDto } from "./checks.dto.js";
import type { CheckRow } from "./checks.types.js";
import { ResultsService } from "./results.service.js";
import { TargetSafetyService } from "../common/target-safety.service.js";

interface CheckSummaryRow extends CheckRow {
  uptime_24h: number | null;
  uptime_30d: number | null;
}

interface ResourceExecutionRow {
  id: string;
  agent_id: string | null;
}

@Injectable()
export class ChecksService {
  constructor(
    private readonly database: DatabaseService,
    private readonly access: TeamAccessService,
    private readonly configs: CheckConfigService,
    private readonly targets: TargetSafetyService,
    private readonly results: ResultsService,
    private readonly audit: AuditService
  ) {}

  async list(userId: string, teamId: string, resourceId?: string): Promise<CheckSummary[]> {
    await this.access.require(userId, teamId, "viewer");
    const where = resourceId ? "c.team_id = ? AND c.resource_id = ?" : "c.team_id = ?";
    const parameters = resourceId ? [teamId, resourceId] : [teamId];
    const rows = await this.database.all<CheckSummaryRow>(this.selectSql(where), ...parameters);
    return rows.map((row) => this.map(row));
  }

  async get(userId: string, teamId: string, id: string): Promise<CheckSummary> {
    await this.access.require(userId, teamId, "viewer");
    const row = await this.database.get<CheckSummaryRow>(
      this.selectSql("c.team_id = ? AND c.id = ?"),
      teamId,
      id
    );
    if (!row) throw new NotFoundException("Check not found");
    return this.map(row);
  }

  async create(userId: string, teamId: string, input: CreateCheckDto): Promise<CheckSummary> {
    await this.access.require(userId, teamId, "member");
    const count = (await this.database.get<{ count: number }>(
      "SELECT COUNT(*) AS count FROM checks WHERE team_id = ?",
      teamId
    ))!.count;
    if (count >= 2_000) throw new BadRequestException("Check limit reached");
    const resource = await this.requireResource(teamId, input.resourceId);
    const config = this.configs.validate(input.type, input.config);
    await this.validateExecution(input.type, config, resource.agent_id);

    const id = randomUUID();
    const now = new Date().toISOString();
    const enabled = input.enabled !== false;
    await this.database.run(
      `INSERT INTO checks
       (id, team_id, resource_id, name, type, config_json, interval_seconds, timeout_ms,
        failure_threshold, recovery_threshold, enabled, current_status, next_check_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      id,
      teamId,
      input.resourceId,
      input.name.trim(),
      input.type,
      JSON.stringify(config),
      input.intervalSeconds ?? 60,
      input.timeoutMs ?? 5_000,
      input.failureThreshold ?? 2,
      input.recoveryThreshold ?? 1,
      enabled ? 1 : 0,
      enabled ? "pending" : "paused",
      enabled ? now : null,
      now,
      now
    );
    await this.audit.record({
      teamId,
      userId,
      action: "check.created",
      subjectType: "check",
      subjectId: id,
      metadata: { type: input.type, routedThroughAgent: Boolean(resource.agent_id) },
    });
    return this.get(userId, teamId, id);
  }

  async update(
    userId: string,
    teamId: string,
    id: string,
    input: UpdateCheckDto
  ): Promise<CheckSummary> {
    await this.access.require(userId, teamId, "member");
    const current = await this.database.get<CheckRow>(
      "SELECT * FROM checks WHERE team_id = ? AND id = ?",
      teamId,
      id
    );
    if (!current) throw new NotFoundException("Check not found");
    const resourceId = input.resourceId ?? current.resource_id;
    const resource = await this.requireResource(teamId, resourceId);
    const type = input.type ?? current.type;
    const config = this.configs.validate(
      type,
      input.config ?? (JSON.parse(current.config_json) as Record<string, unknown>)
    );
    await this.validateExecution(type, config, resource.agent_id);
    const enabled = input.enabled ?? Boolean(current.enabled);
    const now = new Date().toISOString();

    await this.database.run(
      `UPDATE checks SET resource_id = ?, name = ?, type = ?, config_json = ?, interval_seconds = ?,
       timeout_ms = ?, failure_threshold = ?, recovery_threshold = ?, enabled = ?, current_status = ?,
       next_check_at = ?, updated_at = ? WHERE id = ? AND team_id = ?`,
      resourceId,
      input.name?.trim() ?? current.name,
      type,
      JSON.stringify(config),
      input.intervalSeconds ?? current.interval_seconds,
      input.timeoutMs ?? current.timeout_ms,
      input.failureThreshold ?? current.failure_threshold,
      input.recoveryThreshold ?? current.recovery_threshold,
      enabled ? 1 : 0,
      enabled
        ? current.current_status === "paused"
          ? "pending"
          : current.current_status
        : "paused",
      enabled ? (current.next_check_at ?? now) : null,
      now,
      id,
      teamId
    );
    await this.audit.record({
      teamId,
      userId,
      action: "check.updated",
      subjectType: "check",
      subjectId: id,
    });
    return this.get(userId, teamId, id);
  }

  async remove(userId: string, teamId: string, id: string): Promise<void> {
    await this.access.require(userId, teamId, "admin");
    const result = await this.database.run(
      "DELETE FROM checks WHERE id = ? AND team_id = ?",
      id,
      teamId
    );
    if (result.changes === 0) throw new NotFoundException("Check not found");
    await this.audit.record({
      teamId,
      userId,
      action: "check.deleted",
      subjectType: "check",
      subjectId: id,
    });
  }

  async history(
    userId: string,
    teamId: string,
    id: string,
    options: { from?: string; to?: string; limit?: number }
  ) {
    await this.access.require(userId, teamId, "viewer");
    if (
      !(await this.database.get("SELECT id FROM checks WHERE id = ? AND team_id = ?", id, teamId))
    ) {
      throw new NotFoundException("Check not found");
    }
    return this.results.history(id, options.from, options.to, options.limit);
  }

  private selectSql(where: string): string {
    return `
      SELECT c.*,
        AVG(CASE WHEN cr.checked_at::timestamptz >= CURRENT_TIMESTAMP - INTERVAL '24 hours'
          THEN CASE WHEN cr.status = 'down' THEN 0.0 ELSE 100.0 END END) AS uptime_24h,
        AVG(CASE WHEN cr.checked_at::timestamptz >= CURRENT_TIMESTAMP - INTERVAL '30 days'
          THEN CASE WHEN cr.status = 'down' THEN 0.0 ELSE 100.0 END END) AS uptime_30d
      FROM checks c LEFT JOIN check_results cr ON cr.check_id = c.id
      WHERE ${where}
      GROUP BY c.id
      ORDER BY LOWER(c.name)`;
  }

  private map(row: CheckSummaryRow): CheckSummary {
    return {
      id: row.id,
      resourceId: row.resource_id,
      teamId: row.team_id,
      name: row.name,
      type: row.type,
      status: row.current_status,
      enabled: Boolean(row.enabled),
      intervalSeconds: row.interval_seconds,
      timeoutMs: row.timeout_ms,
      failureThreshold: row.failure_threshold,
      recoveryThreshold: row.recovery_threshold,
      config: JSON.parse(row.config_json) as CheckConfig,
      consecutiveFailures: row.consecutive_failures,
      lastCheckedAt: row.last_checked_at,
      nextCheckAt: row.next_check_at,
      lastLatencyMs: row.last_latency_ms,
      uptime24h: row.uptime_24h,
      uptime30d: row.uptime_30d,
      createdAt: row.created_at,
    };
  }

  private async requireResource(teamId: string, resourceId: string): Promise<ResourceExecutionRow> {
    const resource = await this.database.get<ResourceExecutionRow>(
      "SELECT id, agent_id FROM resources WHERE id = ? AND team_id = ?",
      resourceId,
      teamId
    );
    if (!resource) throw new BadRequestException("Resource is unavailable");
    return resource;
  }

  private async validateExecution(type: CheckType, config: CheckConfig, agentId: string | null) {
    if (type === "host" || type === "disk") {
      if (!agentId) throw new BadRequestException("Host and disk checks require an agent");
      return;
    }
    if (agentId) return;
    if (type === "http") {
      const url = this.targets.validateHttpUrl((config as { url: string }).url);
      await this.targets.resolvePublicHost(url.hostname);
      return;
    }
    if (type === "tcp") {
      await this.targets.resolvePublicHost((config as { host: string }).host);
      return;
    }
    this.targets.normalizeHost((config as { hostname: string }).hostname);
  }
}
