import { randomUUID } from "node:crypto";
import { agentCollectionInterval, termsVersion } from "@mimorii/contracts";
import { createSecret, hashPassword, hashSecret } from "../../common/crypto.js";
import type { DatabaseService } from "../database.service.js";
import { assertSafeSeedCredentials, seedGlobalAdministrator } from "./global-admin.js";

export const developmentSeedDefaults = {
  email: "t4ggno@example.com",
  name: "Mimorii Owner",
  password: "password",
  agentName: "Local relay",
  agentIntervalSeconds: 30,
} as const;

export interface DevelopmentSeedConfiguration {
  email: string;
  name: string;
  password: string;
  agentName: string;
  agentIntervalSeconds: number;
}

export interface SeedResult {
  enrollmentKey: string;
  userId: string;
  teamId: string;
  agentId: string;
  password: string;
}

interface SeedUser {
  id: string;
}

interface SeedTeam {
  id: string;
}

interface SeedAgent {
  id: string;
}

export function developmentSeedConfiguration(
  environment: NodeJS.ProcessEnv = process.env
): DevelopmentSeedConfiguration {
  assertSafeSeedCredentials(environment);
  const email = (environment.MIMORII_SEED_EMAIL ?? developmentSeedDefaults.email)
    .trim()
    .toLowerCase();
  const name = (environment.MIMORII_SEED_NAME ?? developmentSeedDefaults.name).trim();
  const password = environment.MIMORII_SEED_PASSWORD ?? developmentSeedDefaults.password;
  const agentName = (
    environment.MIMORII_SEED_AGENT_NAME ?? developmentSeedDefaults.agentName
  ).trim();
  const agentIntervalSeconds = Number(
    environment.MIMORII_AGENT_INTERVAL_SECONDS ?? developmentSeedDefaults.agentIntervalSeconds
  );
  if (!email || !name || !agentName) throw new Error("Seed configuration is incomplete");
  if (
    !Number.isInteger(agentIntervalSeconds) ||
    agentIntervalSeconds < agentCollectionInterval.minimumSeconds ||
    agentIntervalSeconds > agentCollectionInterval.maximumSeconds
  ) {
    throw new Error(
      `MIMORII_AGENT_INTERVAL_SECONDS must be between ${agentCollectionInterval.minimumSeconds} and ${agentCollectionInterval.maximumSeconds}`
    );
  }
  return { email, name, password, agentName, agentIntervalSeconds };
}

export async function seedAccount(
  database: DatabaseService,
  configuration: DevelopmentSeedConfiguration
): Promise<SeedResult> {
  let user = await database.get<SeedUser>(
    "SELECT id FROM users WHERE email = ?",
    configuration.email
  );
  let team: SeedTeam | undefined;
  if (!user) {
    user = await createUser(
      database,
      configuration.email,
      configuration.name,
      configuration.password
    );
    team = await database.get<SeedTeam>("SELECT id FROM teams WHERE created_by = ?", user.id);
  } else {
    await database.run(
      "UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?",
      await hashPassword(configuration.password),
      new Date().toISOString(),
      user.id
    );
    team = await database.get<SeedTeam>(
      "SELECT id FROM teams WHERE created_by = ? ORDER BY created_at LIMIT 1",
      user.id
    );
  }
  if (!team) throw new Error(`No team is available for seeded user ${configuration.email}`);
  await seedGlobalAdministrator(database, user.id);

  const existing = await database.get<SeedAgent>(
    "SELECT id FROM agents WHERE team_id = ? AND name = ? AND revoked_at IS NULL",
    team.id,
    configuration.agentName
  );
  const enrollmentKey = createSecret("mim_agent");
  const now = new Date().toISOString();
  let agentId: string;
  if (existing) {
    agentId = existing.id;
    await database.run(
      `UPDATE agents SET key_hash = ?, collection_interval_seconds = ?, updated_at = ?
       WHERE id = ? AND team_id = ?`,
      hashSecret(enrollmentKey),
      configuration.agentIntervalSeconds,
      now,
      existing.id,
      team.id
    );
    await recordAudit(database, {
      teamId: team.id,
      userId: user.id,
      action: "agent.key_rotated",
      subjectType: "agent",
      subjectId: existing.id,
    });
  } else {
    agentId = randomUUID();
    await database.run(
      `INSERT INTO agents
       (id, team_id, name, key_hash, collection_interval_seconds, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      agentId,
      team.id,
      configuration.agentName,
      hashSecret(enrollmentKey),
      configuration.agentIntervalSeconds,
      now,
      now
    );
    await recordAudit(database, {
      teamId: team.id,
      userId: user.id,
      action: "agent.created",
      subjectType: "agent",
      subjectId: agentId,
    });
  }
  return {
    enrollmentKey,
    userId: user.id,
    teamId: team.id,
    agentId,
    password: configuration.password,
  };
}

async function createUser(
  database: DatabaseService,
  email: string,
  name: string,
  password: string
): Promise<SeedUser> {
  const userId = randomUUID();
  const teamId = randomUUID();
  const now = new Date().toISOString();
  const passwordHash = await hashPassword(password);
  await database.transaction(async () => {
    await database.run(
      `INSERT INTO users
       (id, email, name, password_hash, terms_version, terms_accepted_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      userId,
      email,
      name,
      passwordHash,
      termsVersion,
      now,
      now,
      now
    );
    await database.run(
      `INSERT INTO teams (id, name, slug, created_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      teamId,
      `${name}'s team`,
      await seedSlug(database, name),
      userId,
      now,
      now
    );
    await database.run(
      "INSERT INTO team_members (team_id, user_id, role, joined_at) VALUES (?, ?, 'owner', ?)",
      teamId,
      userId,
      now
    );
  });
  await recordAudit(database, {
    teamId,
    userId,
    action: "account.registered",
    subjectType: "user",
    subjectId: userId,
  });
  return { id: userId };
}

async function seedSlug(database: DatabaseService, name: string): Promise<string> {
  const base =
    name
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 42) || "team";
  let candidate = base;
  let suffix = 2;
  while (await database.get("SELECT id FROM teams WHERE slug = ?", candidate)) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }
  return candidate;
}

async function recordAudit(
  database: DatabaseService,
  input: {
    teamId: string;
    userId: string;
    action: string;
    subjectType: string;
    subjectId: string;
  }
): Promise<void> {
  await database.run(
    `INSERT INTO audit_events
     (id, team_id, user_id, action, subject_type, subject_id, metadata_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    randomUUID(),
    input.teamId,
    input.userId,
    input.action,
    input.subjectType,
    input.subjectId,
    "{}",
    new Date().toISOString()
  );
}
