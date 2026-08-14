import { Migration } from "@mikro-orm/migrations";

export class Migration20260818000000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`
      ALTER TABLE agents
        ADD COLUMN collection_interval_seconds INTEGER NOT NULL DEFAULT 30
        CHECK (collection_interval_seconds BETWEEN 15 AND 3600);
    `);
  }

  override async down(): Promise<void> {
    this.addSql(`
      ALTER TABLE agents DROP COLUMN collection_interval_seconds;
    `);
  }
}
