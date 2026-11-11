import { Migration } from "@mikro-orm/migrations";

export class Migration20261112000000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`
      CREATE TABLE user_two_factor (
        user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        totp_secret TEXT NOT NULL,
        last_used_step BIGINT,
        failed_attempts INTEGER NOT NULL DEFAULT 0,
        locked_until TIMESTAMPTZ,
        enabled_at TIMESTAMPTZ NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL
      );

      CREATE TABLE user_recovery_codes (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES user_two_factor(user_id) ON DELETE CASCADE,
        code_hash TEXT NOT NULL,
        used_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL
      );

      CREATE INDEX idx_user_recovery_codes_user ON user_recovery_codes(user_id);

      CREATE TABLE two_factor_challenges (
        id TEXT PRIMARY KEY,
        token_hash TEXT NOT NULL UNIQUE,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        user_token_version INTEGER NOT NULL,
        purpose TEXT NOT NULL CHECK (purpose IN ('sign-in', 'enrollment', 'replacement')),
        totp_secret TEXT,
        expires_at TIMESTAMPTZ NOT NULL,
        created_at TIMESTAMPTZ NOT NULL,
        CHECK ((purpose = 'sign-in') = (totp_secret IS NULL))
      );

      CREATE INDEX idx_two_factor_challenges_user ON two_factor_challenges(user_id);
      CREATE INDEX idx_two_factor_challenges_expiry ON two_factor_challenges(expires_at);

      UPDATE users SET token_version = token_version + 1;
    `);
  }

  override async down(): Promise<void> {
    this.addSql(`
      DROP TABLE two_factor_challenges;
      DROP TABLE user_recovery_codes;
      DROP TABLE user_two_factor;
    `);
  }
}
