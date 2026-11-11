import { Migration } from "@mikro-orm/migrations";

export class Migration20261111000000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`
      CREATE TABLE team_log_settings (
        team_id TEXT PRIMARY KEY REFERENCES teams(id) ON DELETE CASCADE,
        enabled BOOLEAN NOT NULL,
        retention_days INTEGER NOT NULL DEFAULT 14 CHECK (retention_days BETWEEN 1 AND 90),
        enabled_at TIMESTAMPTZ,
        disabled_at TIMESTAMPTZ,
        purge_after TIMESTAMPTZ,
        updated_by TEXT REFERENCES users(id) ON DELETE SET NULL,
        updated_at TIMESTAMPTZ NOT NULL,
        CHECK (enabled OR disabled_at IS NOT NULL)
      );

      CREATE INDEX idx_team_log_settings_purge ON team_log_settings(purge_after)
        WHERE purge_after IS NOT NULL;

      CREATE TABLE log_sources (
        id TEXT PRIMARY KEY,
        team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        labels JSONB NOT NULL DEFAULT '{}'::jsonb,
        token_prefix TEXT NOT NULL,
        token_hash TEXT NOT NULL UNIQUE,
        last_received_at TIMESTAMPTZ,
        last_error TEXT,
        last_error_at TIMESTAMPTZ,
        created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL
      );

      CREATE INDEX idx_log_sources_team ON log_sources(team_id);

      CREATE TABLE log_source_stats (
        source_id TEXT NOT NULL REFERENCES log_sources(id) ON DELETE CASCADE,
        bucket_start TIMESTAMPTZ NOT NULL,
        accepted INTEGER NOT NULL DEFAULT 0,
        rejected INTEGER NOT NULL DEFAULT 0,
        bytes BIGINT NOT NULL DEFAULT 0,
        PRIMARY KEY (source_id, bucket_start)
      );

      CREATE TABLE log_streams (
        id TEXT PRIMARY KEY,
        team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
        labels JSONB NOT NULL,
        labels_hash TEXT NOT NULL,
        first_seen_at TIMESTAMPTZ NOT NULL,
        last_seen_at TIMESTAMPTZ NOT NULL,
        UNIQUE (team_id, labels_hash)
      );

      CREATE INDEX idx_log_streams_team_seen ON log_streams(team_id, last_seen_at DESC);
      CREATE INDEX idx_log_streams_labels ON log_streams USING GIN (labels jsonb_path_ops);

      CREATE TABLE log_entries (
        id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
        stream_id TEXT NOT NULL REFERENCES log_streams(id) ON DELETE CASCADE,
        occurred_at TIMESTAMPTZ NOT NULL,
        received_at TIMESTAMPTZ NOT NULL,
        level TEXT NOT NULL
          CHECK (level IN ('fatal', 'error', 'warn', 'info', 'debug', 'trace', 'unknown')),
        message TEXT NOT NULL,
        attributes JSONB NOT NULL DEFAULT '{}'::jsonb
      );

      CREATE INDEX idx_log_entries_team_time ON log_entries(team_id, occurred_at DESC, id DESC);
      CREATE INDEX idx_log_entries_stream_time
        ON log_entries(stream_id, occurred_at DESC, id DESC);
      CREATE UNIQUE INDEX idx_log_entries_dedup
        ON log_entries(stream_id, occurred_at, (md5(message)));
      CREATE INDEX idx_log_entries_team_level_time
        ON log_entries(team_id, level, occurred_at DESC, id DESC);
      CREATE EXTENSION IF NOT EXISTS pg_trgm;
      CREATE INDEX idx_log_entries_message_trgm ON log_entries USING GIN (message gin_trgm_ops);

      CREATE TABLE log_volume (
        team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
        resolution_seconds INTEGER NOT NULL CHECK (resolution_seconds IN (300, 3600)),
        bucket_start TIMESTAMPTZ NOT NULL,
        stream_id TEXT NOT NULL,
        level TEXT NOT NULL,
        entries INTEGER NOT NULL CHECK (entries > 0),
        PRIMARY KEY (team_id, resolution_seconds, bucket_start, stream_id, level)
      );

      CREATE TABLE log_saved_searches (
        id TEXT PRIMARY KEY,
        team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        query TEXT NOT NULL,
        created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ NOT NULL
      );
      CREATE UNIQUE INDEX idx_log_saved_searches_name
        ON log_saved_searches(team_id, LOWER(name));

      CREATE TABLE log_alert_rules (
        id TEXT PRIMARY KEY,
        team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
        resource_id TEXT REFERENCES resources(id) ON DELETE SET NULL,
        name TEXT NOT NULL,
        query TEXT NOT NULL,
        window_seconds INTEGER NOT NULL CHECK (window_seconds BETWEEN 60 AND 86400),
        comparison TEXT NOT NULL CHECK (comparison IN ('atLeast', 'below')),
        threshold INTEGER NOT NULL CHECK (threshold BETWEEN 1 AND 100000),
        pending_seconds INTEGER NOT NULL DEFAULT 0 CHECK (pending_seconds BETWEEN 0 AND 3600),
        impact TEXT NOT NULL CHECK (impact IN ('minor', 'major', 'critical')),
        auto_resolve BOOLEAN NOT NULL,
        enabled BOOLEAN NOT NULL,
        pending_since TIMESTAMPTZ,
        firing_since TIMESTAMPTZ,
        last_evaluated_at TIMESTAMPTZ,
        last_error TEXT,
        last_match_count INTEGER,
        last_matched_at TIMESTAMPTZ,
        created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL
      );

      CREATE INDEX idx_log_alert_rules_team ON log_alert_rules(team_id);

      ALTER TABLE incidents
        ADD COLUMN log_alert_rule_id TEXT REFERENCES log_alert_rules(id) ON DELETE SET NULL;

      CREATE UNIQUE INDEX idx_incidents_log_alert_rule_open ON incidents(log_alert_rule_id)
        WHERE log_alert_rule_id IS NOT NULL AND status != 'resolved';
    `);
  }

  override async down(): Promise<void> {
    this.addSql(`
      DROP INDEX idx_incidents_log_alert_rule_open;
      ALTER TABLE incidents DROP COLUMN log_alert_rule_id;
      DROP TABLE log_alert_rules;
      DROP TABLE log_saved_searches;
      DROP TABLE log_volume;
      DROP TABLE log_entries;
      DROP TABLE log_streams;
      DROP TABLE log_source_stats;
      DROP TABLE log_sources;
      DROP TABLE team_log_settings;
    `);
  }
}
