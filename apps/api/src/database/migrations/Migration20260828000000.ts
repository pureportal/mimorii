import { Migration } from "@mikro-orm/migrations";

export class Migration20260828000000 extends Migration {
  override async up(): Promise<void> {
    this.addSql("ALTER TABLE checks ADD COLUMN favicon_request_id TEXT;");
  }

  override async down(): Promise<void> {
    this.addSql("ALTER TABLE checks DROP COLUMN favicon_request_id;");
  }
}
