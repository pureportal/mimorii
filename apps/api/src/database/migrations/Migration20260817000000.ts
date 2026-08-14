import { Migration } from "@mikro-orm/migrations";

export class Migration20260817000000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`
      CREATE TABLE dashboards (
        id TEXT PRIMARY KEY,
        team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        slug TEXT NOT NULL,
        access_mode TEXT NOT NULL CHECK (access_mode IN ('public', 'private', 'protected')),
        access_key_hash TEXT,
        created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL,
        CHECK (access_mode = 'protected' OR access_key_hash IS NULL)
      );

      CREATE TABLE dashboard_items (
        id TEXT PRIMARY KEY,
        dashboard_id TEXT NOT NULL REFERENCES dashboards(id) ON DELETE CASCADE,
        resource_id TEXT REFERENCES resources(id) ON DELETE CASCADE,
        type TEXT NOT NULL CHECK (type IN ('metric', 'uptime', 'status', 'incidents')),
        title TEXT NOT NULL,
        width SMALLINT NOT NULL CHECK (width BETWEEN 1 AND 3),
        position SMALLINT NOT NULL CHECK (position >= 0),
        configuration_json JSONB NOT NULL,
        UNIQUE (dashboard_id, position)
      );

      CREATE UNIQUE INDEX dashboards_slug_unique ON dashboards (LOWER(slug));
      CREATE UNIQUE INDEX dashboards_access_key_unique ON dashboards (access_key_hash)
        WHERE access_key_hash IS NOT NULL;
      CREATE INDEX idx_dashboards_team ON dashboards (team_id, updated_at DESC);
      CREATE INDEX idx_dashboard_items_order ON dashboard_items (dashboard_id, position);
      CREATE INDEX idx_dashboard_items_resource ON dashboard_items (resource_id);
    `);
  }

  override async down(): Promise<void> {
    this.addSql(`
      DROP TABLE dashboard_items;
      DROP TABLE dashboards;
    `);
  }
}
