import { Migration } from "@mikro-orm/migrations";

export class Migration20260831000000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`
      CREATE TABLE team_logos (
        team_id TEXT PRIMARY KEY REFERENCES teams(id) ON DELETE CASCADE,
        image_data BYTEA NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL,
        CONSTRAINT team_logos_size_check
          CHECK (octet_length(image_data) <= 1048576)
      );
    `);
  }

  override async down(): Promise<void> {
    this.addSql("DROP TABLE team_logos;");
  }
}
