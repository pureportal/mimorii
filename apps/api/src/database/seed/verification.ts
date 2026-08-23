import type { DatabaseService } from "../database.service.js";

export interface DevelopmentSeedSummary {
  owns_team: boolean;
  configured_agent: boolean;
  resources: number;
  checks: number;
  direct_checks: number;
  agent_checks: number;
  mapped_direct_checks: number;
  port_checks: number;
  check_types: number;
  check_results: number;
  agents: number;
  heartbeats: number;
  status_pages: number;
}

export async function verifyDevelopmentSeed(
  database: DatabaseService,
  input: { userId: string; teamId: string; agentId: string }
): Promise<DevelopmentSeedSummary> {
  const summary = await database.get<DevelopmentSeedSummary>(
    `SELECT
       EXISTS(
         SELECT 1 FROM team_members WHERE user_id = ? AND team_id = ? AND role = 'owner'
       ) AS owns_team,
       EXISTS(
         SELECT 1 FROM agents WHERE id = ? AND team_id = ? AND revoked_at IS NULL
       ) AS configured_agent,
       (SELECT COUNT(*)::int FROM resources WHERE team_id = ?) AS resources,
       (SELECT COUNT(*)::int FROM checks WHERE team_id = ?) AS checks,
       (SELECT COUNT(*)::int FROM checks c
        WHERE c.team_id = ? AND c.agent_id IS NULL) AS direct_checks,
       (SELECT COUNT(*)::int FROM checks c
        WHERE c.team_id = ? AND c.agent_id IS NOT NULL) AS agent_checks,
       (SELECT COUNT(*)::int FROM checks c
        WHERE c.team_id = ? AND c.agent_id IS NULL
          AND jsonb_exists(c.config_json::jsonb, 'jsonAssertions'))
        AS mapped_direct_checks,
       (SELECT COUNT(*)::int FROM checks WHERE team_id = ? AND type = 'tcp') AS port_checks,
       (SELECT COUNT(DISTINCT type)::int FROM checks WHERE team_id = ?) AS check_types,
       (SELECT COUNT(*)::int FROM check_results cr JOIN checks c ON c.id = cr.check_id
        WHERE c.team_id = ?) AS check_results,
       (SELECT COUNT(*)::int FROM agents WHERE team_id = ?) AS agents,
       (SELECT COUNT(*)::int FROM heartbeat_monitors WHERE team_id = ?) AS heartbeats,
       (SELECT COUNT(*)::int FROM status_pages WHERE team_id = ?) AS status_pages`,
    input.userId,
    input.teamId,
    input.agentId,
    input.teamId,
    input.teamId,
    input.teamId,
    input.teamId,
    input.teamId,
    input.teamId,
    input.teamId,
    input.teamId,
    input.teamId,
    input.teamId,
    input.teamId,
    input.teamId
  );
  if (!summary) throw new Error("Seed verification did not return a result");
  const complete =
    summary.owns_team &&
    summary.configured_agent &&
    summary.resources >= 12 &&
    summary.checks >= 39 &&
    summary.direct_checks >= 8 &&
    summary.agent_checks >= 20 &&
    summary.mapped_direct_checks >= 2 &&
    summary.port_checks >= 8 &&
    summary.check_types === 9 &&
    summary.check_results >= 250 &&
    summary.agents >= 5 &&
    summary.heartbeats >= 5 &&
    summary.status_pages >= 2;
  if (!complete) {
    throw new Error(`Development seed is incomplete: ${JSON.stringify(summary)}`);
  }
  return summary;
}
