import type { DatabaseService } from "../database.service.js";

export function assertSafeSeedCredentials(environment: NodeJS.ProcessEnv = process.env): void {
  if (environment.NODE_ENV !== "production") return;
  const email = environment.MIMORII_SEED_EMAIL?.trim();
  const password = environment.MIMORII_SEED_PASSWORD;
  if (!email || !password) {
    throw new Error("Production seeding requires MIMORII_SEED_EMAIL and MIMORII_SEED_PASSWORD");
  }
  if (
    password.length < 12 ||
    password.length > 128 ||
    !/[a-z]/.test(password) ||
    !/[A-Z]/.test(password) ||
    !/[0-9]/.test(password)
  ) {
    throw new Error("Production seed password does not meet the account password policy");
  }
}

export function globalAdminSeedEnabled(environment: NodeJS.ProcessEnv = process.env): boolean {
  const configured = environment.MIMORII_SEED_GLOBAL_ADMIN?.trim().toLowerCase();
  if (configured && configured !== "true" && configured !== "false") {
    throw new Error("MIMORII_SEED_GLOBAL_ADMIN must be true or false");
  }
  const enabled = configured ? configured === "true" : environment.NODE_ENV !== "production";
  if (enabled) assertSafeSeedCredentials(environment);
  return enabled;
}

export async function seedGlobalAdministrator(
  database: DatabaseService,
  userId: string,
  environment: NodeJS.ProcessEnv = process.env
): Promise<boolean> {
  if (!globalAdminSeedEnabled(environment)) return false;
  const result = await database.run(
    `UPDATE users SET is_global_admin = TRUE, disabled_at = NULL,
     token_version = token_version +
       CASE WHEN is_global_admin = FALSE OR disabled_at IS NOT NULL THEN 1 ELSE 0 END,
     updated_at = ? WHERE id = ?`,
    new Date().toISOString(),
    userId
  );
  if (result.changes === 0) throw new Error("Seed user is unavailable");
  return true;
}
