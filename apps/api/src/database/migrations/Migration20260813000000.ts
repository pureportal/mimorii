import { Migration } from "@mikro-orm/migrations";

export class Migration20260813000000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`
      ALTER TABLE users
        ADD COLUMN terms_version TEXT,
        ADD COLUMN terms_accepted_at TIMESTAMPTZ;

      DELETE FROM api_tokens
        WHERE revoked_at IS NOT NULL
        OR (expires_at IS NOT NULL AND expires_at <= CURRENT_TIMESTAMP);
      ALTER TABLE api_tokens DROP COLUMN revoked_at;

      DELETE FROM team_invites
        WHERE accepted_at IS NOT NULL OR expires_at <= CURRENT_TIMESTAMP;
      DROP INDEX idx_team_invites_pending;
      ALTER TABLE team_invites DROP COLUMN accepted_at;
      CREATE INDEX idx_team_invites_pending ON team_invites(team_id, created_at DESC);

      DELETE FROM status_subscribers WHERE unsubscribed_at IS NOT NULL;
      ALTER TABLE status_subscribers
        ADD COLUMN verification_expires_at TIMESTAMPTZ;
      UPDATE status_subscribers
        SET verification_expires_at = created_at + INTERVAL '1 day'
        WHERE verified_at IS NULL;
      DELETE FROM status_subscribers
        WHERE verified_at IS NULL AND verification_expires_at <= CURRENT_TIMESTAMP;
      UPDATE status_subscribers SET token_hash = NULL WHERE verified_at IS NOT NULL;
      ALTER TABLE status_subscribers
        ALTER COLUMN token_hash DROP NOT NULL,
        DROP COLUMN unsubscribed_at;
      CREATE INDEX idx_status_subscribers_verification
        ON status_subscribers(verification_expires_at)
        WHERE verified_at IS NULL;
    `);
  }

  override async down(): Promise<void> {
    this.addSql(`
      DROP INDEX idx_status_subscribers_verification;
      ALTER TABLE status_subscribers ADD COLUMN unsubscribed_at TIMESTAMPTZ;
      UPDATE status_subscribers SET token_hash = 'retired:' || id WHERE token_hash IS NULL;
      ALTER TABLE status_subscribers
        ALTER COLUMN token_hash SET NOT NULL,
        DROP COLUMN verification_expires_at;

      DROP INDEX idx_team_invites_pending;
      ALTER TABLE team_invites ADD COLUMN accepted_at TIMESTAMPTZ;
      CREATE INDEX idx_team_invites_pending ON team_invites(team_id, created_at DESC)
        WHERE accepted_at IS NULL;

      ALTER TABLE users
        DROP COLUMN terms_accepted_at,
        DROP COLUMN terms_version;
      ALTER TABLE api_tokens ADD COLUMN revoked_at TIMESTAMPTZ;
    `);
  }
}
