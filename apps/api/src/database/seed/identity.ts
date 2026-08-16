import { hashSecret } from "../../common/crypto.js";
import { applicationVersion } from "../../version.js";
import { termsVersion } from "@mimorii/contracts";
import { at, days, hours, minutes, seedId, seedSecret, type SeedContext } from "./context.js";

export interface SeedIdentityIds {
  adminUserId: string;
  memberUserId: string;
  viewerUserId: string;
  staleAgentId: string;
  offlineAgentId: string;
  newAgentId: string;
  revokedAgentId: string;
}

export async function seedIdentity(context: SeedContext): Promise<SeedIdentityIds> {
  const ids: SeedIdentityIds = {
    adminUserId: seedId(context, "user:admin"),
    memberUserId: seedId(context, "user:member"),
    viewerUserId: seedId(context, "user:viewer"),
    staleAgentId: seedId(context, "agent:stale"),
    offlineAgentId: seedId(context, "agent:offline"),
    newAgentId: seedId(context, "agent:new"),
    revokedAgentId: seedId(context, "agent:revoked"),
  };
  await seedMembers(context, ids);
  await seedInvitations(context);
  await seedAgents(context, ids);
  await seedApiTokens(context);
  return ids;
}

async function seedMembers(context: SeedContext, ids: SeedIdentityIds): Promise<void> {
  const people = [
    {
      id: ids.adminUserId,
      email: `admin+${context.teamSlug}@example.com`,
      name: "Mina Park",
      role: "admin",
    },
    {
      id: ids.memberUserId,
      email: `member+${context.teamSlug}@example.com`,
      name: "Leo Martins",
      role: "member",
    },
    {
      id: ids.viewerUserId,
      email: `viewer+${context.teamSlug}@example.com`,
      name: "Sam Rivera",
      role: "viewer",
    },
  ] as const;
  for (const [index, person] of people.entries()) {
    const createdAt = at(context, -days(120 - index * 10));
    await context.database.run(
      `INSERT INTO users
       (id, email, name, password_hash, terms_version, terms_accepted_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET email = excluded.email, name = excluded.name,
       password_hash = excluded.password_hash, updated_at = excluded.updated_at`,
      person.id,
      person.email,
      person.name,
      context.passwordHash,
      termsVersion,
      createdAt,
      createdAt,
      at(context, -days(2))
    );
    await context.database.run(
      `INSERT INTO team_members (team_id, user_id, role, joined_at) VALUES (?, ?, ?, ?)
       ON CONFLICT(team_id, user_id) DO UPDATE SET role = excluded.role`,
      context.teamId,
      person.id,
      person.role,
      at(context, -days(90 - index * 5))
    );
  }
}

async function seedInvitations(context: SeedContext): Promise<void> {
  const invites = [
    {
      key: "pending",
      email: `on-call+${context.teamSlug}@example.com`,
      role: "member",
      expiresAt: at(context, days(5)),
    },
    {
      key: "expired",
      email: `auditor+${context.teamSlug}@example.com`,
      role: "viewer",
      expiresAt: at(context, -days(2)),
    },
  ] as const;
  for (const invite of invites) {
    const id = seedId(context, `invite:${invite.key}`);
    await context.database.run(
      `INSERT INTO team_invites
       (id, team_id, email, role, token_hash, invited_by, expires_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET email = excluded.email, role = excluded.role,
       token_hash = excluded.token_hash, expires_at = excluded.expires_at`,
      id,
      context.teamId,
      invite.email,
      invite.role,
      hashSecret(seedSecret(context, "mim_invite", invite.key)),
      context.userId,
      invite.expiresAt,
      at(context, -days(7))
    );
  }
}

async function seedAgents(context: SeedContext, ids: SeedIdentityIds): Promise<void> {
  await context.database.run(
    `UPDATE agents SET kind = 'desktop', platform = ?, version = ?, capabilities_json = ?, last_seen_at = ?,
     revoked_at = NULL, updated_at = ? WHERE id = ? AND team_id = ?`,
    "Local development",
    applicationVersion,
    JSON.stringify(["http", "tcp", "dns", "host", "disk"]),
    context.now.toISOString(),
    context.now.toISOString(),
    context.agentId,
    context.teamId
  );
  const agents = [
    {
      id: ids.staleAgentId,
      key: "stale",
      name: "Branch relay",
      platform: "Linux 6.12",
      version: applicationVersion,
      capabilities: ["http", "tcp", "dns"],
      lastSeenAt: at(context, -minutes(3)),
      revokedAt: null,
    },
    {
      id: ids.offlineAgentId,
      key: "offline",
      name: "Warehouse relay",
      platform: "Windows Server 2025",
      version: applicationVersion,
      capabilities: ["http", "tcp", "dns", "host", "disk"],
      lastSeenAt: at(context, -hours(2)),
      revokedAt: null,
    },
    {
      id: ids.newAgentId,
      key: "new",
      name: "Unenrolled relay",
      platform: null,
      version: null,
      capabilities: ["http", "tcp", "dns", "host", "disk"],
      lastSeenAt: null,
      revokedAt: null,
    },
    {
      id: ids.revokedAgentId,
      key: "revoked",
      name: "Retired relay",
      platform: "Linux 6.6",
      version: applicationVersion,
      capabilities: ["host"],
      lastSeenAt: at(context, -days(30)),
      revokedAt: at(context, -days(20)),
    },
  ];
  for (const agent of agents) {
    await context.database.run(
      `INSERT INTO agents
       (id, team_id, name, key_hash, kind, platform, version, capabilities_json, last_seen_at,
        revoked_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET name = excluded.name, key_hash = excluded.key_hash,
       kind = excluded.kind, platform = excluded.platform, version = excluded.version,
       capabilities_json = excluded.capabilities_json, last_seen_at = excluded.last_seen_at,
       revoked_at = excluded.revoked_at, updated_at = excluded.updated_at`,
      agent.id,
      context.teamId,
      agent.name,
      hashSecret(seedSecret(context, "mim_agent", agent.key)),
      "desktop",
      agent.platform,
      agent.version,
      JSON.stringify(agent.capabilities),
      agent.lastSeenAt,
      agent.revokedAt,
      at(context, -days(60)),
      context.now.toISOString()
    );
  }
}

async function seedApiTokens(context: SeedContext): Promise<void> {
  const tokens = [
    {
      key: "active",
      name: "Local automation",
      expiresAt: at(context, days(90)),
      lastUsedAt: at(context, -hours(1)),
    },
    {
      key: "permanent",
      name: "Dashboard integration",
      expiresAt: null,
      lastUsedAt: null,
    },
    {
      key: "expired",
      name: "Expired deployment",
      expiresAt: at(context, -days(1)),
      lastUsedAt: at(context, -days(10)),
    },
  ];
  for (const [index, token] of tokens.entries()) {
    const value = seedSecret(context, "mim_pat", token.key);
    await context.database.run(
      `INSERT INTO api_tokens
       (id, user_id, name, token_prefix, token_hash, expires_at, last_used_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET name = excluded.name, token_prefix = excluded.token_prefix,
       token_hash = excluded.token_hash, expires_at = excluded.expires_at,
       last_used_at = excluded.last_used_at`,
      seedId(context, `api-token:${token.key}`),
      context.userId,
      token.name,
      value.slice(0, 16),
      hashSecret(value),
      token.expiresAt,
      token.lastUsedAt,
      at(context, -days(40 - index * 5))
    );
  }
}
