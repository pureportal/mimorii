import { Injectable, NotFoundException } from "@nestjs/common";
import type { TechnologyObservation } from "@mimorii/contracts";
import { randomUUID } from "node:crypto";
import { DatabaseService } from "../database/database.service.js";
import { TeamAccessService } from "../teams/team-access.service.js";

interface TechnologyRow {
  id: string;
  resource_id: string;
  name: string;
  category: TechnologyObservation["category"];
  version: string | null;
  source: TechnologyObservation["source"];
  last_seen_at: string;
}

interface ResourceContext {
  team_id: string;
  resource_id: string;
}

@Injectable()
export class TechnologiesService {
  constructor(
    private readonly database: DatabaseService,
    private readonly access: TeamAccessService
  ) {}

  async list(userId: string, teamId: string, resourceId: string): Promise<TechnologyObservation[]> {
    await this.access.require(userId, teamId, "viewer");
    if (
      !(await this.database.get(
        "SELECT id FROM resources WHERE id = ? AND team_id = ?",
        resourceId,
        teamId
      ))
    ) {
      throw new NotFoundException("Resource not found");
    }
    const rows = await this.database.all<TechnologyRow>(
      `SELECT * FROM technology_observations WHERE resource_id = ?
       ORDER BY category, LOWER(name)`,
      resourceId
    );
    return rows.map((row) => this.map(row));
  }

  async observeHttp(
    checkId: string,
    metrics: Record<string, number | string | boolean | null>,
    observedAt: string
  ): Promise<void> {
    const context = await this.database.get<ResourceContext>(
      `SELECT c.team_id, c.resource_id FROM checks c WHERE c.id = ?`,
      checkId
    );
    if (!context) return;
    const values: Array<{
      value: unknown;
      category: TechnologyObservation["category"];
    }> = [
      { value: metrics.server, category: "runtime" },
      { value: metrics.poweredBy, category: "framework" },
      { value: metrics.tlsProtocol, category: "protocol" },
    ];
    for (const item of values) {
      if (typeof item.value !== "string" || !item.value.trim()) continue;
      const technology = this.parse(item.value, item.category);
      await this.upsert(context.team_id, context.resource_id, technology, "http", observedAt);
    }
  }

  async observeAgent(
    agentId: string,
    technologies: Array<{
      name: string;
      category: TechnologyObservation["category"];
      version: string | null;
    }>,
    observedAt: string
  ): Promise<void> {
    const resources = await this.database.all<ResourceContext>(
      "SELECT team_id, id AS resource_id FROM resources WHERE agent_id = ? AND kind = 'server'",
      agentId
    );
    for (const resource of resources) {
      for (const technology of technologies) {
        await this.upsert(resource.team_id, resource.resource_id, technology, "agent", observedAt);
      }
    }
  }

  private parse(value: string, category: TechnologyObservation["category"]) {
    const normalized = value.trim().slice(0, 160);
    const match = /^([^/\s]+)[/\s]v?([0-9][^\s]*)$/i.exec(normalized);
    const name = (match?.[1] ?? normalized).slice(0, 80);
    const proxyNames = new Set(["nginx", "apache", "httpd", "caddy", "envoy", "haproxy", "iis"]);
    return {
      name,
      category: proxyNames.has(name.toLowerCase()) ? ("proxy" as const) : category,
      version: match?.[2]?.slice(0, 80) ?? null,
    };
  }

  private async upsert(
    teamId: string,
    resourceId: string,
    technology: {
      name: string;
      category: TechnologyObservation["category"];
      version: string | null;
    },
    source: TechnologyObservation["source"],
    observedAt: string
  ): Promise<void> {
    const name = technology.name.trim().slice(0, 80);
    if (!name) return;
    const current = await this.database.get<{ id: string }>(
      `SELECT id FROM technology_observations WHERE resource_id = ? AND LOWER(name) = LOWER(?)
       AND category = ? AND COALESCE(version, '') = ? AND source = ?`,
      resourceId,
      name,
      technology.category,
      technology.version ?? "",
      source
    );
    if (current) {
      await this.database.run(
        "UPDATE technology_observations SET last_seen_at = ? WHERE id = ?",
        observedAt,
        current.id
      );
      return;
    }
    await this.database.run(
      `INSERT INTO technology_observations
       (id, team_id, resource_id, name, category, version, source, first_seen_at, last_seen_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      randomUUID(),
      teamId,
      resourceId,
      name,
      technology.category,
      technology.version?.slice(0, 80) ?? null,
      source,
      observedAt,
      observedAt
    );
  }

  private map(row: TechnologyRow): TechnologyObservation {
    return {
      id: row.id,
      resourceId: row.resource_id,
      name: row.name,
      category: row.category,
      version: row.version,
      source: row.source,
      lastSeenAt: row.last_seen_at,
    };
  }
}
