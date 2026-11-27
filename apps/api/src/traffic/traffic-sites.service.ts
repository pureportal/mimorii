import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { TeamRole, TrafficSiteSummary } from "@mimorii/contracts";
import { randomBytes, randomUUID } from "node:crypto";
import { AuditService } from "../common/audit.service.js";
import { DatabaseService } from "../database/database.service.js";
import { TeamAccessService } from "../teams/team-access.service.js";
import { normalizeDomain } from "./traffic-request.js";

export interface TrafficSiteRow {
  id: string;
  team_id: string;
  resource_id: string;
  resource_name: string;
  public_key: string;
  domains: string[];
  heatmaps_enabled: boolean;
  last_event_at: string | null;
  visitors_today: number;
  live_visitors: number;
  created_at: string;
}

const siteSelect = `
  SELECT ts.id, ts.team_id, ts.resource_id, r.name AS resource_name, ts.public_key, ts.domains,
    ts.heatmaps_enabled, ts.last_event_at, ts.created_at,
    (SELECT COUNT(DISTINCT e.visitor_hash)::int FROM traffic_events e
     WHERE e.site_id = ts.id AND e.kind = 'pageview' AND e.occurred_at >= date_trunc('day', now())) AS visitors_today,
    (SELECT COUNT(DISTINCT e.visitor_hash)::int FROM traffic_events e
     WHERE e.site_id = ts.id AND e.occurred_at >= now() - interval '5 minutes') AS live_visitors
  FROM traffic_sites ts JOIN resources r ON r.id = ts.resource_id`;

@Injectable()
export class TrafficSitesService {
  constructor(
    private readonly database: DatabaseService,
    private readonly access: TeamAccessService,
    private readonly audit: AuditService
  ) {}

  async list(userId: string, teamId: string): Promise<TrafficSiteSummary[]> {
    await this.access.require(userId, teamId, "viewer");
    const rows = await this.database.all<TrafficSiteRow>(
      `${siteSelect} WHERE ts.team_id = ? ORDER BY LOWER(r.name)`,
      teamId
    );
    return rows.map(mapSite);
  }

  async get(userId: string, teamId: string, id: string): Promise<TrafficSiteSummary> {
    return mapSite(await this.require(userId, teamId, id, "viewer"));
  }

  async require(
    userId: string,
    teamId: string,
    id: string,
    role: TeamRole
  ): Promise<TrafficSiteRow> {
    await this.access.require(userId, teamId, role);
    const row = await this.database.get<TrafficSiteRow>(
      `${siteSelect} WHERE ts.team_id = ? AND ts.id = ?`,
      teamId,
      id
    );
    if (!row) throw new NotFoundException("Website not found");
    return row;
  }

  async create(
    userId: string,
    teamId: string,
    input: { resourceId: string; domains?: string[] }
  ): Promise<TrafficSiteSummary> {
    await this.access.require(userId, teamId, "admin");
    const resource = await this.database.get<{ id: string; urls: string[] | null }>(
      `SELECT r.id, ARRAY(
         SELECT c.config_json::jsonb #>> '{target,url}' FROM checks c
         WHERE c.resource_id = r.id AND c.type = 'http') AS urls
       FROM resources r WHERE r.team_id = ? AND r.id = ?`,
      teamId,
      input.resourceId
    );
    if (!resource) throw new NotFoundException("Resource not found");
    const existing = await this.database.get<{ id: string }>(
      "SELECT id FROM traffic_sites WHERE resource_id = ?",
      resource.id
    );
    if (existing) throw new ConflictException("Traffic is already tracked for this resource");
    const domains = this.domains(input.domains ?? resource.urls ?? []);
    const id = randomUUID();
    const now = new Date().toISOString();
    await this.database.run(
      `INSERT INTO traffic_sites
       (id, team_id, resource_id, public_key, domains, created_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ARRAY(SELECT jsonb_array_elements_text(?::jsonb)), ?, ?, ?)`,
      id,
      teamId,
      resource.id,
      `mim_site_${randomBytes(12).toString("base64url")}`,
      JSON.stringify(domains),
      userId,
      now,
      now
    );
    await this.audit.record({
      teamId,
      userId,
      action: "traffic_site.created",
      subjectType: "traffic_site",
      subjectId: id,
      metadata: { resourceId: resource.id },
    });
    return this.get(userId, teamId, id);
  }

  async update(
    userId: string,
    teamId: string,
    id: string,
    input: { domains?: string[]; heatmapsEnabled?: boolean }
  ): Promise<TrafficSiteSummary> {
    const current = await this.require(userId, teamId, id, "admin");
    await this.database.run(
      `UPDATE traffic_sites SET domains = ARRAY(SELECT jsonb_array_elements_text(?::jsonb)), heatmaps_enabled = ?, updated_at = ?
       WHERE id = ? AND team_id = ?`,
      JSON.stringify(input.domains ? this.domains(input.domains) : current.domains),
      input.heatmapsEnabled ?? current.heatmaps_enabled,
      new Date().toISOString(),
      id,
      teamId
    );
    if (input.heatmapsEnabled === false) {
      await this.database.run("DELETE FROM traffic_clicks WHERE site_id = ?", id);
    }
    await this.audit.record({
      teamId,
      userId,
      action: "traffic_site.updated",
      subjectType: "traffic_site",
      subjectId: id,
    });
    return this.get(userId, teamId, id);
  }

  async remove(userId: string, teamId: string, id: string): Promise<void> {
    await this.require(userId, teamId, id, "admin");
    await this.database.run("DELETE FROM traffic_sites WHERE id = ? AND team_id = ?", id, teamId);
    await this.audit.record({
      teamId,
      userId,
      action: "traffic_site.deleted",
      subjectType: "traffic_site",
      subjectId: id,
    });
  }

  private domains(values: readonly string[]): string[] {
    const domains = [...new Set(values.flatMap((value) => normalizeDomain(value) ?? []))];
    if (!domains.length) throw new BadRequestException("Enter the website domain");
    if (domains.length > 20) throw new BadRequestException("Enter up to 20 domains");
    return domains;
  }
}

function mapSite(row: TrafficSiteRow): TrafficSiteSummary {
  return {
    id: row.id,
    resourceId: row.resource_id,
    resourceName: row.resource_name,
    publicKey: row.public_key,
    domains: row.domains,
    heatmapsEnabled: row.heatmaps_enabled,
    lastEventAt: row.last_event_at ? new Date(row.last_event_at).toISOString() : null,
    visitorsToday: row.visitors_today,
    liveVisitors: row.live_visitors,
    createdAt: new Date(row.created_at).toISOString(),
  };
}
