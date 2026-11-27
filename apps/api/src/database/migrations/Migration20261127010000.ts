import { Migration } from "@mikro-orm/migrations";

export class Migration20261127010000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      "ALTER TABLE resources ADD COLUMN app TEXT CHECK (app IN ('foxytail', 'machdoch-cloud', 'lifie'));"
    );
  }

  override async down(): Promise<void> {
    this.addSql("ALTER TABLE resources DROP COLUMN app;");
  }
}
