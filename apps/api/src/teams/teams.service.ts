import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { TeamInvitationSummary, TeamRole, TeamSummary } from "@mimorii/contracts";
import { randomUUID } from "node:crypto";
import { AuditService } from "../common/audit.service.js";
import { createSecret, hashSecret } from "../common/crypto.js";
import { DatabaseService } from "../database/database.service.js";
import { createDefaultNotificationPolicy } from "../notifications/default-notification-policy.js";
import type {
  CreateTeamDto,
  DeleteTeamDto,
  InviteMemberDto,
  UpdateMemberRoleDto,
  UpdateTeamDto,
} from "./teams.dto.js";
import { TeamAccessService } from "./team-access.service.js";
import { TeamLogosService } from "./team-logos.service.js";

interface TeamRow {
  id: string;
  name: string;
  role: TeamRole;
  logo_updated_at: string | null;
  created_at: string;
}

interface MemberRow {
  id: string;
  email: string;
  name: string;
  role: TeamRole;
  joined_at: string;
}

interface InviteRow {
  id: string;
  team_id: string;
  email: string;
  role: Exclude<TeamRole, "owner">;
  expires_at: string;
  created_at: string;
}

@Injectable()
export class TeamsService {
  constructor(
    private readonly database: DatabaseService,
    private readonly access: TeamAccessService,
    private readonly audit: AuditService,
    private readonly logos: TeamLogosService
  ) {}

  async list(userId: string): Promise<TeamSummary[]> {
    const teams = await this.database.all<TeamRow>(
      `SELECT t.id, t.name, m.role, logo.updated_at AS logo_updated_at, t.created_at
         FROM teams t JOIN team_members m ON m.team_id = t.id
         LEFT JOIN team_logos logo ON logo.team_id = t.id
         WHERE m.user_id = ? ORDER BY LOWER(t.name)`,
      userId
    );
    return teams.map((team) => this.mapTeam(team));
  }

  async create(userId: string, input: CreateTeamDto, logoInput?: Buffer): Promise<TeamSummary> {
    const logo = logoInput ? await this.logos.prepare(logoInput) : null;
    const id = randomUUID();
    const now = new Date().toISOString();
    const name = input.name.trim();
    let logoUpdatedAt: string | null = null;
    await this.database.transaction(async () => {
      await this.database.run(
        `INSERT INTO teams (id, name, created_by, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?)`,
        id,
        name,
        userId,
        now,
        now
      );
      await this.database.run(
        "INSERT INTO team_members (team_id, user_id, role, joined_at) VALUES (?, ?, 'owner', ?)",
        id,
        userId,
        now
      );
      await createDefaultNotificationPolicy(this.database, userId, id, now);
      if (logo) logoUpdatedAt = await this.logos.store(id, logo);
    });
    await this.audit.record({
      teamId: id,
      userId,
      action: "team.created",
      subjectType: "team",
      subjectId: id,
    });
    return { id, name, role: "owner", logoUpdatedAt, createdAt: now };
  }

  async update(
    userId: string,
    teamId: string,
    input: UpdateTeamDto,
    logoInput?: Buffer
  ): Promise<TeamSummary> {
    await this.access.require(userId, teamId, "admin");
    const logo = logoInput ? await this.logos.prepare(logoInput) : null;
    const name = input.name.trim();
    await this.database.transaction(async () => {
      const result = await this.database.run(
        "UPDATE teams SET name = ?, updated_at = ? WHERE id = ?",
        name,
        new Date().toISOString(),
        teamId
      );
      if (result.changes === 0) throw new NotFoundException("Team not found");
      if (logo) {
        await this.logos.store(teamId, logo);
        await this.audit.record({
          teamId,
          userId,
          action: "team.logo_updated",
          subjectType: "team",
          subjectId: teamId,
        });
      }
    });
    await this.audit.record({
      teamId,
      userId,
      action: "team.updated",
      subjectType: "team",
      subjectId: teamId,
    });
    return this.getSummary(userId, teamId);
  }

  async remove(userId: string, teamId: string, input: DeleteTeamDto): Promise<void> {
    await this.access.require(userId, teamId, "owner");
    const team = await this.database.get<{ name: string }>(
      "SELECT name FROM teams WHERE id = ?",
      teamId
    );
    if (!team) throw new NotFoundException("Team not found");
    if (team.name !== input.name.trim()) throw new BadRequestException("Team name does not match");
    await this.database.run("DELETE FROM teams WHERE id = ?", teamId);
  }

  async members(userId: string, teamId: string) {
    await this.access.require(userId, teamId, "viewer");
    const members = await this.database.all<MemberRow>(
      `SELECT u.id, u.email, u.name, m.role, m.joined_at
         FROM team_members m JOIN users u ON u.id = m.user_id
         WHERE m.team_id = ? ORDER BY LOWER(u.name)`,
      teamId
    );
    return members.map((member) => ({
      id: member.id,
      email: member.email,
      name: member.name,
      role: member.role,
      joinedAt: member.joined_at,
    }));
  }

  async invitations(userId: string, teamId: string): Promise<TeamInvitationSummary[]> {
    await this.access.require(userId, teamId, "admin");
    const invites = await this.database.all<InviteRow>(
      "SELECT * FROM team_invites WHERE team_id = ? ORDER BY created_at DESC",
      teamId
    );
    return invites.map((invite) => ({
      id: invite.id,
      email: invite.email,
      role: invite.role,
      status: new Date(invite.expires_at).getTime() <= Date.now() ? "expired" : "pending",
      expiresAt: invite.expires_at,
      createdAt: invite.created_at,
    }));
  }

  async invite(userId: string, teamId: string, input: InviteMemberDto) {
    await this.access.require(userId, teamId, "admin");
    const email = input.email.trim().toLowerCase();
    const member = await this.database.get(
      `SELECT 1 FROM team_members m JOIN users u ON u.id = m.user_id
       WHERE m.team_id = ? AND u.email = ?`,
      teamId,
      email
    );
    if (member) throw new ConflictException("This user is already a member");

    const rawToken = createSecret("mim_invite");
    const id = randomUUID();
    const createdAt = new Date().toISOString();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    await this.database.transaction(async () => {
      await this.database.run(
        "DELETE FROM team_invites WHERE team_id = ? AND email = ?",
        teamId,
        email
      );
      await this.database.run(
        `INSERT INTO team_invites
         (id, team_id, email, role, token_hash, invited_by, expires_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        id,
        teamId,
        email,
        input.role,
        hashSecret(rawToken),
        userId,
        expiresAt,
        createdAt
      );
    });
    await this.audit.record({
      teamId,
      userId,
      action: "team.member_invited",
      subjectType: "invite",
      subjectId: id,
      metadata: { role: input.role },
    });
    return { id, email, role: input.role, token: rawToken, expiresAt, createdAt };
  }

  async revokeInvitation(userId: string, teamId: string, id: string): Promise<void> {
    await this.access.require(userId, teamId, "admin");
    const result = await this.database.run(
      "DELETE FROM team_invites WHERE id = ? AND team_id = ?",
      id,
      teamId
    );
    if (result.changes === 0) throw new NotFoundException("Invitation not found");
    await this.audit.record({
      teamId,
      userId,
      action: "team.invitation_revoked",
      subjectType: "invite",
      subjectId: id,
    });
  }

  async accept(userId: string, token: string): Promise<TeamSummary> {
    const invite = await this.database.get<InviteRow>(
      "SELECT * FROM team_invites WHERE token_hash = ?",
      hashSecret(token)
    );
    if (!invite) throw new NotFoundException("Invitation not found");
    if (new Date(invite.expires_at).getTime() <= Date.now()) {
      await this.database.run("DELETE FROM team_invites WHERE id = ?", invite.id);
      throw new BadRequestException("Invitation has expired");
    }
    const user = await this.database.get<{ email: string }>(
      "SELECT email FROM users WHERE id = ?",
      userId
    );
    if (!user || user.email.toLowerCase() !== invite.email.toLowerCase()) {
      throw new ForbiddenException("Invitation belongs to another email address");
    }

    const now = new Date().toISOString();
    await this.database.transaction(async () => {
      await this.database.run(
        `INSERT INTO team_members (team_id, user_id, role, joined_at) VALUES (?, ?, ?, ?)
         ON CONFLICT(team_id, user_id) DO UPDATE SET role = excluded.role`,
        invite.team_id,
        userId,
        invite.role,
        now
      );
      await this.database.run("DELETE FROM team_invites WHERE id = ?", invite.id);
    });
    await this.audit.record({
      teamId: invite.team_id,
      userId,
      action: "team.invitation_accepted",
      subjectType: "invite",
      subjectId: invite.id,
    });
    return this.getSummary(userId, invite.team_id);
  }

  async updateRole(
    actorId: string,
    teamId: string,
    memberId: string,
    input: UpdateMemberRoleDto
  ): Promise<void> {
    await this.database.transaction(async () => {
      await this.lockTeam(teamId);
      const actor = await this.access.require(actorId, teamId, "admin");
      const member = await this.database.get<{ role: TeamRole }>(
        "SELECT role FROM team_members WHERE team_id = ? AND user_id = ?",
        teamId,
        memberId
      );
      if (!member) throw new NotFoundException("Member not found");
      if ((member.role === "owner" || input.role === "owner") && actor.role !== "owner") {
        throw new ForbiddenException("Only owners can change ownership");
      }
      if (
        member.role === "owner" &&
        input.role !== "owner" &&
        (await this.ownerCount(teamId)) === 1
      ) {
        throw new BadRequestException("A team needs at least one owner");
      }
      await this.database.run(
        "UPDATE team_members SET role = ? WHERE team_id = ? AND user_id = ?",
        input.role,
        teamId,
        memberId
      );
    });
    await this.audit.record({
      teamId,
      userId: actorId,
      action: "team.member_role_updated",
      subjectType: "user",
      subjectId: memberId,
      metadata: { role: input.role },
    });
  }

  async removeMember(actorId: string, teamId: string, memberId: string): Promise<void> {
    await this.database.transaction(async () => {
      await this.lockTeam(teamId);
      const actor = await this.access.require(
        actorId,
        teamId,
        actorId === memberId ? "viewer" : "admin"
      );
      const member = await this.database.get<{ role: TeamRole }>(
        "SELECT role FROM team_members WHERE team_id = ? AND user_id = ?",
        teamId,
        memberId
      );
      if (!member) throw new NotFoundException("Member not found");
      if (member.role === "owner" && (await this.ownerCount(teamId)) === 1) {
        throw new BadRequestException("A team needs at least one owner");
      }
      if (member.role === "owner" && actor.role !== "owner") {
        throw new ForbiddenException("Only owners can remove owners");
      }
      await this.database.run(
        "DELETE FROM team_members WHERE team_id = ? AND user_id = ?",
        teamId,
        memberId
      );
    });
    await this.audit.record({
      teamId,
      userId: actorId,
      action: "team.member_removed",
      subjectType: "user",
      subjectId: memberId,
    });
  }

  private async getSummary(userId: string, teamId: string): Promise<TeamSummary> {
    const row = await this.database.get<TeamRow>(
      `SELECT t.id, t.name, m.role, logo.updated_at AS logo_updated_at, t.created_at
       FROM teams t JOIN team_members m ON m.team_id = t.id
       LEFT JOIN team_logos logo ON logo.team_id = t.id
       WHERE t.id = ? AND m.user_id = ?`,
      teamId,
      userId
    );
    if (!row) throw new NotFoundException("Team not found");
    return this.mapTeam(row);
  }

  private mapTeam(team: TeamRow): TeamSummary {
    return {
      id: team.id,
      name: team.name,
      role: team.role,
      logoUpdatedAt: team.logo_updated_at,
      createdAt: team.created_at,
    };
  }

  private async ownerCount(teamId: string): Promise<number> {
    return (await this.database.get<{ count: number }>(
      "SELECT COUNT(*) AS count FROM team_members WHERE team_id = ? AND role = 'owner'",
      teamId
    ))!.count;
  }

  private async lockTeam(teamId: string): Promise<void> {
    const team = await this.database.get("SELECT id FROM teams WHERE id = ? FOR UPDATE", teamId);
    if (!team) throw new NotFoundException("Team not found");
  }
}
