import { Migrator } from "@mikro-orm/migrations";
import { defineConfig, PostgreSqlDriver } from "@mikro-orm/postgresql";
import { config as loadDotEnv } from "dotenv";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { types as postgresTypes } from "pg";

loadDotEnv({
  path: resolve(dirname(fileURLToPath(import.meta.url)), "../../../.env"),
  quiet: true,
});

postgresTypes.setTypeParser(20, (value) => Number.parseInt(value, 10));
postgresTypes.setTypeParser(1700, (value) => Number.parseFloat(value));

function requiredEnvironment(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function requiredPort(): number {
  const value = Number.parseInt(requiredEnvironment("MIMORII_DB_PORT"), 10);
  if (!Number.isInteger(value) || value < 1 || value > 65_535) {
    throw new Error("MIMORII_DB_PORT must be a valid TCP port");
  }
  return value;
}

const databaseConfig = defineConfig({
  driver: PostgreSqlDriver,
  host: requiredEnvironment("MIMORII_DB_HOST"),
  port: requiredPort(),
  dbName: requiredEnvironment("MIMORII_DB_NAME"),
  user: requiredEnvironment("MIMORII_DB_USER"),
  password: requiredEnvironment("MIMORII_DB_PASSWORD"),
  entities: [],
  discovery: { warnWhenNoEntities: false },
  dynamicImportProvider: (modulePath) =>
    import(modulePath.startsWith("file:") ? modulePath : pathToFileURL(modulePath).href),
  extensions: [Migrator],
  allowGlobalContext: true,
  forceUtcTimezone: true,
  timezone: "Z",
  migrations: {
    path: "dist/database/migrations",
    pathTs: "src/database/migrations",
    glob: "!(*.d).{js,ts}",
  },
});

export default databaseConfig;
