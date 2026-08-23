import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type {
  CheckConfig,
  CheckExecution,
  CheckSummary,
  CheckType,
  AgentCapability,
  AgentKind,
} from "@mimorii/contracts";
import { randomUUID } from "node:crypto";
import { AuditService } from "../common/audit.service.js";
import { encryptConfiguration } from "../common/crypto.js";
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

interface ResourceRow {
  id: string;
}

const secretCheckTypes = new Set<CheckType>(["http", "database"]);

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
    await this.requireResource(teamId, input.resourceId);
    const config = this.configs.validate(input.type, input.config);
    const execution = this.execution(input.execution);
    await this.validateExecution(input.resourceId, input.type, config, execution, teamId);
    if (!secretCheckTypes.has(input.type) && input.secret !== undefined && input.secret !== null) {
      throw new BadRequestException("Secrets are not available for this check type");
    }
    const encryptedSecret =
      secretCheckTypes.has(input.type) && input.secret ? encryptConfiguration(input.secret) : null;
    this.validateSecret(input.type, config, encryptedSecret);

    const id = randomUUID();
    const now = new Date().toISOString();
    const enabled = input.enabled !== false;
    await this.database.run(
      `INSERT INTO checks
       (id, team_id, resource_id, name, type, config_json, agent_id, encrypted_secret,
        interval_seconds, timeout_ms,
        failure_threshold, recovery_threshold, enabled, current_status, next_check_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      id,
      teamId,
      input.resourceId,
      input.name.trim(),
      input.type,
      JSON.stringify(config),
      execution.kind === "agent" ? execution.agentId : null,
      encryptedSecret,
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
      metadata: { type: input.type, execution: execution.kind },
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
    await this.requireResource(teamId, resourceId);
    const type = input.type ?? current.type;
    const config = this.configs.validate(
      type,
      input.config ?? (JSON.parse(current.config_json) as Record<string, unknown>)
    );
    const execution = input.execution
      ? this.execution(input.execution)
      : current.agent_id
        ? ({ kind: "agent", agentId: current.agent_id } as const)
        : ({ kind: "direct" } as const);
    await this.validateExecution(resourceId, type, config, execution, teamId);
    if (!secretCheckTypes.has(type) && input.secret !== undefined && input.secret !== null) {
      throw new BadRequestException("Secrets are not available for this check type");
    }
    const encryptedSecret = !secretCheckTypes.has(type)
      ? null
      : input.secret === undefined
        ? current.encrypted_secret
        : input.secret
          ? encryptConfiguration(input.secret)
          : null;
    this.validateSecret(type, config, encryptedSecret);
    const enabled = input.enabled ?? Boolean(current.enabled);
    const now = new Date().toISOString();

    await this.database.run(
      `UPDATE checks SET resource_id = ?, name = ?, type = ?, config_json = ?, agent_id = ?,
       encrypted_secret = ?, interval_seconds = ?,
       timeout_ms = ?, failure_threshold = ?, recovery_threshold = ?, enabled = ?, current_status = ?,
       next_check_at = ?, updated_at = ? WHERE id = ? AND team_id = ?`,
      resourceId,
      input.name?.trim() ?? current.name,
      type,
      JSON.stringify(config),
      execution.kind === "agent" ? execution.agentId : null,
      encryptedSecret,
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
      execution: row.agent_id ? { kind: "agent", agentId: row.agent_id } : { kind: "direct" },
      secretConfigured: Boolean(row.encrypted_secret),
      consecutiveFailures: row.consecutive_failures,
      lastCheckedAt: row.last_checked_at,
      nextCheckAt: row.next_check_at,
      lastLatencyMs: row.last_latency_ms,
      uptime24h: row.uptime_24h,
      uptime30d: row.uptime_30d,
      createdAt: row.created_at,
    };
  }

  private async requireResource(teamId: string, resourceId: string): Promise<ResourceRow> {
    const resource = await this.database.get<ResourceRow>(
      "SELECT id FROM resources WHERE id = ? AND team_id = ?",
      resourceId,
      teamId
    );
    if (!resource) throw new BadRequestException("Resource is unavailable");
    return resource;
  }

  private async validateExecution(
    resourceId: string,
    type: CheckType,
    config: CheckConfig,
    execution: CheckExecution,
    teamId: string
  ) {
    if (execution.kind === "agent") {
      const agent = await this.database.get<{
        kind: AgentKind;
        capabilities_json: string;
        resource_id: string;
      }>(
        `SELECT kind, capabilities_json, resource_id FROM agents
         WHERE id = ? AND team_id = ? AND revoked_at IS NULL`,
        execution.agentId,
        teamId
      );
      const capabilities = agent ? (JSON.parse(agent.capabilities_json) as AgentCapability[]) : [];
      if (agent?.kind !== "desktop" || !capabilities.includes(type)) {
        throw new BadRequestException(`Assigned agent does not support ${type} checks`);
      }
      if (["host", "disk", "docker"].includes(type) && agent.resource_id !== resourceId) {
        throw new BadRequestException(`${type} checks must belong to the agent resource`);
      }
      return;
    }
    if (type === "host" || type === "disk" || type === "docker") {
      throw new BadRequestException(`${type} checks require their resource agent`);
    }
    if (type === "http") {
      const url = this.targets.validateHttpUrl((config as { target: { url: string } }).target.url);
      await this.targets.resolvePublicHost(url.hostname);
      return;
    }
    if (type === "tcp") {
      await this.targets.resolvePublicHost((config as { target: { host: string } }).target.host);
      return;
    }
    if (type === "dns") {
      this.targets.normalizeHost((config as { target: { hostname: string } }).target.hostname);
      return;
    }
    if (type === "icmp") {
      await this.targets.resolvePublicHost((config as { target: { host: string } }).target.host);
      return;
    }
    if (type === "wan") {
      await Promise.all(
        (config as { targets: Array<{ host: string }> }).targets.map((target) =>
          this.targets.resolvePublicHost(target.host)
        )
      );
      return;
    }
    if (type === "database") {
      await this.targets.resolvePublicHost((config as { target: { host: string } }).target.host);
    }
  }

  private execution(value: { kind: "direct" | "agent"; agentId?: string }): CheckExecution {
    if (value.kind === "direct") {
      if (value.agentId) throw new BadRequestException("Direct execution cannot specify an agent");
      return { kind: "direct" };
    }
    if (!value.agentId) throw new BadRequestException("Agent execution requires an agent");
    return { kind: "agent", agentId: value.agentId };
  }

  private validateSecret(
    type: CheckType,
    config: CheckConfig,
    encryptedSecret: string | null
  ): void {
    if (type !== "http") return;
    const secretHeaderName = (config as { target: { secretHeaderName?: string } }).target
      .secretHeaderName;
    if (Boolean(secretHeaderName) !== Boolean(encryptedSecret)) {
      throw new BadRequestException(
        "HTTP secret header name and value must be configured together"
      );
    }
  }
}
