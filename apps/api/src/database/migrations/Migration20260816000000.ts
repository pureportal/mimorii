import { Migration } from "@mikro-orm/migrations";

export class Migration20260816000000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`
      ALTER TABLE notification_channels
        DROP CONSTRAINT notification_channels_type_check;
      ALTER TABLE notification_channels
        ADD CONSTRAINT notification_channels_type_check
        CHECK (type IN ('email', 'webhook', 'push'));

      ALTER TABLE notification_policies
        ADD COLUMN condition_json TEXT NOT NULL
        DEFAULT '{"kind":"group","operator":"and","conditions":[]}';

      UPDATE notification_policies
      SET condition_json = jsonb_build_object(
        'kind', 'group',
        'operator', 'and',
        'conditions',
          CASE minimum_impact
            WHEN 'minor' THEN jsonb_build_array(
              jsonb_build_object(
                'kind', 'condition', 'field', 'impact', 'operator', 'in',
                'value', to_jsonb(ARRAY['minor', 'major', 'critical']::TEXT[])
              )
            )
            WHEN 'major' THEN jsonb_build_array(
              jsonb_build_object(
                'kind', 'condition', 'field', 'impact', 'operator', 'in',
                'value', to_jsonb(ARRAY['major', 'critical']::TEXT[])
              )
            )
            WHEN 'critical' THEN jsonb_build_array(
              jsonb_build_object(
                'kind', 'condition', 'field', 'impact', 'operator', 'equals',
                'value', 'critical'
              )
            )
            ELSE '[]'::JSONB
          END
          || COALESCE(
            (
              SELECT jsonb_agg(
                jsonb_build_object(
                  'kind', 'condition', 'field', 'resourceTags', 'operator', 'contains',
                  'value', tag.value
                )
              )
              FROM jsonb_array_elements_text(notification_policies.resource_tags_json::JSONB)
                AS tag(value)
            ),
            '[]'::JSONB
          )
      )::TEXT;

      ALTER TABLE notification_policies
        DROP COLUMN minimum_impact,
        DROP COLUMN resource_tags_json;

      ALTER TABLE notification_deliveries ADD COLUMN claimed_at TIMESTAMPTZ;

      CREATE TABLE notification_endpoints (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        platform TEXT NOT NULL CHECK (platform IN ('web', 'android')),
        device_key_hash TEXT NOT NULL,
        endpoint_hash TEXT NOT NULL,
        configuration_json TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'invalid')),
        last_seen_at TIMESTAMPTZ NOT NULL,
        invalidated_at TIMESTAMPTZ,
        last_error TEXT,
        created_at TIMESTAMPTZ NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL,
        UNIQUE (platform, device_key_hash)
      );

      CREATE TABLE notification_endpoint_deliveries (
        id TEXT PRIMARY KEY,
        delivery_id TEXT NOT NULL REFERENCES notification_deliveries(id) ON DELETE CASCADE,
        endpoint_id TEXT NOT NULL REFERENCES notification_endpoints(id) ON DELETE CASCADE,
        status TEXT NOT NULL DEFAULT 'pending'
          CHECK (status IN ('pending', 'delivered', 'failed')),
        attempts INTEGER NOT NULL DEFAULT 0,
        next_attempt_at TIMESTAMPTZ NOT NULL,
        error TEXT,
        delivered_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL,
        UNIQUE (delivery_id, endpoint_id)
      );

      CREATE INDEX idx_notification_endpoints_user
        ON notification_endpoints(user_id, status, platform);
      CREATE INDEX idx_notification_endpoints_retention
        ON notification_endpoints(last_seen_at);
      CREATE UNIQUE INDEX idx_notification_endpoint_hash
        ON notification_endpoints(platform, endpoint_hash);
      CREATE INDEX idx_notification_endpoint_delivery_queue
        ON notification_endpoint_deliveries(status, next_attempt_at);
    `);
  }

  override async down(): Promise<void> {
    this.addSql(`
      DROP INDEX idx_notification_endpoint_delivery_queue;
      DROP INDEX idx_notification_endpoint_hash;
      DROP INDEX idx_notification_endpoints_retention;
      DROP INDEX idx_notification_endpoints_user;
      DROP TABLE notification_endpoint_deliveries;
      DROP TABLE notification_endpoints;

      ALTER TABLE notification_deliveries DROP COLUMN claimed_at;

      ALTER TABLE notification_policies
        ADD COLUMN minimum_impact TEXT CHECK (minimum_impact IN ('minor', 'major', 'critical')),
        ADD COLUMN resource_tags_json TEXT NOT NULL DEFAULT '[]';
      ALTER TABLE notification_policies DROP COLUMN condition_json;

      DELETE FROM notification_channels WHERE type = 'push';
      ALTER TABLE notification_channels
        DROP CONSTRAINT notification_channels_type_check;
      ALTER TABLE notification_channels
        ADD CONSTRAINT notification_channels_type_check
        CHECK (type IN ('email', 'webhook'));
    `);
  }
}
