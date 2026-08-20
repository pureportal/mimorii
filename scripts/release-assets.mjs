import { createHash } from "node:crypto";
import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const releasePackages = Object.freeze({
  androidAgent: "mimorii-agent-android.apk",
  linuxAgent: "mimorii-agent-ubuntu-debian-x64.tar.gz",
  windowsAgent: "mimorii-agent-windows-x64.zip",
  androidClient: "mimorii-client-android.apk",
});

export const releaseChecksum = "mimorii-sha256-checksums.txt";

export const releasePackageNames = Object.freeze(
  Object.values(releasePackages).toSorted((left, right) => left.localeCompare(right))
);
export const releaseAssetNames = Object.freeze(
  [...releasePackageNames, releaseChecksum].toSorted((left, right) => left.localeCompare(right))
);

function actualEntries(directory) {
  return readdirSync(directory, { withFileTypes: true })
    .map((entry) => ({ name: entry.name, file: entry.isFile() }))
    .toSorted((left, right) => left.name.localeCompare(right.name));
}

function validate(directory, expectedNames) {
  const entries = actualEntries(directory);
  const actualNames = entries.map((entry) => entry.name);
  const allFiles = entries.every((entry) => entry.file);
  if (allFiles && JSON.stringify(actualNames) === JSON.stringify(expectedNames)) return;

  throw new Error(
    [
      "Release assets do not match the expected set.",
      ...expectedNames.map((name) => `Expected: ${name}`),
      ...entries.map((entry) => `Actual: ${entry.name}${entry.file ? "" : "/"}`),
    ].join("\n")
  );
}

function digest(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function writeChecksums(directory) {
  validate(directory, releasePackageNames);
  const content = releasePackageNames
    .map((name) => `${digest(join(directory, name))}  ${name}`)
    .join("\n");
  writeFileSync(join(directory, releaseChecksum), `${content}\n`);
}

function verifyChecksums(directory) {
  validate(directory, releaseAssetNames);
  const checksumPath = join(directory, releaseChecksum);
  const lines = readFileSync(checksumPath, "utf8").trimEnd().split(/\r?\n/);
  if (lines.length !== releasePackageNames.length) {
    throw new Error(`${releaseChecksum} must contain ${releasePackageNames.length} entries`);
  }

  for (const [index, name] of releasePackageNames.entries()) {
    const match = lines[index].match(/^([0-9a-f]{64})  (.+)$/);
    if (!match || match[2] !== name) {
      throw new Error(`${releaseChecksum} entry ${index + 1} must reference ${name}`);
    }
    const path = join(directory, name);
    if (!statSync(path).isFile() || digest(path) !== match[1]) {
      throw new Error(`SHA-256 verification failed for ${name}`);
    }
  }
}

function requiredDirectory(value) {
  if (!value?.trim()) throw new Error("A release asset directory is required");
  return resolve(value);
}

function main() {
  const [command, value] = process.argv.slice(2);
  if (command === "name") {
    const name = releasePackages[value];
    if (!name) throw new Error(`Unknown release package: ${value ?? ""}`);
    console.log(name);
    return;
  }

  const directory = requiredDirectory(value);
  if (command === "validate-packages") {
    validate(directory, releasePackageNames);
    return;
  }
  if (command === "validate-final") {
    validate(directory, releaseAssetNames);
    return;
  }
  if (command === "prepare") {
    writeChecksums(directory);
    verifyChecksums(directory);
    return;
  }
  if (command === "verify") {
    verifyChecksums(directory);
    return;
  }
  throw new Error(`Unknown release asset command: ${command ?? ""}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
