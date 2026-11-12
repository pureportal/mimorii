import type { IncidentLogs, IncidentLogStream, LogPattern } from "@mimorii/contracts";
import { Injectable, NotFoundException } from "@nestjs/common";
import { DatabaseService } from "../database/database.service.js";
import { LogInsightsService } from "./log-insights.service.js";
import { LogsAccessService } from "./logs-access.service.js";
import { LogsQueryService } from "./logs-query.service.js";

interface IncidentWindowRow {
  started_at: string;
  resolved_at: string | null;
}

interface StreamSourceRow {
  label: string;
  query: string;
}

const leadMilliseconds = 15 * 60_000;
const trailMilliseconds = 15 * 60_000;
const maximumWindowMilliseconds = 7 * 86_400_000;
const maximumStreams = 4;
const patternLimit = 5;

@Injectable()
export class IncidentLogsService {
  constructor(
    private readonly database: DatabaseService,
    private readonly access: LogsAccessService,
    private readonly logs: LogsQueryService,
    private readonly insights: LogInsightsService
  ) {}

  async forIncident(
    userId: string,
    teamId: string,
    incidentId: string,
    signal?: AbortSignal
  ): Promise<IncidentLogs> {
    await this.access.require(userId, teamId, "viewer");
    const incident = await this.database.get<
      IncidentWindowRow & { log_alert_rule_id: string | null }
    >(
      "SELECT started_at, resolved_at, log_alert_rule_id FROM incidents WHERE id = ? AND team_id = ?",
      incidentId,
      teamId
    );
    if (!incident) throw new NotFoundException("Incident not found");
    const window = incidentLogWindow(incident, Date.now());
    const sources = await this.database.all<StreamSourceRow>(
      `SELECT label, query FROM (
         SELECT lar.name AS label, lar.query, 0 AS position
         FROM log_alert_rules lar WHERE lar.id = ? AND lar.team_id = ?
         UNION ALL
         SELECT r.name AS label, r.log_query AS query, 1 AS position
         FROM incident_resources ir JOIN resources r ON r.id = ir.resource_id
         WHERE ir.incident_id = ? AND r.team_id = ? AND r.log_query IS NOT NULL
       ) sources ORDER BY position, LOWER(label)`,
      incident.log_alert_rule_id,
      teamId,
      incidentId,
      teamId
    );
    const unlinkedResources = await this.database.all<{ id: string; name: string }>(
      `SELECT r.id, r.name FROM incident_resources ir JOIN resources r ON r.id = ir.resource_id
       WHERE ir.incident_id = ? AND r.team_id = ? AND r.log_query IS NULL
       ORDER BY LOWER(r.name), r.id`,
      incidentId,
      teamId
    );
    const unique = sources
      .filter(
        (source, index) => sources.findIndex((other) => other.query === source.query) === index
      )
      .slice(0, maximumStreams);
    const range = { from: window.from.toISOString(), to: window.to.toISOString() };
    const streams = await Promise.all(
      unique.map(async (source): Promise<IncidentLogStream> => {
        const [volume, patterns] = await Promise.all([
          this.logs.volume(userId, teamId, { query: source.query, ...range }, signal),
          this.insights.patterns(
            userId,
            teamId,
            { query: source.query, ...range, limit: 50 },
            signal
          ),
        ]);
        return {
          label: source.label,
          query: source.query,
          volume,
          patterns: prioritizedPatterns(patterns.patterns),
        };
      })
    );
    return { ...range, streams, unlinkedResources };
  }
}

export function incidentLogWindow(
  incident: IncidentWindowRow,
  now: number
): { from: Date; to: Date } {
  const started = new Date(incident.started_at).getTime();
  const ended = incident.resolved_at ? new Date(incident.resolved_at).getTime() : now;
  const to = Math.min(now, ended + trailMilliseconds);
  const from = Math.max(started - leadMilliseconds, to - maximumWindowMilliseconds);
  return { from: new Date(Math.min(from, to - 60_000)), to: new Date(to) };
}

export function prioritizedPatterns(patterns: LogPattern[]): LogPattern[] {
  const severe = (pattern: LogPattern) => (pattern.levels.fatal ?? 0) + (pattern.levels.error ?? 0);
  return patterns
    .toSorted(
      (left, right) =>
        severe(right) - severe(left) ||
        (right.levels.warn ?? 0) - (left.levels.warn ?? 0) ||
        right.count - left.count
    )
    .slice(0, patternLimit);
}
