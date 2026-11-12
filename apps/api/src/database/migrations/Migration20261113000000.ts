import { Migration } from "@mikro-orm/migrations";

export class Migration20261113000000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`
      CREATE TABLE password_reset_tokens (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        token_hash TEXT NOT NULL UNIQUE,
        issued_by TEXT REFERENCES users(id) ON DELETE SET NULL,
        expires_at TIMESTAMPTZ NOT NULL,
        used_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL
      );

      CREATE INDEX idx_password_reset_tokens_user ON password_reset_tokens(user_id, created_at DESC);

      ALTER TABLE status_pages
        ADD COLUMN description TEXT NOT NULL DEFAULT '',
        ADD COLUMN accent_color TEXT CHECK (accent_color ~ '^#[0-9a-f]{6}$'),
        ADD COLUMN website_url TEXT,
        ADD COLUMN show_logo INTEGER NOT NULL DEFAULT 1;

      ALTER TABLE resources ADD COLUMN log_query TEXT;

      ALTER TABLE checks
        DROP CONSTRAINT checks_type_check,
        ADD CONSTRAINT checks_type_check CHECK (
          type IN (
            'http', 'tcp', 'dns', 'icmp', 'wan', 'tls', 'smtp', 'grpc', 'ntp', 'domain',
            'database', 'host', 'disk', 'docker'
          )
        );
    `);
  }

  override async down(): Promise<void> {
    this.addSql(`
      DELETE FROM checks WHERE type IN ('tls', 'smtp', 'grpc', 'ntp', 'domain');
      ALTER TABLE checks
        DROP CONSTRAINT checks_type_check,
        ADD CONSTRAINT checks_type_check CHECK (
          type IN ('http', 'tcp', 'dns', 'icmp', 'wan', 'host', 'disk', 'docker', 'database')
        );

      ALTER TABLE resources DROP COLUMN log_query;

      ALTER TABLE status_pages
        DROP COLUMN show_logo,
        DROP COLUMN website_url,
        DROP COLUMN accent_color,
        DROP COLUMN description;
      DROP TABLE password_reset_tokens;
    `);
  }
}
