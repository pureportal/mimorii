import { ConflictException, Injectable, UnauthorizedException } from "@nestjs/common";
import type { PersonalDataExport } from "@mimorii/contracts";
import { verifyPassword } from "../common/crypto.js";
import type { AuthenticatedUser, UserRow } from "../common/rows.js";
import { DatabaseService } from "../database/database.service.js";

interface OwnedTeamRow {
  id: string;
  name: string;
  members: number;
  owners: number;
}

@Injectable()
export class AccountService {
  constructor(private readonly database: DatabaseService) {}

  async export(user: AuthenticatedUser): Promise<PersonalDataExport> {
    const [profile, teams, apiTokens, oauthGrants, devices, activity] = await Promise.all([
      this.database.get<UserRow & { terms_version: string; terms_accepted_at: string }>(
        "SELECT * FROM users WHERE id = ?",
        user.id
      ),
      this.database.all<{ name: string; role: string; joined_at: string }>(
        `SELECT t.name, tm.role, tm.joined_at FROM team_members tm
         JOIN teams t ON t.id = tm.team_id WHERE tm.user_id = ? ORDER BY tm.joined_at`,
        user.id
      ),
      this.database.all<{
        name: string;
        created_at: string;
        last_used_at: string | null;
        expires_at: string | null;
      }>(
        `SELECT name, created_at, last_used_at, expires_at FROM api_tokens
         WHERE user_id = ? ORDER BY created_at`,
        user.id
      ),
      this.database.all<{
        client_name: string;
        scopes: string;
        created_at: string;
        last_used_at: string | null;
        revoked_at: string | null;
      }>(
        `SELECT client_name, scopes, created_at, last_used_at, revoked_at FROM oauth_grants
         WHERE user_id = ? ORDER BY created_at`,
        user.id
      ),
      this.database.all<{ platform: string; status: string; last_seen_at: string }>(
        `SELECT platform, status, last_seen_at FROM notification_endpoints
         WHERE user_id = ? ORDER BY last_seen_at`,
        user.id
      ),
      this.database.all<{ action: string; subject_type: string; created_at: string }>(
        `SELECT action, subject_type, created_at FROM audit_events
         WHERE user_id = ? ORDER BY created_at DESC LIMIT 5000`,
        user.id
      ),
    ]);
    if (!profile) throw new UnauthorizedException("Sign in required");
    return {
      exportedAt: new Date().toISOString(),
      profile: {
        name: profile.name,
        email: profile.email,
        createdAt: new Date(profile.created_at).toISOString(),
        lastSignedInAt: profile.last_signed_in_at
          ? new Date(profile.last_signed_in_at).toISOString()
          : null,
        termsVersion: profile.terms_version,
        termsAcceptedAt: new Date(profile.terms_accepted_at).toISOString(),
      },
      teams: teams.map((team) => ({
        name: team.name,
        role: team.role,
        joinedAt: new Date(team.joined_at).toISOString(),
      })),
      apiTokens: apiTokens.map((token) => ({
        name: token.name,
        createdAt: new Date(token.created_at).toISOString(),
        lastUsedAt: isoOrNull(token.last_used_at),
        expiresAt: isoOrNull(token.expires_at),
      })),
      connectedApps: oauthGrants.map((grant) => ({
        name: grant.client_name,
        scopes: grant.scopes.split(" ").filter(Boolean),
        createdAt: new Date(grant.created_at).toISOString(),
        lastUsedAt: isoOrNull(grant.last_used_at),
        revokedAt: isoOrNull(grant.revoked_at),
      })),
      notificationDevices: devices.map((device) => ({
        platform: device.platform,
        status: device.status,
        lastSeenAt: new Date(device.last_seen_at).toISOString(),
      })),
      activity: activity.map((event) => ({
        action: event.action,
        subject: event.subject_type,
        at: new Date(event.created_at).toISOString(),
      })),
    };
  }

  async delete(user: AuthenticatedUser, password: string): Promise<void> {
    const row = await this.database.get<UserRow>("SELECT * FROM users WHERE id = ?", user.id);
    if (!row || !(await verifyPassword(password, row.password_hash))) {
      throw new UnauthorizedException("Password is incorrect");
    }
    if (row.is_global_admin) {
      const otherAdministrators = await this.database.get<{ count: number }>(
        `SELECT COUNT(*)::int AS count FROM users
         WHERE is_global_admin = TRUE AND disabled_at IS NULL AND id != ?`,
        user.id
      );
      if (!otherAdministrators?.count) {
        throw new ConflictException("Make another user a platform administrator first");
      }
    }
    const ownedTeams = await this.database.all<OwnedTeamRow>(
      `SELECT t.id, t.name,
         (SELECT COUNT(*)::int FROM team_members m WHERE m.team_id = t.id) AS members,
         (SELECT COUNT(*)::int FROM team_members m WHERE m.team_id = t.id AND m.role = 'owner') AS owners
       FROM teams t JOIN team_members tm ON tm.team_id = t.id
       WHERE tm.user_id = ? AND tm.role = 'owner'`,
      user.id
    );
    const sharedTeam = ownedTeams.find((team) => team.owners === 1 && team.members > 1);
    if (sharedTeam) {
      throw new ConflictException(`Make another member an owner of ${sharedTeam.name} first`);
    }
    const soloTeamIds = ownedTeams
      .filter((candidate) => candidate.members === 1)
      .map((team) => team.id);
    await this.database.transaction(async () => {
      await this.database.run(
        "DELETE FROM teams WHERE id IN (SELECT jsonb_array_elements_text(?::jsonb))",
        JSON.stringify(soloTeamIds)
      );
      await this.database.run("DELETE FROM team_invites WHERE LOWER(email) = LOWER(?)", row.email);
      await this.database.run("DELETE FROM users WHERE id = ?", user.id);
    });
  }
}

function isoOrNull(value: string | null): string | null {
  return value ? new Date(value).toISOString() : null;
}
