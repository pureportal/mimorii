import { Migration } from "@mikro-orm/migrations";

export class Migration20261127030000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      "ALTER TABLE incidents ADD COLUMN acknowledged_by TEXT REFERENCES users(id) ON DELETE SET NULL;"
    );
  }

  override async down(): Promise<void> {
    this.addSql("ALTER TABLE incidents DROP COLUMN acknowledged_by;");
  }
}
