import { execFileSync, spawnSync } from "node:child_process";
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
} from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { releasePackages } from "./release-assets.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const products = Object.freeze({
  client: {
    applicationId: "app.mimorii.monitor",
    artifactName: releasePackages.androidClient,
  },
  agent: {
    applicationId: "app.mimorii.agent",
    artifactName: releasePackages.androidAgent,
  },
});
const productKey = process.argv[2];
const product = products[productKey];
if (!product) throw new Error("Android product must be client or agent");
const version = JSON.parse(
  readFileSync(join(repoRoot, "apps/client/package.json"), "utf8")
).version;
const androidHome = requiredEnvironmentValue("ANDROID_HOME");
const buildToolsVersion = requiredEnvironmentValue("ANDROID_BUILD_TOOLS_VERSION");
const signingStoreFile = resolve(requiredEnvironmentValue("ANDROID_SIGNING_STORE_FILE"));
requiredEnvironmentValue("ANDROID_SIGNING_STORE_PASSWORD");
const signingKeyAlias = requiredEnvironmentValue("ANDROID_SIGNING_KEY_ALIAS");
requiredEnvironmentValue("ANDROID_SIGNING_KEY_PASSWORD");

if (!existsSync(signingStoreFile) || statSync(signingStoreFile).size === 0) {
  throw new Error(`Android signing store does not exist or is empty: ${signingStoreFile}`);
}

const buildToolsDirectory = join(androidHome, "build-tools", buildToolsVersion);
const zipalign = platformTool(buildToolsDirectory, "zipalign");
const apksigner = join(buildToolsDirectory, "lib", "apksigner.jar");
if (!existsSync(apksigner)) {
  throw new Error(`Required Android build tool was not found: ${apksigner}`);
}
const releaseDirectory = join(
  repoRoot,
  "apps/client/src-tauri/gen/android/app/build/outputs/apk/universal/release"
);
const unsignedApks = findFiles(releaseDirectory, (name) => name.endsWith("-release-unsigned.apk"));

if (unsignedApks.length !== 1) {
  throw new Error(
    `Expected one unsigned universal release APK in ${releaseDirectory}, found ${unsignedApks.length}`
  );
}

verifyBuildMetadata(unsignedApks[0]);

const artifactDirectory = resolve(
  process.env.MIMORII_ARTIFACT_DIR?.trim() || join(repoRoot, "dist/clients/android")
);
const artifactName = product.artifactName;
const artifactPath = join(artifactDirectory, artifactName);
const alignedPath = join(artifactDirectory, `.${artifactName}.aligned`);
const incrementalSignaturePath = `${artifactPath}.idsig`;

mkdirSync(artifactDirectory, { recursive: true });
rmSync(alignedPath, { force: true });
rmSync(artifactPath, { force: true });
rmSync(incrementalSignaturePath, { force: true });

try {
  run(zipalign, ["-P", "16", "-f", "4", unsignedApks[0], alignedPath]);
  run("java", [
    "-jar",
    apksigner,
    "sign",
    "--ks",
    signingStoreFile,
    "--ks-key-alias",
    signingKeyAlias,
    "--ks-pass",
    "env:ANDROID_SIGNING_STORE_PASSWORD",
    "--key-pass",
    "env:ANDROID_SIGNING_KEY_PASSWORD",
    "--v4-signing-enabled",
    "false",
    "--out",
    artifactPath,
    alignedPath,
  ]);
  run("java", ["-jar", apksigner, "verify", "--verbose", "--print-certs", artifactPath]);
  run(zipalign, ["-c", "-P", "16", "4", artifactPath]);
  verifyArchitectures(artifactPath);
  writeOutputs({ artifact_path: artifactPath });
  console.log(`Created ${artifactPath}`);
} finally {
  rmSync(alignedPath, { force: true });
}

function requiredEnvironmentValue(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function platformTool(directory, name) {
  const extension = process.platform === "win32" ? ".exe" : "";
  const path = join(directory, `${name}${extension}`);
  if (!existsSync(path)) throw new Error(`Required Android build tool was not found: ${path}`);
  return path;
}

function findFiles(directory, predicate) {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return findFiles(path, predicate);
    return predicate(entry.name) ? [path] : [];
  });
}

function run(command, args) {
  const result = spawnSync(command, args, {
    env: process.env,
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} exited with status ${result.status}`);
}

function verifyArchitectures(apkPath) {
  const entries = new Set(
    execFileSync("jar", ["tf", apkPath], { encoding: "utf8" }).split(/\r?\n/).filter(Boolean)
  );
  const expectedArchitectures = ["arm64-v8a", "armeabi-v7a", "x86_64"];
  const architectures = new Set(
    [...entries]
      .map((entry) => entry.match(/^lib\/([^/]+)\/[^/]+\.so$/)?.[1])
      .filter((architecture) => architecture !== undefined)
  );
  const expectedLibraries = [
    "lib/arm64-v8a/libmimorii_client_lib.so",
    "lib/armeabi-v7a/libmimorii_client_lib.so",
    "lib/x86_64/libmimorii_client_lib.so",
  ];
  const missingLibraries = expectedLibraries.filter((library) => !entries.has(library));
  if (missingLibraries.length > 0) {
    throw new Error(`Signed APK is missing native libraries: ${missingLibraries.join(", ")}`);
  }
  if (
    architectures.size !== expectedArchitectures.length ||
    expectedArchitectures.some((architecture) => !architectures.has(architecture))
  ) {
    throw new Error(
      `Signed APK contains unexpected native architectures: ${[...architectures].toSorted().join(", ")}`
    );
  }
}

function verifyBuildMetadata(apkPath) {
  const metadataPath = join(releaseDirectory, "output-metadata.json");
  if (!existsSync(metadataPath)) {
    throw new Error(`Android build metadata was not found: ${metadataPath}`);
  }

  const metadata = JSON.parse(readFileSync(metadataPath, "utf8"));
  const elements = Array.isArray(metadata.elements) ? metadata.elements : [];
  if (elements.length !== 1) {
    throw new Error(`Expected one universal Android build output, found ${elements.length}`);
  }

  const output = elements[0];
  if (metadata.applicationId !== product.applicationId) {
    throw new Error(`Unexpected Android application ID: ${metadata.applicationId}`);
  }
  if (output.versionName !== version) {
    throw new Error(
      `Android version ${output.versionName} does not match client version ${version}`
    );
  }
  if (!Number.isInteger(output.versionCode) || output.versionCode < 1) {
    throw new Error(`Android version code is invalid: ${output.versionCode}`);
  }
  if (output.outputFile !== basename(apkPath)) {
    throw new Error(
      `Android metadata output ${output.outputFile} does not match ${basename(apkPath)}`
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
