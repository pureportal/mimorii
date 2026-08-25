import { Migration } from "@mikro-orm/migrations";

export class Migration20260829000000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`
      ALTER TABLE checks
        DROP CONSTRAINT checks_type_check,
        ADD CONSTRAINT checks_type_check CHECK (
          type IN ('http', 'tcp', 'dns', 'icmp', 'wan', 'host', 'disk', 'docker', 'database')
        );
    `);

    this.addSql(`
      UPDATE agents
      SET capabilities_json = (capabilities_json::jsonb || jsonb_build_array('disk'))::text
      WHERE kind = 'desktop'
        AND NOT capabilities_json::jsonb ? 'disk';
    `);

    this.addSql(`
      INSERT INTO checks
        (id, team_id, resource_id, name, type, config_json, agent_id, encrypted_secret,
         interval_seconds, timeout_ms, failure_threshold, recovery_threshold, enabled,
         current_status, next_check_at, created_at, updated_at)
      SELECT
        gen_random_uuid()::text,
        host.team_id,
        host.resource_id,
        CASE
          WHEN jsonb_array_length(host.config_json::jsonb->'storage') = 1 THEN 'Disk usage'
          ELSE 'Disk usage - ' || (storage.config->>'mount')
        END,
        'disk',
        jsonb_build_object(
          'mount', storage.config->>'mount',
          'warningPercent', storage.config->'warningPercent',
          'criticalPercent', storage.config->'criticalPercent'
        )::text,
        host.agent_id,
        NULL,
        host.interval_seconds,
        host.timeout_ms,
        host.failure_threshold,
        host.recovery_threshold,
        host.enabled,
        CASE WHEN host.enabled = 1 THEN 'pending' ELSE 'paused' END,
        CURRENT_TIMESTAMP,
        CURRENT_TIMESTAMP,
        CURRENT_TIMESTAMP
      FROM checks AS host
      CROSS JOIN LATERAL jsonb_array_elements(host.config_json::jsonb->'storage') AS storage(config)
      WHERE host.type = 'host'
        AND jsonb_typeof(host.config_json::jsonb->'storage') = 'array';
    `);

    this.addSql(`
      DELETE FROM agent_tasks
      WHERE status IN ('pending', 'claimed')
        AND check_id IN (SELECT id FROM checks WHERE type = 'host');
    `);

    this.addSql(`
      UPDATE check_results AS result
      SET metrics_json = COALESCE(
        (
          SELECT jsonb_object_agg(metric.key, metric.value)
          FROM jsonb_each(result.metrics_json::jsonb) AS metric(key, value)
          WHERE metric.key NOT LIKE 'storage%'
            AND metric.key <> 'unavailableStorageCount'
        ),
        '{}'::jsonb
      )::text
      WHERE result.check_id IN (SELECT id FROM checks WHERE type = 'host')
        AND EXISTS (
          SELECT 1
          FROM jsonb_object_keys(result.metrics_json::jsonb) AS metric(key)
          WHERE metric.key LIKE 'storage%'
            OR metric.key = 'unavailableStorageCount'
        );
    `);

    this.addSql(`
      UPDATE checks
      SET
        config_json = (config_json::jsonb - 'storage')::text,
        current_status = CASE WHEN enabled = 1 THEN 'pending' ELSE 'paused' END,
        consecutive_failures = 0,
        consecutive_successes = 0,
        next_check_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
      WHERE type = 'host';
    `);
  }

  override async down(): Promise<void> {
    throw new Error("Separate disk monitoring cannot be downgraded");
  }
}
