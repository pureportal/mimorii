import { Migration } from "@mikro-orm/migrations";

export class Migration20260826000000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`
      ALTER TABLE agents ADD COLUMN resource_id TEXT;

      ALTER TABLE resources DROP CONSTRAINT resources_kind_check;
      UPDATE resources SET kind = CASE WHEN kind = 'server' THEN 'host' ELSE 'service' END;
      ALTER TABLE resources
        ADD CONSTRAINT resources_kind_check CHECK (kind IN ('host', 'device', 'service'));

      INSERT INTO resources
        (id, team_id, name, kind, target, description, tags_json, created_at, updated_at)
      SELECT
        agents.id,
        agents.team_id,
        agents.name,
        CASE WHEN agents.kind = 'mobile' THEN 'device' ELSE 'host' END,
        agents.name,
        NULL,
        '[]',
        agents.created_at,
        agents.updated_at
      FROM agents;

      UPDATE agents SET resource_id = id;
      ALTER TABLE agents
        ALTER COLUMN resource_id SET NOT NULL,
        ADD CONSTRAINT agents_resource_id_foreign
          FOREIGN KEY (resource_id) REFERENCES resources(id) ON DELETE CASCADE,
        ADD CONSTRAINT agents_resource_id_unique UNIQUE (resource_id);

      ALTER TABLE checks ADD COLUMN agent_id TEXT REFERENCES agents(id) ON DELETE RESTRICT;
      UPDATE checks
      SET agent_id = resources.agent_id
      FROM resources
      WHERE resources.id = checks.resource_id;

      ALTER TABLE resources
        DROP COLUMN agent_id,
        DROP COLUMN target;
      ALTER TABLE agents DROP COLUMN name;

      UPDATE checks
      SET config_json = (
        (config_json::jsonb - 'url' - 'method' - 'jsonPointer' - 'expectedJsonValue')
        || jsonb_build_object(
          'target', jsonb_build_object(
            'url', config_json::jsonb->'url',
            'method', COALESCE(config_json::jsonb->'method', '"GET"'::jsonb)
          )
        )
        || CASE
          WHEN config_json::jsonb ? 'jsonPointer' THEN jsonb_build_object(
            'jsonAssertions', jsonb_build_object(
              'kind', 'group',
              'operator', 'and',
              'conditions', jsonb_build_array(
                jsonb_strip_nulls(jsonb_build_object(
                  'kind', 'assertion',
                  'name', 'JSON assertion',
                  'pointer', config_json::jsonb->'jsonPointer',
                  'operator', CASE
                    WHEN config_json::jsonb ? 'expectedJsonValue' THEN 'equals'
                    ELSE 'exists'
                  END,
                  'expectedValue', config_json::jsonb->'expectedJsonValue'
                ))
              )
            )
          )
          ELSE '{}'::jsonb
        END
      )::text
      WHERE type = 'http';

      UPDATE checks
      SET config_json = (
        (config_json::jsonb - 'host' - 'port')
        || jsonb_build_object(
          'target', jsonb_build_object(
            'host', config_json::jsonb->'host',
            'port', config_json::jsonb->'port'
          )
        )
      )::text
      WHERE type = 'tcp';

      UPDATE checks
      SET config_json = (
        (config_json::jsonb - 'hostname')
        || jsonb_build_object(
          'target', jsonb_build_object('hostname', config_json::jsonb->'hostname')
        )
      )::text
      WHERE type = 'dns';

      ALTER TABLE checks
        DROP CONSTRAINT checks_type_check,
        ADD CONSTRAINT checks_type_check CHECK (
          type IN ('http', 'tcp', 'dns', 'icmp', 'wan', 'host', 'disk', 'docker', 'database')
        ),
        ADD COLUMN encrypted_secret TEXT;

      CREATE TABLE resource_alert_rules (
        id TEXT PRIMARY KEY,
        team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
        resource_id TEXT NOT NULL REFERENCES resources(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        metric TEXT NOT NULL CHECK (metric IN (
          'cpuPercent', 'memoryPercent', 'storagePercent', 'loadAverage', 'batteryPercent',
          'batteryTemperatureCelsius', 'containerCount', 'unhealthyContainerCount',
          'internetAvailable', 'lowMemory', 'backgroundRestricted'
        )),
        operator TEXT NOT NULL CHECK (operator IN (
          'greaterThan', 'greaterThanOrEqual', 'lessThan', 'lessThanOrEqual', 'equals'
        )),
        threshold_json JSONB NOT NULL,
        recovery_threshold_json JSONB,
        required_samples INTEGER NOT NULL CHECK (required_samples BETWEEN 1 AND 10),
        enabled BOOLEAN NOT NULL DEFAULT TRUE,
        active BOOLEAN NOT NULL DEFAULT FALSE,
        consecutive_matches INTEGER NOT NULL DEFAULT 0,
        consecutive_recoveries INTEGER NOT NULL DEFAULT 0,
        last_evaluated_at TIMESTAMPTZ,
        triggered_at TIMESTAMPTZ,
        created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL
      );

      CREATE INDEX idx_checks_agent_due ON checks(agent_id, enabled, next_check_at);
      CREATE INDEX idx_resource_alert_rules_resource
        ON resource_alert_rules(resource_id, enabled);
    `);
  }

  override async down(): Promise<void> {
    throw new Error("The canonical monitoring model migration cannot be downgraded");
  }
}
