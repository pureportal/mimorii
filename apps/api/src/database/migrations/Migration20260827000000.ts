import { Migration } from "@mikro-orm/migrations";

export class Migration20260827000000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`
      DELETE FROM agent_tasks
      WHERE check_id IN (SELECT id FROM checks WHERE type = 'disk');

      UPDATE agents
      SET capabilities_json = (capabilities_json::jsonb - 'disk')::text
      WHERE capabilities_json::jsonb ? 'disk';

      UPDATE checks AS host
      SET config_json = (
        host.config_json::jsonb || jsonb_build_object(
          'storage', COALESCE(
            (
              SELECT jsonb_agg(
                jsonb_build_object(
                  'mount', disk.config_json::jsonb->>'mount',
                  'warningPercent', disk.config_json::jsonb->'warningPercent',
                  'criticalPercent', disk.config_json::jsonb->'criticalPercent'
                ) ORDER BY disk.created_at, disk.id
              )
              FROM checks AS disk
              WHERE disk.type = 'disk'
                AND disk.team_id = host.team_id
                AND disk.resource_id = host.resource_id
                AND disk.agent_id IS NOT DISTINCT FROM host.agent_id
            ),
            jsonb_build_array(jsonb_build_object(
              'mount', CASE
                WHEN EXISTS (
                  SELECT 1 FROM agents
                  WHERE agents.id = host.agent_id
                    AND LOWER(COALESCE(agents.platform, '')) LIKE '%windows%'
                ) THEN 'C:'
                ELSE '/'
              END,
              'warningPercent', 85,
              'criticalPercent', 95
            ))
          )
        )
      )::text
      WHERE host.type = 'host';

      WITH disk_rows AS (
        SELECT
          checks.*,
          ROW_NUMBER() OVER (
            PARTITION BY team_id, resource_id, agent_id
            ORDER BY created_at, id
          ) AS position,
          jsonb_agg(
            jsonb_build_object(
              'mount', config_json::jsonb->>'mount',
              'warningPercent', config_json::jsonb->'warningPercent',
              'criticalPercent', config_json::jsonb->'criticalPercent'
            )
          ) OVER (
            PARTITION BY team_id, resource_id, agent_id
            ORDER BY created_at, id
            ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING
          ) AS storage
        FROM checks
        WHERE type = 'disk'
      )
      UPDATE checks AS target
      SET
        name = 'Host health',
        type = 'host',
        config_json = (
          jsonb_build_object(
            'cpuWarningPercent', 90,
            'cpuCriticalPercent', 98,
            'memoryWarningPercent', 90,
            'memoryCriticalPercent', 98,
            'swapWarningPercent', 90,
            'swapCriticalPercent', 98,
            'storage', disk_rows.storage
          ) || CASE
            WHEN EXISTS (
              SELECT 1 FROM agents
              WHERE agents.id = target.agent_id
                AND LOWER(COALESCE(agents.platform, '')) LIKE '%windows%'
            ) THEN '{}'::jsonb
            ELSE jsonb_build_object('loadWarning', 4, 'loadCritical', 8)
          END
        )::text
      FROM disk_rows
      WHERE target.id = disk_rows.id
        AND disk_rows.position = 1
        AND NOT EXISTS (
          SELECT 1 FROM checks AS host
          WHERE host.type = 'host'
            AND host.team_id = disk_rows.team_id
            AND host.resource_id = disk_rows.resource_id
            AND host.agent_id IS NOT DISTINCT FROM disk_rows.agent_id
        );

      DELETE FROM checks WHERE type = 'disk';

      INSERT INTO checks
        (id, team_id, resource_id, name, type, config_json, agent_id, encrypted_secret,
         interval_seconds, timeout_ms, failure_threshold, recovery_threshold, enabled,
         current_status, next_check_at, created_at, updated_at)
      SELECT
        gen_random_uuid()::text,
        agents.team_id,
        agents.resource_id,
        'Host health',
        'host',
        (
          jsonb_build_object(
            'cpuWarningPercent', 90,
            'cpuCriticalPercent', 98,
            'memoryWarningPercent', 90,
            'memoryCriticalPercent', 98,
            'swapWarningPercent', 90,
            'swapCriticalPercent', 98,
            'storage', jsonb_build_array(jsonb_build_object(
              'mount', CASE
                WHEN LOWER(COALESCE(agents.platform, '')) LIKE '%windows%' THEN 'C:'
                ELSE '/'
              END,
              'warningPercent', 85,
              'criticalPercent', 95
            ))
          ) || CASE
            WHEN LOWER(COALESCE(agents.platform, '')) LIKE '%windows%' THEN '{}'::jsonb
            ELSE jsonb_build_object('loadWarning', 4, 'loadCritical', 8)
          END
        )::text,
        agents.id,
        NULL,
        60,
        5000,
        2,
        1,
        1,
        'pending',
        CURRENT_TIMESTAMP,
        CURRENT_TIMESTAMP,
        CURRENT_TIMESTAMP
      FROM agents
      WHERE agents.kind = 'desktop'
        AND agents.revoked_at IS NULL
        AND NOT EXISTS (
          SELECT 1 FROM checks
          WHERE checks.agent_id = agents.id AND checks.type = 'host'
        );

      ALTER TABLE checks
        DROP CONSTRAINT checks_type_check,
        ADD CONSTRAINT checks_type_check CHECK (
          type IN ('http', 'tcp', 'dns', 'icmp', 'wan', 'host', 'docker', 'database')
        );
    `);
  }

  override async down(): Promise<void> {
    throw new Error("Host Health storage monitoring cannot be downgraded");
  }
}
