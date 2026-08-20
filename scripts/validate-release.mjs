import { execFileSync, spawnSync } from "node:child_process";
import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  releaseAssetNames,
  releaseChecksum,
  releasePackageNames,
  releasePackages,
} from "./release-assets.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const rootPackage = readJson("package.json");
const clientPackage = readJson("apps/client/package.json");
const tauriConfig = readJson("apps/client/src-tauri/tauri.conf.json");
const androidAgentConfig = readJson("apps/client/src-tauri/tauri.android-agent.conf.json");
const openApi = readJson("apps/api/openapi/mimorii.openapi.json");
const clientCargo = readFile("apps/client/src-tauri/Cargo.toml");
const agentCargo = readFile("apps/agent-desktop/Cargo.toml");
const mobileAgentCargo = readFile("apps/agent-mobile/Cargo.toml");
const pushCargo = readFile("apps/client/src-tauri/plugins/push/Cargo.toml");
const tauriEntryPoint = readFile("apps/client/src-tauri/src/lib.rs");
const defaultCapability = readJson("apps/client/src-tauri/capabilities/default.json");
const androidBuild = readFile("scripts/build-android-app.mjs");
const androidProjectConfiguration = readFile("scripts/configure-android-project.mjs");
const releaseWorkflow = readFile(".github/workflows/release.yml");
const distributionDocumentation = readFile("docs/release-distribution.md");
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
expectEqual(tauriConfig.bundle?.android?.minSdkVersion, 24, "Android minimum SDK");
expectEqual(androidAgentConfig.productName, "Mimorii Agent", "Android agent product name");
expectEqual(
  androidAgentConfig.identifier,
  "app.mimorii.agent",
  "Android agent application identifier"
);
expectArrayEqual(
  tauriConfig.app?.security?.capabilities,
  ["default"],
  "Android client capabilities"
);
expectArrayEqual(
  defaultCapability.permissions,
  ["core:default", "push:default"],
  "Android client permissions"
);
const androidAgentCapability = androidAgentConfig.app?.security?.capabilities?.[0];
expectEqual(
  androidAgentConfig.app?.security?.capabilities?.length,
  1,
  "Android agent capability count"
);
expectEqual(
  androidAgentCapability?.identifier,
  "android-agent",
  "Android agent capability identifier"
);
expectArrayEqual(
  androidAgentCapability.permissions,
  ["core:default", "agent-mobile:default", "push:default"],
  "Android agent permissions"
);

for (const target of ["aarch64", "armv7", "x86_64"]) {
  if (!androidBuild.includes(`"${target}"`)) {
    throw new Error(`Android release command is missing the ${target} target`);
  }
}
if (androidBuild.includes('"i686"')) {
  throw new Error("Android release command must not include the redundant i686 target");
}
if (!androidBuild.includes('"--features"') || !androidBuild.includes('"mobile-agent"')) {
  throw new Error("Android agent build must enable the mobile-agent Cargo feature");
}
if (!androidBuild.includes("VITE_MIMORII_ANDROID_PRODUCT: product")) {
  throw new Error("Android builds must identify the selected product to the web client");
}
for (const [fragment, label] of [
  ['.replace(/namespace = "[^"]+"/', "Gradle namespace"],
  ["configureJavaPackage(", "Java package"],
  ["`package ${product.applicationId}", "main activity package"],
]) {
  if (!androidProjectConfiguration.includes(fragment)) {
    throw new Error(`Android project configuration must switch the ${label}`);
  }
}

for (const [label, command, expected] of [
  [
    "Android initialization",
    rootPackage.scripts?.["tauri:android:init"] ?? "",
    "node scripts/configure-android-project.mjs client",
  ],
  [
    "Android client build",
    rootPackage.scripts?.["tauri:android:client:build"] ?? "",
    "node scripts/build-android-app.mjs client",
  ],
  [
    "Android client signing",
    rootPackage.scripts?.["tauri:android:client:sign"] ?? "",
    "node scripts/sign-android-apk.mjs client",
  ],
  [
    "Android agent build",
    rootPackage.scripts?.["tauri:android:agent:build"] ?? "",
    "node scripts/build-android-app.mjs agent",
  ],
  [
    "Android agent signing",
    rootPackage.scripts?.["tauri:android:agent:sign"] ?? "",
    "node scripts/sign-android-apk.mjs agent",
  ],
]) {
  if (!command.includes(expected)) {
    throw new Error(`${label} must run ${expected}`);
  }
}

for (const scriptName of Object.keys(rootPackage.scripts ?? {})) {
  if (/^tauri:(?:ubuntu|windows)(?::|$)/.test(scriptName)) {
    throw new Error(`Obsolete desktop client release script remains: ${scriptName}`);
  }
}
for (const relativePath of [
  "scripts/build-ubuntu-client.mjs",
  "scripts/build-windows-client.mjs",
  "scripts/stage-ubuntu-installer.mjs",
  "scripts/stage-windows-installers.mjs",
  "apps/client/src-tauri/tauri.windows.conf.json",
]) {
  if (existsSync(join(repoRoot, relativePath))) {
    throw new Error(`Obsolete desktop client release path remains: ${relativePath}`);
  }
}

if (
  !clientCargo.includes(
    'tauri-plugin-agent-mobile = { path = "../../agent-mobile", optional = true }'
  ) ||
  !clientCargo.includes('mobile-agent = ["dep:tauri-plugin-agent-mobile"]')
) {
  throw new Error("The Android mobile collector must be an agent-only Cargo feature");
}
if (
  !tauriEntryPoint.includes('#[cfg(feature = "mobile-agent")]') ||
  !tauriEntryPoint.includes("builder.plugin(tauri_plugin_agent_mobile::init())")
) {
  throw new Error("Only the Android agent may initialize the mobile collector plugin");
}

if (new Set(releaseAssetNames).size !== releaseAssetNames.length) {
  throw new Error("Release asset filenames must be unique");
}
for (const name of releaseAssetNames) {
  if (/v?\d+\.\d+\.\d+/i.test(name)) {
    throw new Error(`Release asset filename must be versionless: ${name}`);
  }
}
if (releasePackages.androidAgent === releasePackages.androidClient) {
  throw new Error("Android agent and client filenames must be distinct");
}
if (!releasePackages.linuxAgent.includes("ubuntu-debian")) {
  throw new Error("Linux agent filename must identify Ubuntu and Debian support");
}
if (!releasePackageNames.every((name) => name.startsWith("mimorii-"))) {
  throw new Error("Every release package must identify the Mimorii product");
}
if (!releaseChecksum.includes("sha256")) {
  throw new Error("The release checksum manifest must identify its digest algorithm");
}
for (const command of ["name linuxAgent", "name windowsAgent", "prepare release-assets"]) {
  if (!releaseWorkflow.includes(`release-assets.mjs ${command}`)) {
    throw new Error(`Release workflow must run release-assets.mjs ${command}`);
  }
}
if (!releaseWorkflow.includes('gh release delete-asset "$RELEASE_TAG"')) {
  throw new Error("Release updates must remove obsolete GitHub assets");
}
for (const requirement of [
  "musl-tools",
  "--target x86_64-unknown-linux-musl",
  "target/x86_64-unknown-linux-musl/release/mimorii-agent-desktop",
]) {
  if (!releaseWorkflow.includes(requirement)) {
    throw new Error(`Ubuntu/Debian agent build is missing ${requirement}`);
  }
}
for (const obsolete of [
  ".msi",
  "-setup.exe",
  "ubuntu_client_artifacts",
  "windows_client_artifacts",
]) {
  if (releaseWorkflow.includes(obsolete)) {
    throw new Error(`Release workflow still references an obsolete client asset: ${obsolete}`);
  }
}
const latestReleaseBase = "https://github.com/pureportal/mimorii/releases/latest/download";
for (const name of releaseAssetNames) {
  if (!distributionDocumentation.includes(`${latestReleaseBase}/${name}`)) {
    throw new Error(`Release documentation is missing the stable download URL for ${name}`);
  }
}

const trackedAndroidFiles = git(["ls-files", "--", "apps/client/src-tauri/gen/android"]);
if (trackedAndroidFiles) {
  throw new Error("Generated Android files must not be tracked by Git");
}
if (!readFile(".gitignore").split(/\r?\n/).includes("apps/client/src-tauri/gen/")) {
  throw new Error(".gitignore must exclude the generated Tauri mobile project");
}

const baseSha = argumentValue("--base");
const headSha = git(["rev-parse", "HEAD"]);
const tag = `v${version}`;
const tagCommit = optionalGit(["rev-parse", "--verify", `refs/tags/${tag}^{commit}`]);
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
  release = comparison > 0 || tagCommit === null;
}

if (release) {
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
} else if (release && version === previousVersion) {
  console.log(`Release v${version} remains untagged; publishing will be retried`);
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

function expectArrayEqual(actual, expected, label) {
  if (!Array.isArray(actual) || JSON.stringify(actual) !== JSON.stringify(expected)) {
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
