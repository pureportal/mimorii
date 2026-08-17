import { spawnSync } from "node:child_process";
import { rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
rmSync(join(repoRoot, "apps/client/src-tauri/target/release/bundle"), {
  recursive: true,
  force: true,
});
const args = [
  "--filter",
  "@mimorii/client",
  "exec",
  "tauri",
  "build",
  "--bundles",
  "nsis",
  "msi",
  "--ci",
];

const pnpmCli = process.env.npm_execpath?.trim();
if (!pnpmCli) throw new Error("The Windows client build must run through pnpm");

const result = spawnSync(process.execPath, [pnpmCli, ...args], {
  cwd: repoRoot,
  env: process.env,
  stdio: "inherit",
});

if (result.error) throw result.error;
if (result.status !== 0) throw new Error(`Windows Tauri build exited with status ${result.status}`);
