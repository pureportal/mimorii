import { Migration } from "@mikro-orm/migrations";

export class Migration20260821000000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`
      ALTER TABLE agents ADD COLUMN kind TEXT;
      UPDATE agents SET kind = 'desktop';
      ALTER TABLE agents
        ALTER COLUMN kind SET NOT NULL,
        ADD CONSTRAINT agents_kind_check CHECK (kind IN ('desktop', 'mobile'));

      CREATE TABLE mobile_device_statuses (
        id TEXT PRIMARY KEY,
        agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
        status_json JSONB NOT NULL,
        observed_at TIMESTAMPTZ NOT NULL,
        received_at TIMESTAMPTZ NOT NULL
      );

      CREATE INDEX idx_mobile_device_statuses_agent_time
        ON mobile_device_statuses(agent_id, observed_at DESC);
      CREATE INDEX idx_mobile_device_statuses_time
        ON mobile_device_statuses(observed_at);
    `);
  }

  override async down(): Promise<void> {
    this.addSql(`
      DROP TABLE mobile_device_statuses;
      ALTER TABLE agents
        DROP CONSTRAINT agents_kind_check,
        DROP COLUMN kind;
    `);
  }
}
