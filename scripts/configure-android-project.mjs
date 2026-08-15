import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const manifestPath = join(
  repoRoot,
  "apps/client/src-tauri/gen/android/app/src/main/AndroidManifest.xml"
);
const buildPath = join(repoRoot, "apps/client/src-tauri/gen/android/build.gradle.kts");
const manifest = readFileSync(manifestPath, "utf8");
const build = readFileSync(buildPath, "utf8");
const configuredManifest = manifest
  .replace(
    /\s*<!-- AndroidTV support -->\s*<uses-feature android:name="android\.software\.leanback" android:required="false" \/>/,
    ""
  )
  .replace(
    /\s*<!-- AndroidTV support -->\s*<category android:name="android\.intent\.category\.LEANBACK_LAUNCHER" \/>/,
    ""
  );
const configuredBuild = build.replace(
  'classpath("org.jetbrains.kotlin:kotlin-gradle-plugin:1.9.25")',
  'classpath("org.jetbrains.kotlin:kotlin-gradle-plugin:2.1.20")'
);

if (/leanback/i.test(configuredManifest)) {
  throw new Error("Generated Android manifest still declares Leanback TV support");
}
if (!configuredBuild.includes("kotlin-gradle-plugin:2.1.20")) {
  throw new Error("Generated Android project does not use Kotlin 2.1.20");
}

if (configuredManifest !== manifest) {
  writeFileSync(manifestPath, configuredManifest);
}
if (configuredBuild !== build) {
  writeFileSync(buildPath, configuredBuild);
}

console.log("Android project configured for phone and tablet distribution with Kotlin 2.1.20");
