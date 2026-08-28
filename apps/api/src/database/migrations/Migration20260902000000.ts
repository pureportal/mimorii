import { Migration } from "@mikro-orm/migrations";

export class Migration20260902000000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`
      CREATE TABLE oauth_authorization_codes (
        id TEXT PRIMARY KEY,
        code_hash TEXT NOT NULL UNIQUE,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        user_token_version INTEGER NOT NULL,
        client_id TEXT NOT NULL,
        redirect_uri TEXT NOT NULL,
        scopes TEXT NOT NULL,
        resource TEXT NOT NULL,
        code_challenge TEXT NOT NULL,
        allow_refresh BOOLEAN NOT NULL,
        expires_at TIMESTAMPTZ NOT NULL,
        used_at TIMESTAMPTZ,
        token_family_id TEXT,
        created_at TIMESTAMPTZ NOT NULL
      );

      CREATE TABLE oauth_access_tokens (
        id TEXT PRIMARY KEY,
        token_hash TEXT NOT NULL UNIQUE,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        user_token_version INTEGER NOT NULL,
        client_id TEXT NOT NULL,
        scopes TEXT NOT NULL,
        resource TEXT NOT NULL,
        refresh_family_id TEXT NOT NULL,
        expires_at TIMESTAMPTZ NOT NULL,
        last_used_at TIMESTAMPTZ,
        revoked_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL
      );

      CREATE TABLE oauth_refresh_tokens (
        id TEXT PRIMARY KEY,
        family_id TEXT NOT NULL,
        token_hash TEXT NOT NULL UNIQUE,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        user_token_version INTEGER NOT NULL,
        client_id TEXT NOT NULL,
        scopes TEXT NOT NULL,
        resource TEXT NOT NULL,
        expires_at TIMESTAMPTZ NOT NULL,
        consumed_at TIMESTAMPTZ,
        revoked_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL
      );

      CREATE INDEX idx_oauth_authorization_codes_expiry
        ON oauth_authorization_codes(expires_at);
      CREATE INDEX idx_oauth_access_tokens_user
        ON oauth_access_tokens(user_id, created_at DESC);
      CREATE INDEX idx_oauth_access_tokens_family
        ON oauth_access_tokens(refresh_family_id);
      CREATE INDEX idx_oauth_access_tokens_expiry
        ON oauth_access_tokens(expires_at);
      CREATE INDEX idx_oauth_refresh_tokens_user
        ON oauth_refresh_tokens(user_id, created_at DESC);
      CREATE INDEX idx_oauth_refresh_tokens_family
        ON oauth_refresh_tokens(family_id);
      CREATE INDEX idx_oauth_refresh_tokens_expiry
        ON oauth_refresh_tokens(expires_at);
    `);
  }

  override async down(): Promise<void> {
    this.addSql(`
      DROP TABLE oauth_refresh_tokens;
      DROP TABLE oauth_access_tokens;
      DROP TABLE oauth_authorization_codes;
    `);
  }
}
