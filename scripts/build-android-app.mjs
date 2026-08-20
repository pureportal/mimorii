import { spawnSync } from "node:child_process";
import { rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const product = process.argv[2];
if (product !== "client" && product !== "agent") {
  throw new Error("Android product must be client or agent");
}

run(process.execPath, [join(repoRoot, "scripts/configure-android-project.mjs"), product]);
rmSync(
  join(repoRoot, "apps/client/src-tauri/gen/android/app/build/outputs/apk/universal/release"),
  { recursive: true, force: true }
);

const pnpmCli = process.env.npm_execpath?.trim();
if (!pnpmCli) throw new Error("The Android application build must run through pnpm");

const buildArguments = [
  pnpmCli,
  "--filter",
  "@mimorii/client",
  "exec",
  "tauri",
  "android",
  "build",
  "--apk",
  "--target",
  "aarch64",
  "armv7",
  "x86_64",
  "--ci",
];
if (product === "agent") {
  buildArguments.push(
    "--features",
    "mobile-agent",
    "--config",
    join(repoRoot, "apps/client/src-tauri/tauri.android-agent.conf.json")
  );
}

run(process.execPath, buildArguments, {
  ...process.env,
  VITE_MIMORII_ANDROID_PRODUCT: product,
});

function run(command, commandArguments, env = process.env) {
  const result = spawnSync(command, commandArguments, {
    cwd: repoRoot,
    env,
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} exited with status ${result.status}`);
}
