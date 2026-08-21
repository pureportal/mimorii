import { Migration } from "@mikro-orm/migrations";

export class Migration20260823000000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`
      CREATE TABLE resource_images (
        resource_id TEXT PRIMARY KEY REFERENCES resources(id) ON DELETE CASCADE,
        image_data BYTEA NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL,
        CONSTRAINT resource_images_size_check
          CHECK (octet_length(image_data) <= 1048576)
      );
    `);
  }

  override async down(): Promise<void> {
    this.addSql("DROP TABLE resource_images;");
  }
}
