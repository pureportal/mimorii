import { execFileSync } from "node:child_process";
import { appendFileSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const rootPackage = readJson("package.json");
const clientPackage = readJson("apps/client/package.json");
const tauriConfig = readJson("apps/client/src-tauri/tauri.conf.json");
const windowsConfig = readJson("apps/client/src-tauri/tauri.windows.conf.json");
const cargoManifest = readFile("apps/client/src-tauri/Cargo.toml");
const tauriEntryPoint = readFile("apps/client/src-tauri/src/lib.rs");
const defaultCapability = readJson("apps/client/src-tauri/capabilities/default.json");
const cargoVersion = cargoPackageValue(cargoManifest, "version");
const versions = new Map([
  ["package.json", rootPackage.version],
  ["apps/client/package.json", clientPackage.version],
  ["apps/client/src-tauri/tauri.conf.json", tauriConfig.version],
  ["apps/client/src-tauri/Cargo.toml", cargoVersion],
]);
const versionValues = new Set(versions.values());

if (versionValues.size !== 1) {
  throw new Error(
    `Client versions must match:\n${[...versions].map(([path, version]) => `- ${path}: ${version}`).join("\n")}`
  );
}

const version = [...versionValues][0];
if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(version)) {
  throw new Error(`Client version is not valid semantic versioning: ${version}`);
}

expectEqual(tauriConfig.productName, "Mimorii", "Tauri product name");
expectEqual(tauriConfig.mainBinaryName, "Mimorii", "Tauri main binary name");
expectEqual(tauriConfig.identifier, "app.mimorii.monitor", "Tauri application identifier");
expectEqual(windowsConfig.identifier, tauriConfig.identifier, "Windows application identifier");
expectEqual(tauriConfig.bundle?.android?.minSdkVersion, 24, "Android minimum SDK");
expectEqual(
  windowsConfig.bundle?.windows?.wix?.upgradeCode,
  "9cf97636-ac39-526f-8bd9-82daef03c74a",
  "Windows MSI upgrade code"
);

const windowsTargets = windowsConfig.bundle?.targets;
if (
  !Array.isArray(windowsTargets) ||
  windowsTargets.length !== 2 ||
  !windowsTargets.includes("msi") ||
  !windowsTargets.includes("nsis")
) {
  throw new Error("Windows distribution must build exactly the MSI and NSIS bundle targets");
}

const androidBuildCommand = clientPackage.scripts?.["tauri:android:build"] ?? "";
for (const target of ["aarch64", "armv7", "x86_64"]) {
  if (!androidBuildCommand.split(/\s+/).includes(target)) {
    throw new Error(`Android release command is missing the ${target} target`);
  }
}

const androidInitializationCommand = rootPackage.scripts?.["tauri:android:init"] ?? "";
const rootAndroidBuildCommand = rootPackage.scripts?.["tauri:android:build"] ?? "";
for (const [label, command] of [
  ["Android initialization", androidInitializationCommand],
  ["Android build", rootAndroidBuildCommand],
]) {
  if (!command.includes("node scripts/configure-android-project.mjs")) {
    throw new Error(`${label} must configure the generated Android project`);
  }
}

if (!cargoManifest.includes('tauri-plugin-agent-mobile = { path = "../../agent-mobile" }')) {
  throw new Error("Tauri client must include the Android mobile collector plugin");
}
if (!tauriEntryPoint.includes(".plugin(tauri_plugin_agent_mobile::init())")) {
  throw new Error("Tauri client must initialize the Android mobile collector plugin");
}
if (!defaultCapability.permissions?.includes("agent-mobile:default")) {
  throw new Error("Tauri client must grant the mobile collector permission set");
}

const trackedAndroidFiles = execFileSync(
  "git",
  ["ls-files", "--", "apps/client/src-tauri/gen/android"],
  { cwd: repoRoot, encoding: "utf8" }
).trim();
if (trackedAndroidFiles) {
  throw new Error("Generated Android files must not be tracked by Git");
}

const gitignore = readFile(".gitignore");
if (!gitignore.split(/\r?\n/).includes("apps/client/src-tauri/gen/")) {
  throw new Error(".gitignore must exclude the generated Tauri mobile project");
}

const githubOutput = process.env.GITHUB_OUTPUT?.trim();
if (githubOutput) appendFileSync(githubOutput, `version=${version}\n`);
console.log(`Client distribution configuration is valid for v${version}`);

function readFile(relativePath) {
  return readFileSync(join(repoRoot, relativePath), "utf8");
}

function readJson(relativePath) {
  return JSON.parse(readFile(relativePath));
}

function cargoPackageValue(manifest, name) {
  const packageHeader = manifest.match(/^\[package\]\s*$/m);
  if (packageHeader?.index === undefined) throw new Error("Cargo package section is missing");
  const packageContent = manifest.slice(packageHeader.index + packageHeader[0].length);
  const nextSectionOffset = packageContent.search(/^\[/m);
  const packageSection = packageContent.slice(
    0,
    nextSectionOffset === -1 ? packageContent.length : nextSectionOffset
  );
  const value = packageSection?.match(new RegExp(`^${name}\\s*=\\s*"([^"]+)"`, "m"))?.[1];
  if (!value) throw new Error(`Cargo package field is missing: ${name}`);
  return value;
}

function expectEqual(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(
      `${label} must be ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}`
    );
  }
}
