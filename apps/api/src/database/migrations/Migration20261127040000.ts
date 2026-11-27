import { Migration } from "@mikro-orm/migrations";

export class Migration20261127040000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`
      ALTER TABLE teams ALTER COLUMN created_by DROP NOT NULL;
      ALTER TABLE teams DROP CONSTRAINT teams_created_by_fkey;
      ALTER TABLE teams ADD CONSTRAINT teams_created_by_fkey
        FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL;
      ALTER TABLE team_invites ALTER COLUMN invited_by DROP NOT NULL;
      ALTER TABLE team_invites DROP CONSTRAINT team_invites_invited_by_fkey;
      ALTER TABLE team_invites ADD CONSTRAINT team_invites_invited_by_fkey
        FOREIGN KEY (invited_by) REFERENCES users(id) ON DELETE SET NULL;
    `);
  }

  override async down(): Promise<void> {
    throw new Error("Deleted accounts cannot be restored");
  }
}
