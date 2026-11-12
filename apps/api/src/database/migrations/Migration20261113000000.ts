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

      DROP TABLE password_reset_tokens;
    `);
  }
}
