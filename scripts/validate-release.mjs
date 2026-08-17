import { execFileSync, spawnSync } from "node:child_process";
import { appendFileSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const rootPackage = readJson("package.json");
const clientPackage = readJson("apps/client/package.json");
const tauriConfig = readJson("apps/client/src-tauri/tauri.conf.json");
const windowsConfig = readJson("apps/client/src-tauri/tauri.windows.conf.json");
const openApi = readJson("apps/api/openapi/mimorii.openapi.json");
const clientCargo = readFile("apps/client/src-tauri/Cargo.toml");
const agentCargo = readFile("apps/agent-desktop/Cargo.toml");
const mobileAgentCargo = readFile("apps/agent-mobile/Cargo.toml");
const pushCargo = readFile("apps/client/src-tauri/plugins/push/Cargo.toml");
const tauriEntryPoint = readFile("apps/client/src-tauri/src/lib.rs");
const defaultCapability = readJson("apps/client/src-tauri/capabilities/default.json");
const versions = new Map([
  ["package.json", rootPackage.version],
  ["apps/api/package.json", readJson("apps/api/package.json").version],
  ["apps/client/package.json", clientPackage.version],
  ["packages/contracts/package.json", readJson("packages/contracts/package.json").version],
  ["apps/agent-desktop/Cargo.toml", cargoPackageValue(agentCargo, "version")],
  ["apps/agent-mobile/Cargo.toml", cargoPackageValue(mobileAgentCargo, "version")],
  ["apps/client/src-tauri/Cargo.toml", cargoPackageValue(clientCargo, "version")],
  ["apps/client/src-tauri/plugins/push/Cargo.toml", cargoPackageValue(pushCargo, "version")],
  ["apps/client/src-tauri/tauri.conf.json", tauriConfig.version],
  ["apps/api/openapi/mimorii.openapi.json", openApi.info?.version],
]);
const versionValues = new Set(versions.values());

if (versionValues.size !== 1) {
  throw new Error(
    `Release versions must match:\n${[...versions].map(([path, version]) => `- ${path}: ${version}`).join("\n")}`
  );
}

const version = rootPackage.version;
const parsedVersion = parseSemver(version);
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
if (androidBuildCommand.split(/\s+/).includes("i686")) {
  throw new Error("Android release command must not include the redundant i686 target");
}

for (const [label, command] of [
  ["Android initialization", rootPackage.scripts?.["tauri:android:init"] ?? ""],
  ["Android build", rootPackage.scripts?.["tauri:android:build"] ?? ""],
]) {
  if (!command.includes("node scripts/configure-android-project.mjs")) {
    throw new Error(`${label} must configure the generated Android project`);
  }
}

if (!clientCargo.includes('tauri-plugin-agent-mobile = { path = "../../agent-mobile" }')) {
  throw new Error("Tauri client must include the Android mobile collector plugin");
}
if (!tauriEntryPoint.includes(".plugin(tauri_plugin_agent_mobile::init())")) {
  throw new Error("Tauri client must initialize the Android mobile collector plugin");
}
if (!defaultCapability.permissions?.includes("agent-mobile:default")) {
  throw new Error("Tauri client must grant the mobile collector permission set");
}

const trackedAndroidFiles = git(["ls-files", "--", "apps/client/src-tauri/gen/android"]);
if (trackedAndroidFiles) {
  throw new Error("Generated Android files must not be tracked by Git");
}
if (!readFile(".gitignore").split(/\r?\n/).includes("apps/client/src-tauri/gen/")) {
  throw new Error(".gitignore must exclude the generated Tauri mobile project");
}

const baseSha = argumentValue("--base");
let release = false;
let previousVersion = null;

if (baseSha && !/^0{40}$/.test(baseSha)) {
  if (!/^[0-9a-f]{40}$/i.test(baseSha)) {
    throw new Error(`Release base must be a full commit SHA: ${baseSha}`);
  }
  previousVersion = JSON.parse(git(["show", `${baseSha}:package.json`])).version;
  const comparison = compareSemver(parsedVersion, parseSemver(previousVersion));
  if (version !== previousVersion && comparison <= 0) {
    throw new Error(`Project version must increase from ${previousVersion}; received ${version}`);
  }
  release = comparison > 0;
}

const headSha = git(["rev-parse", "HEAD"]);
const tag = `v${version}`;
if (release) {
  const tagCommit = optionalGit(["rev-parse", "--verify", `refs/tags/${tag}^{commit}`]);
  if (tagCommit && tagCommit !== headSha) {
    throw new Error(`Tag ${tag} already points to ${tagCommit}, not ${headSha}`);
  }
}

writeOutputs({
  prerelease: String(parsedVersion.prerelease.length > 0),
  release: String(release),
  sha: headSha,
  tag,
  version,
});

if (previousVersion === null) {
  console.log(`Release configuration is valid for v${version}`);
} else if (release) {
  console.log(`Release v${version} detected from v${previousVersion}`);
} else {
  console.log(`Project version remains v${version}; publishing is skipped`);
}

function argumentValue(name) {
  const index = process.argv.indexOf(name);
  if (index === -1) return null;
  const value = process.argv[index + 1]?.trim();
  if (!value) throw new Error(`${name} requires a value`);
  return value;
}

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
  const value = packageSection.match(new RegExp(`^${name}\\s*=\\s*"([^"]+)"`, "m"))?.[1];
  if (!value) throw new Error(`Cargo package field is missing: ${name}`);
  return value;
}

function parseSemver(value) {
  if (typeof value !== "string") throw new Error(`Release version must be a string: ${value}`);
  if (value.includes("+")) {
    throw new Error("Release versions cannot contain build metadata because they are image tags");
  }
  const match = value.match(
    /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/
  );
  if (!match) throw new Error(`Release version is not valid semantic versioning: ${value}`);
  const prerelease = match[4]?.split(".") ?? [];
  for (const identifier of prerelease) {
    if (/^\d+$/.test(identifier) && identifier.length > 1 && identifier.startsWith("0")) {
      throw new Error(`Numeric prerelease identifiers cannot contain leading zeroes: ${value}`);
    }
  }
  return {
    major: BigInt(match[1]),
    minor: BigInt(match[2]),
    patch: BigInt(match[3]),
    prerelease,
  };
}

function compareSemver(left, right) {
  for (const field of ["major", "minor", "patch"]) {
    if (left[field] > right[field]) return 1;
    if (left[field] < right[field]) return -1;
  }
  if (left.prerelease.length === 0 && right.prerelease.length > 0) return 1;
  if (left.prerelease.length > 0 && right.prerelease.length === 0) return -1;
  const length = Math.max(left.prerelease.length, right.prerelease.length);
  for (let index = 0; index < length; index += 1) {
    const leftIdentifier = left.prerelease[index];
    const rightIdentifier = right.prerelease[index];
    if (leftIdentifier === undefined) return -1;
    if (rightIdentifier === undefined) return 1;
    if (leftIdentifier === rightIdentifier) continue;
    const leftNumeric = /^\d+$/.test(leftIdentifier);
    const rightNumeric = /^\d+$/.test(rightIdentifier);
    if (leftNumeric && rightNumeric) {
      return BigInt(leftIdentifier) > BigInt(rightIdentifier) ? 1 : -1;
    }
    if (leftNumeric !== rightNumeric) return leftNumeric ? -1 : 1;
    return leftIdentifier > rightIdentifier ? 1 : -1;
  }
  return 0;
}

function git(args) {
  return execFileSync("git", args, { cwd: repoRoot, encoding: "utf8" }).trim();
}

function optionalGit(args) {
  const result = spawnSync("git", args, { cwd: repoRoot, encoding: "utf8" });
  if (result.error) throw result.error;
  if (result.status === 0) return result.stdout.trim();
  if (result.status === 128) return null;
  throw new Error(result.stderr.trim() || `git exited with status ${result.status}`);
}

function expectEqual(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(
      `${label} must be ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}`
    );
  }
}

function writeOutputs(outputs) {
  const githubOutput = process.env.GITHUB_OUTPUT?.trim();
  if (!githubOutput) return;
  appendFileSync(
    githubOutput,
    Object.entries(outputs)
      .map(([name, value]) => `${name}=${value}`)
      .join("\n") + "\n"
  );
}
