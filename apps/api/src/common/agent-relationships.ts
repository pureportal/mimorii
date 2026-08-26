import type { DatabaseService } from "../database/database.service.js";

export interface AgentRelationshipReconciliation {
  reassignedChecks: number;
  correctedResourceChecks: number;
  suspendedChecks: number;
  resumedChecks: number;
  expiredTasks: number;
}

const resourceBoundCheckTypes = "('host', 'disk', 'docker')";

export async function reconcileAgentRelationships(
  database: DatabaseService,
  resourceId?: string
): Promise<AgentRelationshipReconciliation> {
  const retiredScope = resourceId ? "AND retired.resource_id = ?" : "";
  const ownerScope = resourceId ? "AND owner.resource_id = ?" : "";
  const assignedScope = resourceId ? "AND (a.resource_id = ? OR c.resource_id = ?)" : "";
  const assignedParameters = resourceId ? [resourceId, resourceId] : [];
  const now = new Date().toISOString();

  return database.transaction(async () => {
    const reassigned = await database.run(
      `WITH replacements AS (
         SELECT retired.id AS retired_id, active.id AS active_id
         FROM agents retired
         JOIN agents active ON active.resource_id = retired.resource_id
           AND active.revoked_at IS NULL
         WHERE retired.revoked_at IS NOT NULL ${retiredScope}
       )
       UPDATE checks c
       SET agent_id = replacements.active_id,
         current_status = CASE WHEN c.enabled = 1 THEN 'pending' ELSE 'paused' END,
         consecutive_failures = 0,
         consecutive_successes = 0,
         next_check_at = CASE WHEN c.enabled = 1 THEN ?::timestamptz ELSE NULL END,
         updated_at = ?
       FROM replacements
       WHERE c.agent_id = replacements.retired_id`,
      ...(resourceId ? [resourceId] : []),
      now,
      now
    );
    const corrected = await database.run(
      `UPDATE checks c
       SET agent_id = owner.id,
         current_status = CASE WHEN c.enabled = 1 THEN 'pending' ELSE 'paused' END,
         consecutive_failures = 0,
         consecutive_successes = 0,
         next_check_at = CASE WHEN c.enabled = 1 THEN ?::timestamptz ELSE NULL END,
         updated_at = ?
       FROM agents assigned, agents owner
       WHERE c.agent_id = assigned.id
         AND c.type IN ${resourceBoundCheckTypes}
         AND owner.resource_id = c.resource_id
         AND owner.team_id = c.team_id
         AND owner.kind = 'desktop'
         AND owner.revoked_at IS NULL
         AND owner.capabilities_json::jsonb @> jsonb_build_array(c.type)
         AND assigned.id <> owner.id
         ${ownerScope}`,
      now,
      now,
      ...(resourceId ? [resourceId] : [])
    );
    const suspended = await database.run(
      `UPDATE checks c
       SET current_status = CASE WHEN c.enabled = 1 THEN 'pending' ELSE 'paused' END,
         consecutive_failures = 0,
         consecutive_successes = 0,
         next_check_at = NULL,
         updated_at = ?
       FROM agents a
       WHERE c.agent_id = a.id
         AND NOT (
           a.revoked_at IS NULL
           AND a.team_id = c.team_id
           AND a.kind = 'desktop'
           AND a.capabilities_json::jsonb @> jsonb_build_array(c.type)
           AND (c.type NOT IN ${resourceBoundCheckTypes} OR a.resource_id = c.resource_id)
         )
         AND (
           c.next_check_at IS NOT NULL
           OR c.current_status <> CASE WHEN c.enabled = 1 THEN 'pending' ELSE 'paused' END
           OR c.consecutive_failures <> 0
           OR c.consecutive_successes <> 0
         )
         ${assignedScope}`,
      now,
      ...assignedParameters
    );
    const resumed = await database.run(
      `UPDATE checks c
       SET current_status = 'pending', next_check_at = ?, updated_at = ?
       FROM agents a
       WHERE c.agent_id = a.id
         AND c.enabled = 1
         AND c.next_check_at IS NULL
         AND a.revoked_at IS NULL
         AND a.team_id = c.team_id
         AND a.kind = 'desktop'
         AND a.capabilities_json::jsonb @> jsonb_build_array(c.type)
         AND (c.type NOT IN ${resourceBoundCheckTypes} OR a.resource_id = c.resource_id)
         ${assignedScope}`,
      now,
      now,
      ...assignedParameters
    );
    const expired = await database.run(
      `UPDATE agent_tasks task
       SET status = 'expired'
       FROM checks c, agents a
       WHERE task.check_id = c.id
         AND task.agent_id = a.id
         AND task.status IN ('pending', 'claimed')
         AND (
           task.agent_id <> c.agent_id
           OR c.enabled <> 1
           OR NOT (
             a.revoked_at IS NULL
             AND a.team_id = c.team_id
             AND a.kind = 'desktop'
             AND a.capabilities_json::jsonb @> jsonb_build_array(c.type)
             AND (c.type NOT IN ${resourceBoundCheckTypes} OR a.resource_id = c.resource_id)
           )
         )
         ${resourceId ? "AND (a.resource_id = ? OR c.resource_id = ?)" : ""}`,
      ...assignedParameters
    );

    return {
      reassignedChecks: reassigned.changes,
      correctedResourceChecks: corrected.changes,
      suspendedChecks: suspended.changes,
      resumedChecks: resumed.changes,
      expiredTasks: expired.changes,
    };
  });
}
