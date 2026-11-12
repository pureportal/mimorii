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

      DELETE FROM oauth_authorization_codes;
      ALTER TABLE oauth_authorization_codes ADD COLUMN client_name TEXT NOT NULL;
      ALTER TABLE oauth_refresh_tokens ADD COLUMN replaced_by TEXT;

      CREATE TABLE oauth_grants (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        client_id TEXT NOT NULL,
        client_name TEXT NOT NULL,
        scopes TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL,
        last_used_at TIMESTAMPTZ,
        revoked_at TIMESTAMPTZ
      );

      CREATE INDEX idx_oauth_grants_user ON oauth_grants(user_id, created_at DESC);

      INSERT INTO oauth_grants (id, user_id, client_id, client_name, scopes, created_at, last_used_at)
      SELECT family_id, user_id, client_id,
        COALESCE(substring(client_id from '^https://([^/:]+)'), client_id),
        MAX(scopes), MIN(created_at), MAX(last_used_at)
      FROM (
        SELECT refresh_family_id AS family_id, user_id, client_id, scopes, created_at, last_used_at
        FROM oauth_access_tokens
        UNION ALL
        SELECT family_id, user_id, client_id, scopes, created_at, NULL
        FROM oauth_refresh_tokens
      ) tokens
      GROUP BY family_id, user_id, client_id;

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

      DROP TABLE oauth_grants;
      ALTER TABLE oauth_refresh_tokens DROP COLUMN replaced_by;
      ALTER TABLE oauth_authorization_codes DROP COLUMN client_name;

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
