import { Migration } from "@mikro-orm/migrations";

export class Migration20260903000000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`
      ALTER TABLE notification_policies
        ADD COLUMN all_channels INTEGER NOT NULL DEFAULT 0;
    `);
  }

  override async down(): Promise<void> {
    this.addSql(`
      ALTER TABLE notification_policies DROP COLUMN all_channels;
    `);
  }
}
