import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const manifest = resolve(root, "apps/agent-desktop/Cargo.toml");
const uiManifest = resolve(root, "apps/agent-desktop-ui/Cargo.toml");
const project = resolve(root, "apps/agent-desktop/installer/windows/MimoriiAgent.wixproj");

function run(program, commandArguments) {
  const result = spawnSync(program, commandArguments, {
    cwd: root,
    stdio: "inherit",
    shell: false,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${program} exited with status ${result.status}`);
}

function option(name) {
  const index = process.argv.indexOf(name);
  if (index === -1) return undefined;
  const value = process.argv[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${name} requires a value`);
  return value;
}

function packageVersion() {
  const match = readFileSync(manifest, "utf8").match(/^version\s*=\s*"([^"]+)"/m);
  if (!match) throw new Error("The agent package version could not be read");
  return match[1];
}

function productCode(version) {
  const bytes = createHash("sha256")
    .update(`mimorii-agent-windows-x64\0${version}`)
    .digest()
    .subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x80;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const value = bytes.toString("hex").toUpperCase();
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`;
}

function installerVersion(value) {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(value);
  if (!match) throw new Error("The Windows installer version must use major.minor.build");
  const [, major, minor, build] = match.map(Number);
  if (major > 255 || minor > 255 || build > 65_535)
    throw new Error("The Windows installer version exceeds Windows Installer limits");
  return value;
}

function main() {
  if (process.platform !== "win32")
    throw new Error("The Windows installer must be built on Windows");
  const version = installerVersion(option("--version") ?? packageVersion());
  const executable = resolve(
    option("--agent-executable") ??
      resolve(root, "apps/agent-desktop/target/release/mimorii-agent-desktop.exe")
  );
  const uiExecutable = resolve(
    option("--agent-ui-executable") ??
      resolve(root, "apps/agent-desktop-ui/target/release/mimorii-agent-desktop-ui.exe")
  );
  const output = resolve(option("--output") ?? resolve(root, "dist/release/windows-installer"));

  if (!process.argv.includes("--skip-agent-build")) {
    run("cargo", ["build", "--locked", "--release", "--manifest-path", manifest]);
    run("cargo", ["build", "--locked", "--release", "--manifest-path", uiManifest]);
  }
  if (!existsSync(executable)) throw new Error(`Agent executable does not exist: ${executable}`);
  if (!existsSync(uiExecutable)) {
    throw new Error(`Agent UI executable does not exist: ${uiExecutable}`);
  }

  run("dotnet", [
    "build",
    project,
    "--configuration",
    "Release",
    "--no-incremental",
    "--output",
    output,
    `-p:ProductVersion=${version}`,
    `-p:ProductCode=${productCode(version)}`,
    `-p:AgentExecutable=${executable}`,
    `-p:AgentUiExecutable=${uiExecutable}`,
  ]);
  const installer = resolve(output, "mimorii-agent-windows-x64.msi");
  if (!existsSync(installer)) throw new Error(`Installer was not produced: ${installer}`);
  console.log(installer);
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
