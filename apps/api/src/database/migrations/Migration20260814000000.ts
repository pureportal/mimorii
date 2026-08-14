import { Migration } from "@mikro-orm/migrations";

export class Migration20260814000000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`
      ALTER TABLE users
        ADD COLUMN is_global_admin BOOLEAN NOT NULL DEFAULT FALSE,
        ADD COLUMN disabled_at TIMESTAMPTZ,
        ADD COLUMN last_signed_in_at TIMESTAMPTZ;

      UPDATE users u
      SET last_signed_in_at = signed_in.last_signed_in_at
      FROM (
        SELECT user_id, MAX(created_at) AS last_signed_in_at
        FROM audit_events
        WHERE action = 'account.signed_in' AND user_id IS NOT NULL
        GROUP BY user_id
      ) signed_in
      WHERE signed_in.user_id = u.id;

      ALTER TABLE sponsorship_applications
        ADD COLUMN status TEXT NOT NULL DEFAULT 'pending'
          CHECK (status IN ('pending', 'approved', 'declined')),
        ADD COLUMN reviewed_by TEXT REFERENCES users(id) ON DELETE SET NULL,
        ADD COLUMN reviewed_at TIMESTAMPTZ;

      ALTER TABLE sponsors ADD COLUMN updated_at TIMESTAMPTZ;
      UPDATE sponsors SET updated_at = created_at;
      ALTER TABLE sponsors
        ALTER COLUMN updated_at SET NOT NULL,
        ALTER COLUMN updated_at SET DEFAULT CURRENT_TIMESTAMP;

      CREATE TABLE platform_settings (
        id SMALLINT PRIMARY KEY CHECK (id = 1),
        registration_enabled BOOLEAN NOT NULL,
        sponsorship_applications_enabled BOOLEAN NOT NULL,
        sponsorship_application_retention_days INTEGER NOT NULL
          CHECK (sponsorship_application_retention_days BETWEEN 1 AND 3650),
        revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
        updated_by TEXT REFERENCES users(id) ON DELETE SET NULL,
        updated_at TIMESTAMPTZ NOT NULL
      );

      INSERT INTO platform_settings
        (id, registration_enabled, sponsorship_applications_enabled,
         sponsorship_application_retention_days, revision, updated_at)
      VALUES (1, TRUE, TRUE, 180, 1, CURRENT_TIMESTAMP);

      CREATE INDEX idx_users_created ON users(created_at DESC);
      CREATE INDEX idx_users_last_signed_in ON users(last_signed_in_at DESC)
        WHERE last_signed_in_at IS NOT NULL;
      CREATE INDEX idx_users_global_admin ON users(is_global_admin, disabled_at)
        WHERE is_global_admin = TRUE;
      CREATE UNIQUE INDEX sponsors_name_unique ON sponsors(LOWER(name));
      CREATE INDEX idx_sponsorship_applications_status_time
        ON sponsorship_applications(status, submitted_at DESC);
    `);
  }

  override async down(): Promise<void> {
    this.addSql(`
      DROP INDEX idx_sponsorship_applications_status_time;
      DROP INDEX sponsors_name_unique;
      DROP INDEX idx_users_global_admin;
      DROP INDEX idx_users_last_signed_in;
      DROP INDEX idx_users_created;
      DROP TABLE platform_settings;
      ALTER TABLE sponsors DROP COLUMN updated_at;
      ALTER TABLE sponsorship_applications
        DROP COLUMN reviewed_at,
        DROP COLUMN reviewed_by,
        DROP COLUMN status;
      ALTER TABLE users
        DROP COLUMN last_signed_in_at,
        DROP COLUMN disabled_at,
        DROP COLUMN is_global_admin;
    `);
  }
}
