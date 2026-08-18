import { createHash } from "node:crypto";
import {
  appendFileSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const version = JSON.parse(
  readFileSync(join(repoRoot, "apps/client/package.json"), "utf8")
).version;
const bundleDirectory = join(repoRoot, "apps/client/src-tauri/target/release/bundle/deb");
const applicationExecutable = join(repoRoot, "apps/client/src-tauri/target/release/Mimorii");
const debFiles = findFiles(bundleDirectory, (name) => name.toLowerCase().endsWith(".deb"));

if (debFiles.length !== 1) {
  throw new Error(
    `Expected one Debian installer in ${bundleDirectory}, found ${debFiles.length} files`
  );
}

verifyX64Executable(applicationExecutable);

const artifactDirectory = resolve(
  process.env.MIMORII_ARTIFACT_DIR?.trim() || join(repoRoot, "dist/clients/ubuntu")
);
const artifactName = `mimorii-v${version}-ubuntu-x64.deb`;
const artifactPath = join(artifactDirectory, artifactName);
const checksumPath = join(artifactDirectory, `${artifactName}.sha256`);

mkdirSync(artifactDirectory, { recursive: true });
copyFileSync(debFiles[0], artifactPath);
writeFileSync(checksumPath, `${checksum(artifactPath)}  ${artifactName}\n`);
writeOutputs({ artifact_path: artifactPath, checksum_path: checksumPath });

console.log(`Created ${artifactPath}`);

function findFiles(directory, predicate) {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return findFiles(path, predicate);
    return predicate(entry.name) ? [path] : [];
  });
}

function checksum(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function verifyX64Executable(path) {
  if (!existsSync(path)) throw new Error(`Ubuntu application executable was not found: ${path}`);
  const executable = readFileSync(path);
  const isX64Elf =
    executable.length >= 20 &&
    executable[0] === 0x7f &&
    executable.toString("ascii", 1, 4) === "ELF" &&
    executable[4] === 2 &&
    executable[5] === 1 &&
    executable.readUInt16LE(18) === 0x3e;
  if (!isX64Elf) throw new Error(`Ubuntu application executable is not an x64 ELF file: ${path}`);
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
