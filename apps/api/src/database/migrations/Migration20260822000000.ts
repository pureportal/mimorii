import { Migration } from "@mikro-orm/migrations";

export class Migration20260822000000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`
      DROP INDEX idx_mobile_device_statuses_agent_time;
      DROP INDEX idx_mobile_device_statuses_time;
      CREATE INDEX idx_mobile_device_statuses_agent_time
        ON mobile_device_statuses(agent_id, received_at DESC);
      CREATE INDEX idx_mobile_device_statuses_time
        ON mobile_device_statuses(received_at);
    `);
  }

  override async down(): Promise<void> {
    this.addSql(`
      DROP INDEX idx_mobile_device_statuses_agent_time;
      DROP INDEX idx_mobile_device_statuses_time;
      CREATE INDEX idx_mobile_device_statuses_agent_time
        ON mobile_device_statuses(agent_id, observed_at DESC);
      CREATE INDEX idx_mobile_device_statuses_time
        ON mobile_device_statuses(observed_at);
    `);
  }
}
