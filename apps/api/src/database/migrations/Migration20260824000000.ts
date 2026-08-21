import { Migration } from "@mikro-orm/migrations";

export class Migration20260824000000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`
      ALTER TABLE notification_deliveries ADD COLUMN occurrence_key TEXT;
      ALTER TABLE status_subscriber_deliveries ADD COLUMN occurrence_key TEXT;

      CREATE UNIQUE INDEX idx_notification_delivery_occurrence
        ON notification_deliveries(channel_id, event, occurrence_key)
        WHERE occurrence_key IS NOT NULL;
      CREATE UNIQUE INDEX idx_status_subscriber_delivery_occurrence
        ON status_subscriber_deliveries(subscriber_id, event, occurrence_key)
        WHERE occurrence_key IS NOT NULL;
    `);
  }

  override async down(): Promise<void> {
    this.addSql(`
      DROP INDEX idx_status_subscriber_delivery_occurrence;
      DROP INDEX idx_notification_delivery_occurrence;
      ALTER TABLE status_subscriber_deliveries DROP COLUMN occurrence_key;
      ALTER TABLE notification_deliveries DROP COLUMN occurrence_key;
    `);
  }
}
