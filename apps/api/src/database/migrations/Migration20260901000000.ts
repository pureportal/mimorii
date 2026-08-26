import { Migration } from "@mikro-orm/migrations";

export class Migration20260901000000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`
      ALTER TABLE agents DROP CONSTRAINT agents_resource_id_unique;
      CREATE UNIQUE INDEX agents_active_resource_unique
        ON agents(resource_id) WHERE revoked_at IS NULL;

      UPDATE checks check_to_suspend
      SET current_status = CASE WHEN check_to_suspend.enabled = 1 THEN 'pending' ELSE 'paused' END,
        consecutive_failures = 0,
        consecutive_successes = 0,
        next_check_at = NULL,
        updated_at = CURRENT_TIMESTAMP
      FROM agents agent
      WHERE check_to_suspend.agent_id = agent.id
        AND NOT (
          agent.revoked_at IS NULL
          AND agent.team_id = check_to_suspend.team_id
          AND agent.kind = 'desktop'
          AND agent.capabilities_json::jsonb @> jsonb_build_array(check_to_suspend.type)
          AND (
            check_to_suspend.type NOT IN ('host', 'disk', 'docker')
            OR agent.resource_id = check_to_suspend.resource_id
          )
        );

      UPDATE agent_tasks task
      SET status = 'expired'
      FROM checks check_for_task, agents agent
      WHERE task.check_id = check_for_task.id
        AND task.agent_id = agent.id
        AND task.status IN ('pending', 'claimed')
        AND (
          task.agent_id <> check_for_task.agent_id
          OR check_for_task.enabled <> 1
          OR NOT (
            agent.revoked_at IS NULL
            AND agent.team_id = check_for_task.team_id
            AND agent.kind = 'desktop'
            AND agent.capabilities_json::jsonb @> jsonb_build_array(check_for_task.type)
            AND (
              check_for_task.type NOT IN ('host', 'disk', 'docker')
              OR agent.resource_id = check_for_task.resource_id
            )
          )
        );
    `);
  }

  override async down(): Promise<void> {
    throw new Error("Agent resource replacement cannot be downgraded");
  }
}
