import { Migration } from "@mikro-orm/migrations";

export class Migration20260819000000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`
      ALTER TABLE sponsors
        ADD COLUMN favicon_data BYTEA,
        ADD COLUMN favicon_updated_at TIMESTAMPTZ,
        ADD CONSTRAINT sponsors_favicon_consistency
          CHECK ((favicon_data IS NULL) = (favicon_updated_at IS NULL));
    `);
  }

  override async down(): Promise<void> {
    this.addSql(`
      ALTER TABLE sponsors
        DROP CONSTRAINT sponsors_favicon_consistency,
        DROP COLUMN favicon_updated_at,
        DROP COLUMN favicon_data;
    `);
  }
}
