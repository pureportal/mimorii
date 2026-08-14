import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { MikroORM } from "@mikro-orm/core";
import databaseConfig from "../mikro-orm.config.js";
import { DatabaseInitService } from "./database-init.service.js";
import { DatabaseService } from "./database.service.js";
import { developmentSeedConfiguration, seedAccount } from "./seed/account.js";
import { seedDevelopmentData } from "./seed/index.js";
const agentManifest = resolve(fileURLToPath(new URL("../../../agent/Cargo.toml", import.meta.url)));

async function main(): Promise<void> {
  const configuration = developmentSeedConfiguration();
  const orm = await MikroORM.init(databaseConfig);

  let enrollmentKey: string;
  try {
    const databaseInit = new DatabaseInitService(orm);
    await databaseInit.waitUntilReady();
    const database = new DatabaseService(orm);
    const result = await seedAccount(database, configuration);
    await seedDevelopmentData(database, result);
    enrollmentKey = result.enrollmentKey;
  } finally {
    await orm.close(true);
  }

  configureRelay(enrollmentKey);
}

function configureRelay(enrollmentKey: string): void {
  const server =
    process.env.MIMORII_PUBLIC_URL ?? `http://localhost:${process.env.MIMORII_API_PORT ?? 4310}`;
  execFileSync(
    "cargo",
    [
      "run",
      "--manifest-path",
      agentManifest,
      "--",
      "configure",
      "--server",
      server,
      "--key",
      enrollmentKey,
      "--allow-insecure-http",
    ],
    { stdio: "inherit" }
  );
}

await main();
