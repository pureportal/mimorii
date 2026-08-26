import { hashPassword } from "../../common/crypto.js";
import type { DatabaseService } from "../database.service.js";
import type { SeedContext } from "./context.js";
import { seedIdentity } from "./identity.js";
import { seedMonitoring } from "./monitoring.js";
import { seedNotifications } from "./notifications.js";
import { seedOperations } from "./operations.js";
import { seedPublishing } from "./publishing.js";
import { verifyDevelopmentSeed } from "./verification.js";

export async function seedDevelopmentData(
  database: DatabaseService,
  input: {
    userId: string;
    teamId: string;
    agentId: string;
    password: string;
  }
): Promise<void> {
  const team = await database.get<{ id: string }>(
    "SELECT id FROM teams WHERE id = ?",
    input.teamId
  );
  if (!team) throw new Error("Seed team is unavailable");
  const context: SeedContext = {
    database,
    userId: input.userId,
    teamId: input.teamId,
    teamKey: team.id,
    agentId: input.agentId,
    passwordHash: await hashPassword(input.password),
    now: new Date(),
  };
  await database.transaction(async () => {
    const identity = await seedIdentity(context);
    const monitoring = await seedMonitoring(context, identity);
    const operations = await seedOperations(context, identity, monitoring);
    const notifications = await seedNotifications(context);
    await seedPublishing(context, identity, monitoring, operations, notifications);
  });
  await verifyDevelopmentSeed(database, input);
}
