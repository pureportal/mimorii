import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { Interval } from "@nestjs/schedule";
import type { AgentTask, CheckConfig, AgentCapability, AgentKind } from "@mimorii/contracts";
import { randomUUID } from "node:crypto";
import { decryptConfiguration } from "../common/crypto.js";
import { reconcileAgentRelationships } from "../common/agent-relationships.js";
import { DatabaseService } from "../database/database.service.js";
import { TeamAccessService } from "../teams/team-access.service.js";
import { CheckRunnerService } from "./check-runner.service.js";
import type { CheckRow } from "./checks.types.js";
import { ResultsService } from "./results.service.js";

interface ScheduledCheckRow extends CheckRow {
  agent_id: string | null;
  agent_kind: AgentKind | null;
  agent_capabilities_json: string | null;
}

@Injectable()
export class CheckOrchestratorService {
  private readonly running = new Set<string>();
  private schedulerBusy = false;

  constructor(
    private readonly database: DatabaseService,
    private readonly runner: CheckRunnerService,
    private readonly results: ResultsService,
    private readonly access: TeamAccessService
  ) {}

  @Interval(5_000)
  async tick(): Promise<void> {
    if (process.env.MIMORII_SCHEDULER_ENABLED === "false" || this.schedulerBusy) return;
    this.schedulerBusy = true;
    try {
      await reconcileAgentRelationships(this.database);
      await this.expireAgentTasks();
      const due = await this.database.all<ScheduledCheckRow>(
        `SELECT c.*, a.kind AS agent_kind,
          a.capabilities_json AS agent_capabilities_json
         FROM checks c
         LEFT JOIN agents a ON a.id = c.agent_id AND a.revoked_at IS NULL
         WHERE c.enabled = 1 AND c.next_check_at IS NOT NULL AND c.next_check_at <= ?
         ORDER BY c.next_check_at LIMIT 50`,
        new Date().toISOString()
      );
      for (const check of due) {
        if (check.agent_id && this.supportsAssignedCheck(check)) await this.queueAgentTask(check);
        else if (check.agent_id) await this.scheduleNext(check);
        else if (this.running.size < 8) void this.executeDirect(check);
      }
    } finally {
      this.schedulerBusy = false;
    }
  }

  async runNow(userId: string, teamId: string, checkId: string) {
    await this.access.require(userId, teamId, "member");
    const check = await this.database.get<ScheduledCheckRow>(
      `SELECT c.*, a.kind AS agent_kind,
        a.capabilities_json AS agent_capabilities_json
       FROM checks c
       LEFT JOIN agents a ON a.id = c.agent_id AND a.revoked_at IS NULL
       WHERE c.id = ? AND c.team_id = ?`,
      checkId,
      teamId
    );
    if (!check) throw new NotFoundException("Check not found");
    if (check.agent_id) {
      if (!this.supportsAssignedCheck(check)) {
        throw new BadRequestException("Assigned agent does not support this check");
      }
      const task = await this.queueAgentTask(check, true);
      return { queued: true, taskId: task?.id ?? null };
    }
    const result = await this.executeDirect(check);
    return { queued: false, result };
  }

  private async executeDirect(check: ScheduledCheckRow) {
    if (this.running.has(check.id)) return undefined;
    this.running.add(check.id);
    await this.scheduleNext(check);
    try {
      const result = await this.runner.run({
        id: check.id,
        type: check.type,
        config: JSON.parse(check.config_json) as CheckConfig,
        secret: check.encrypted_secret
          ? decryptConfiguration<string>(check.encrypted_secret)
          : null,
        timeoutMs: check.timeout_ms,
      });
      return this.results.record(check.id, result);
    } finally {
      this.running.delete(check.id);
    }
  }

  private async queueAgentTask(
    check: ScheduledCheckRow,
    force = false
  ): Promise<Pick<AgentTask, "id"> | undefined> {
    if (!check.agent_id || !this.supportsAssignedCheck(check)) return undefined;
    const existing = await this.database.get<{ id: string }>(
      `SELECT id FROM agent_tasks WHERE check_id = ? AND agent_id = ? AND status IN ('pending', 'claimed')`,
      check.id,
      check.agent_id
    );
    if (existing) {
      if (!force) await this.scheduleNext(check);
      return existing;
    }

    const issuedAt = new Date().toISOString();
    const task: AgentTask = {
      id: randomUUID(),
      checkId: check.id,
      type: check.type,
      timeoutMs: check.timeout_ms,
      config: JSON.parse(check.config_json) as CheckConfig,
      secret: null,
      faviconRequestId: null,
      issuedAt,
    };
    await this.database.run(
      `INSERT INTO agent_tasks (id, agent_id, check_id, payload_json, issued_at)
       VALUES (?, ?, ?, ?, ?)`,
      task.id,
      check.agent_id,
      check.id,
      JSON.stringify(task),
      issuedAt
    );
    await this.scheduleNext(check);
    return task;
  }

  private async scheduleNext(check: CheckRow): Promise<void> {
    const next = new Date(Date.now() + check.interval_seconds * 1000).toISOString();
    await this.database.run("UPDATE checks SET next_check_at = ? WHERE id = ?", next, check.id);
  }

  private supportsAssignedCheck(check: ScheduledCheckRow): boolean {
    if (check.agent_kind !== "desktop" || !check.agent_capabilities_json) return false;
    const capabilities = JSON.parse(check.agent_capabilities_json) as AgentCapability[];
    return capabilities.includes(check.type);
  }

  private async expireAgentTasks(): Promise<void> {
    const cutoff = new Date(Date.now() - 2 * 60 * 1000).toISOString();
    const expired = await this.database.all<{ id: string; check_id: string }>(
      `SELECT at.id, at.check_id FROM agent_tasks at
       JOIN checks c ON c.id = at.check_id
       WHERE at.status IN ('pending', 'claimed') AND at.issued_at < ? AND c.enabled = 1`,
      cutoff
    );
    const checkedAt = new Date().toISOString();
    for (const task of expired) {
      const update = await this.database.run(
        `UPDATE agent_tasks SET status = 'expired'
         WHERE id = ? AND status IN ('pending', 'claimed')`,
        task.id
      );
      if (update.changes === 0) continue;
      await this.results.record(task.check_id, {
        status: "down",
        latencyMs: null,
        statusCode: null,
        message: "Agent did not return a result",
        metrics: { agentTimeout: true },
        checkedAt,
      });
    }
    await this.database.run(
      `UPDATE agent_tasks SET status = 'expired'
       WHERE status IN ('pending', 'claimed') AND issued_at < ?`,
      cutoff
    );
  }
}
