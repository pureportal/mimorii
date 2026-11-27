import { Migration } from "@mikro-orm/migrations";

export class Migration20261127000000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`
      CREATE TABLE traffic_sites (
        id TEXT PRIMARY KEY,
        team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
        resource_id TEXT NOT NULL UNIQUE REFERENCES resources(id) ON DELETE CASCADE,
        public_key TEXT NOT NULL UNIQUE,
        domains TEXT[] NOT NULL,
        heatmaps_enabled BOOLEAN NOT NULL DEFAULT true,
        last_event_at TIMESTAMPTZ,
        created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL
      );

      CREATE INDEX idx_traffic_sites_team ON traffic_sites(team_id);

      CREATE TABLE traffic_salts (
        day DATE PRIMARY KEY,
        salt BYTEA NOT NULL
      );

      CREATE TABLE traffic_events (
        id BIGSERIAL PRIMARY KEY,
        site_id TEXT NOT NULL REFERENCES traffic_sites(id) ON DELETE CASCADE,
        occurred_at TIMESTAMPTZ NOT NULL,
        kind TEXT NOT NULL CHECK (kind IN ('pageview', 'leave', 'event', 'vital', 'error')),
        visitor_hash BIGINT NOT NULL,
        path TEXT NOT NULL,
        referrer_host TEXT,
        utm_source TEXT,
        utm_campaign TEXT,
        device TEXT NOT NULL CHECK (device IN ('desktop', 'tablet', 'mobile')),
        browser TEXT NOT NULL,
        os TEXT NOT NULL,
        country TEXT,
        language TEXT,
        name TEXT,
        value DOUBLE PRECISION,
        scroll_depth SMALLINT CHECK (scroll_depth BETWEEN 0 AND 100),
        source TEXT
      );

      CREATE INDEX idx_traffic_events_site_time ON traffic_events(site_id, occurred_at);
      CREATE INDEX idx_traffic_events_site_kind_time ON traffic_events(site_id, kind, occurred_at);

      CREATE TABLE traffic_clicks (
        id BIGSERIAL PRIMARY KEY,
        site_id TEXT NOT NULL REFERENCES traffic_sites(id) ON DELETE CASCADE,
        occurred_at TIMESTAMPTZ NOT NULL,
        path TEXT NOT NULL,
        device TEXT NOT NULL CHECK (device IN ('desktop', 'tablet', 'mobile')),
        selector TEXT NOT NULL,
        label TEXT,
        x SMALLINT NOT NULL CHECK (x BETWEEN 0 AND 1000),
        y SMALLINT NOT NULL CHECK (y BETWEEN 0 AND 1000),
        rage BOOLEAN NOT NULL DEFAULT false
      );

      CREATE INDEX idx_traffic_clicks_page ON traffic_clicks(site_id, path, device, occurred_at);
    `);
  }

  override async down(): Promise<void> {
    this.addSql(`
      DROP TABLE traffic_clicks;
      DROP TABLE traffic_events;
      DROP TABLE traffic_salts;
      DROP TABLE traffic_sites;
    `);
  }
}
