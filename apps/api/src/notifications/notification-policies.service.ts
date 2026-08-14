import { BadRequestException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import type {
  NotificationConditionGroup,
  NotificationEvent,
  NotificationPolicySummary,
} from "@mimorii/contracts";
import { randomUUID } from "node:crypto";
import { AuditService } from "../common/audit.service.js";
import { DatabaseService } from "../database/database.service.js";
import { TeamAccessService } from "../teams/team-access.service.js";
import {
  evaluateNotificationConditionGroup,
  validateNotificationConditionGroup,
} from "./notification-rules.js";
import type {
  CreateNotificationPolicyDto,
  UpdateNotificationPolicyDto,
} from "./notifications.dto.js";

interface PolicyRow {
  id: string;
  team_id: string;
  name: string;
  events_json: string;
  condition_json: string;
  enabled: number;
  created_at: string;
}

interface PolicyChannelRow {
  id: string;
  name: string;
}

@Injectable()
export class NotificationPoliciesService {
  private readonly logger = new Logger(NotificationPoliciesService.name);

  constructor(
    private readonly database: DatabaseService,
    private readonly access: TeamAccessService,
    private readonly audit: AuditService
  ) {}

  async list(userId: string, teamId: string): Promise<NotificationPolicySummary[]> {
    await this.access.require(userId, teamId, "admin");
    const rows = await this.rows(teamId);
    return Promise.all(rows.map((row) => this.map(row)));
  }

  async create(
    userId: string,
    teamId: string,
    input: CreateNotificationPolicyDto
  ): Promise<NotificationPolicySummary> {
    await this.access.require(userId, teamId, "admin");
    const name = input.name.trim();
    if (!name) throw new BadRequestException("Notification rule name is required");
    const count = (await this.database.get<{ count: number }>(
      "SELECT COUNT(*) AS count FROM notification_policies WHERE team_id = ?",
      teamId
    ))!.count;
    if (count >= 500) throw new BadRequestException("Notification policy limit reached");
    const condition = this.validCondition(input.condition);
    const channelIds = await this.validateChannels(teamId, input.channelIds);
    const id = randomUUID();
    const now = new Date().toISOString();
    await this.database.transaction(async () => {
      await this.database.run(
        `INSERT INTO notification_policies
         (id, team_id, name, events_json, condition_json, enabled, created_by, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        id,
        teamId,
        name,
        JSON.stringify([...new Set(input.events)]),
        JSON.stringify(condition),
        input.enabled === false ? 0 : 1,
        userId,
        now,
        now
      );
      await this.replaceChannels(id, channelIds);
    });
    await this.audit.record({
      teamId,
      userId,
      action: "notification_policy.created",
      subjectType: "notification_policy",
      subjectId: id,
    });
    return this.map(await this.require(teamId, id));
  }

  async update(
    userId: string,
    teamId: string,
    id: string,
    input: UpdateNotificationPolicyDto
  ): Promise<NotificationPolicySummary> {
    await this.access.require(userId, teamId, "admin");
    const current = await this.require(teamId, id);
    const name = (input.name ?? current.name).trim();
    if (!name) throw new BadRequestException("Notification rule name is required");
    const condition = input.condition
      ? this.validCondition(input.condition)
      : this.parseCondition(current);
    const channelIds = input.channelIds
      ? await this.validateChannels(teamId, input.channelIds)
      : (await this.channels(id)).map((channel) => channel.id);
    await this.database.transaction(async () => {
      await this.database.run(
        `UPDATE notification_policies SET name = ?, events_json = ?, condition_json = ?,
         enabled = ?, updated_at = ? WHERE id = ? AND team_id = ?`,
        name,
        JSON.stringify(input.events ?? (JSON.parse(current.events_json) as NotificationEvent[])),
        JSON.stringify(condition),
        (input.enabled ?? Boolean(current.enabled)) ? 1 : 0,
        new Date().toISOString(),
        id,
        teamId
      );
      await this.replaceChannels(id, channelIds);
    });
    await this.audit.record({
      teamId,
      userId,
      action: "notification_policy.updated",
      subjectType: "notification_policy",
      subjectId: id,
    });
    return this.map(await this.require(teamId, id));
  }

  async remove(userId: string, teamId: string, id: string): Promise<void> {
    await this.access.require(userId, teamId, "admin");
    const result = await this.database.run(
      "DELETE FROM notification_policies WHERE id = ? AND team_id = ?",
      id,
      teamId
    );
    if (result.changes === 0) throw new NotFoundException("Notification policy not found");
    await this.audit.record({
      teamId,
      userId,
      action: "notification_policy.deleted",
      subjectType: "notification_policy",
      subjectId: id,
    });
  }

  async routedChannelIds(
    teamId: string,
    event: NotificationEvent,
    payload: Record<string, unknown>
  ): Promise<Set<string>> {
    const context = await this.context(teamId, event, payload);
    const matches: PolicyRow[] = [];
    for (const policy of (await this.rows(teamId)).filter((row) => Boolean(row.enabled))) {
      if (!(JSON.parse(policy.events_json) as NotificationEvent[]).includes(event)) continue;
      try {
        if (evaluateNotificationConditionGroup(this.parseCondition(policy), context)) {
          matches.push(policy);
        }
      } catch (error) {
        this.logger.error(
          `Notification policy ${policy.id} could not be evaluated: ${error instanceof Error ? error.message : "invalid condition"}`
        );
      }
    }
    const channels = await Promise.all(matches.map((policy) => this.channels(policy.id)));
    return new Set(channels.flat().map((channel) => channel.id));
  }

  private rows(teamId: string): Promise<PolicyRow[]> {
    return this.database.all<PolicyRow>(
      "SELECT * FROM notification_policies WHERE team_id = ? ORDER BY LOWER(name)",
      teamId
    );
  }

  private async require(teamId: string, id: string): Promise<PolicyRow> {
    const row = await this.database.get<PolicyRow>(
      "SELECT * FROM notification_policies WHERE id = ? AND team_id = ?",
      id,
      teamId
    );
    if (!row) throw new NotFoundException("Notification policy not found");
    return row;
  }

  private channels(policyId: string): Promise<PolicyChannelRow[]> {
    return this.database.all<PolicyChannelRow>(
      `SELECT nc.id, nc.name FROM notification_channels nc
       JOIN notification_policy_channels npc ON npc.channel_id = nc.id
       WHERE npc.policy_id = ? ORDER BY LOWER(nc.name)`,
      policyId
    );
  }

  private async validateChannels(teamId: string, channelIds: string[]): Promise<string[]> {
    const ids = [...new Set(channelIds)];
    if (ids.length === 0) throw new BadRequestException("Add at least one notification channel");
    const placeholders = ids.map(() => "?").join(",");
    const count = (await this.database.get<{ count: number }>(
      `SELECT COUNT(*) AS count FROM notification_channels
       WHERE team_id = ? AND id IN (${placeholders})`,
      teamId,
      ...ids
    ))!.count;
    if (count !== ids.length) {
      throw new BadRequestException("A notification channel is unavailable");
    }
    return ids;
  }

  private async replaceChannels(policyId: string, channelIds: string[]): Promise<void> {
    await this.database.run(
      "DELETE FROM notification_policy_channels WHERE policy_id = ?",
      policyId
    );
    await Promise.all(
      channelIds.map((channelId) =>
        this.database.run(
          "INSERT INTO notification_policy_channels (policy_id, channel_id) VALUES (?, ?)",
          policyId,
          channelId
        )
      )
    );
  }

  private validCondition(value: unknown): NotificationConditionGroup {
    try {
      validateNotificationConditionGroup(value);
      return value;
    } catch (error) {
      throw new BadRequestException(
        error instanceof Error ? error.message : "Notification condition is invalid"
      );
    }
  }

  private parseCondition(row: PolicyRow): NotificationConditionGroup {
    const condition = JSON.parse(row.condition_json) as unknown;
    validateNotificationConditionGroup(condition);
    return condition;
  }

  private async context(
    teamId: string,
    event: NotificationEvent,
    payload: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    const resourceIds = Array.isArray(payload.resourceIds)
      ? payload.resourceIds.filter((value): value is string => typeof value === "string")
      : [];
    const resourceTags = new Set<string>();
    if (resourceIds.length > 0) {
      const placeholders = resourceIds.map(() => "?").join(",");
      const rows = await this.database.all<{ tags_json: string }>(
        `SELECT tags_json FROM resources WHERE team_id = ? AND id IN (${placeholders})`,
        teamId,
        ...resourceIds
      );
      for (const row of rows) {
        for (const tag of JSON.parse(row.tags_json) as string[]) {
          resourceTags.add(tag.toLowerCase());
        }
      }
    }
    return { ...payload, event, resourceTags: [...resourceTags] };
  }

  private async map(row: PolicyRow): Promise<NotificationPolicySummary> {
    const channels = await this.channels(row.id);
    return {
      id: row.id,
      teamId: row.team_id,
      name: row.name,
      events: JSON.parse(row.events_json) as NotificationEvent[],
      condition: this.parseCondition(row),
      channelIds: channels.map((channel) => channel.id),
      channelNames: channels.map((channel) => channel.name),
      enabled: Boolean(row.enabled),
      createdAt: row.created_at,
    };
  }
}
