import { Migration } from "@mikro-orm/migrations";

export class Migration20260904000000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`
      CREATE TABLE user_sessions (
        id TEXT PRIMARY KEY,
        token_hash TEXT NOT NULL UNIQUE,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        user_token_version INTEGER NOT NULL,
        expires_at TIMESTAMPTZ NOT NULL,
        last_refreshed_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL
      );

      CREATE INDEX idx_user_sessions_user
        ON user_sessions(user_id, created_at DESC);
      CREATE INDEX idx_user_sessions_expiry
        ON user_sessions(expires_at);
    `);
  }

  override async down(): Promise<void> {
    this.addSql("DROP TABLE user_sessions;");
  }
}
