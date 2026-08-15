import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const manifestPath = join(
  repoRoot,
  "apps/client/src-tauri/gen/android/app/src/main/AndroidManifest.xml"
);
const manifest = readFileSync(manifestPath, "utf8");
const configuredManifest = manifest
  .replace(
    /\s*<!-- AndroidTV support -->\s*<uses-feature android:name="android\.software\.leanback" android:required="false" \/>/,
    ""
  )
  .replace(
    /\s*<!-- AndroidTV support -->\s*<category android:name="android\.intent\.category\.LEANBACK_LAUNCHER" \/>/,
    ""
  );

if (/leanback/i.test(configuredManifest)) {
  throw new Error("Generated Android manifest still declares Leanback TV support");
}

if (configuredManifest !== manifest) {
  writeFileSync(manifestPath, configuredManifest);
}

console.log("Android project configured for phone and tablet distribution");
