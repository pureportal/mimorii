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
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const version = JSON.parse(
  readFileSync(join(repoRoot, "apps/client/package.json"), "utf8")
).version;
const bundleDirectory = join(repoRoot, "apps/client/src-tauri/target/release/bundle");
const applicationExecutable = join(repoRoot, "apps/client/src-tauri/target/release/Mimorii.exe");
const msiFiles = findFiles(bundleDirectory, (name) => name.toLowerCase().endsWith(".msi"));
const nsisFiles = findFiles(bundleDirectory, (name) => name.toLowerCase().endsWith("-setup.exe"));

if (msiFiles.length !== 1 || nsisFiles.length !== 1) {
  throw new Error(
    `Expected one MSI and one NSIS installer in ${bundleDirectory}, found ${msiFiles.length} MSI and ${nsisFiles.length} NSIS files`
  );
}

verifyX64Executable(applicationExecutable);

const artifactDirectory = resolve(
  process.env.MIMORII_ARTIFACT_DIR?.trim() || join(repoRoot, "dist/clients/windows")
);
const artifacts = [
  [msiFiles[0], join(artifactDirectory, `mimorii-v${version}-windows-x64.msi`)],
  [nsisFiles[0], join(artifactDirectory, `mimorii-v${version}-windows-x64-setup.exe`)],
];
const checksumPath = join(artifactDirectory, `mimorii-v${version}-windows-x64.sha256`);

mkdirSync(artifactDirectory, { recursive: true });
for (const [source, destination] of artifacts) copyFileSync(source, destination);
writeFileSync(
  checksumPath,
  artifacts
    .map(([, path]) => `${checksum(path)}  ${basename(path)}`)
    .toSorted()
    .join("\n") + "\n"
);
writeOutputs({
  artifact_paths: artifacts.map(([, path]) => path).join("\n"),
  checksum_path: checksumPath,
});

for (const [, path] of artifacts) console.log(`Created ${path}`);

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
  if (!existsSync(path)) throw new Error(`Windows application executable was not found: ${path}`);
  const executable = readFileSync(path);
  if (executable.length < 64) {
    throw new Error(`Windows application executable is not a valid PE file: ${path}`);
  }
  const peHeaderOffset = executable.readUInt32LE(0x3c);
  if (peHeaderOffset + 6 > executable.length) {
    throw new Error(`Windows application executable has an invalid PE header: ${path}`);
  }
  const signature = executable.toString("ascii", peHeaderOffset, peHeaderOffset + 4);
  const machine = executable.readUInt16LE(peHeaderOffset + 4);
  if (signature !== "PE\u0000\u0000" || machine !== 0x8664) {
    throw new Error(`Windows application executable is not an x64 PE file: ${path}`);
  }
}

function writeOutputs(outputs) {
  const githubOutput = process.env.GITHUB_OUTPUT?.trim();
  if (!githubOutput) return;
  for (const [name, value] of Object.entries(outputs)) {
    if (value.includes("\n")) {
      appendFileSync(githubOutput, `${name}<<MIMORII_EOF\n${value}\nMIMORII_EOF\n`);
    } else {
      appendFileSync(githubOutput, `${name}=${value}\n`);
    }
  }
}
