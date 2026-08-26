import { Migration } from "@mikro-orm/migrations";

export class Migration20260830000000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`
      DROP INDEX teams_slug_unique;
      ALTER TABLE teams DROP COLUMN slug;
      DROP INDEX dashboards_slug_unique;
      DROP INDEX status_pages_slug_unique;
    `);
  }

  override async down(): Promise<void> {
    throw new Error("Stable identifier routing cannot be downgraded");
  }
}
