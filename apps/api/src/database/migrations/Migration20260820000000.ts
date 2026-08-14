import { Migration } from "@mikro-orm/migrations";

export class Migration20260820000000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`
      ALTER TABLE users
        ADD COLUMN acknowledged_tour_ids JSONB NOT NULL DEFAULT '[]'::JSONB,
        ADD CONSTRAINT users_acknowledged_tour_ids_array
          CHECK (jsonb_typeof(acknowledged_tour_ids) = 'array');
    `);
  }

  override async down(): Promise<void> {
    this.addSql(`
      ALTER TABLE users
        DROP CONSTRAINT users_acknowledged_tour_ids_array,
        DROP COLUMN acknowledged_tour_ids;
    `);
  }
}
