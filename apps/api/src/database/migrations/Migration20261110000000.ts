import { Migration } from "@mikro-orm/migrations";

export class Migration20261110000000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`
      DELETE FROM api_tokens;

      ALTER TABLE api_tokens
        ADD COLUMN access TEXT NOT NULL CHECK (access IN ('read', 'write'));

      CREATE TABLE api_token_teams (
        api_token_id TEXT NOT NULL REFERENCES api_tokens(id) ON DELETE CASCADE,
        team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
        role TEXT NOT NULL CHECK (role IN ('owner', 'admin', 'member', 'viewer')),
        PRIMARY KEY (api_token_id, team_id)
      );

      CREATE INDEX idx_api_token_teams_team ON api_token_teams(team_id);
    `);
  }

  override async down(): Promise<void> {
    this.addSql(`
      DROP TABLE api_token_teams;
      ALTER TABLE api_tokens DROP COLUMN access;
    `);
  }
}
