import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const manifestPath = join(
  repoRoot,
  "apps/client/src-tauri/gen/android/app/src/main/AndroidManifest.xml"
);
const buildPath = join(repoRoot, "apps/client/src-tauri/gen/android/build.gradle.kts");
const appBuildPath = join(repoRoot, "apps/client/src-tauri/gen/android/app/build.gradle.kts");
const mainActivityPath = join(
  repoRoot,
  "apps/client/src-tauri/gen/android/app/src/main/java/app/mimorii/monitor/MainActivity.kt"
);
const resourcesPath = join(repoRoot, "apps/client/src-tauri/gen/android/app/src/main/res/xml");
const manifest = readFileSync(manifestPath, "utf8");
const build = readFileSync(buildPath, "utf8");
const appBuild = readFileSync(appBuildPath, "utf8");
const mainActivity = readFileSync(mainActivityPath, "utf8");
const configuredMainActivity = `package app.mimorii.monitor

import android.content.res.Configuration
import android.os.Bundle
import androidx.activity.enableEdgeToEdge

class MainActivity : TauriActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)
  }

  override fun onConfigurationChanged(newConfig: Configuration) {
    super.onConfigurationChanged(newConfig)
    enableEdgeToEdge()
  }
}
`;
let configuredManifest = manifest
  .replace(
    /\s*<!-- AndroidTV support -->\s*<uses-feature android:name="android\.software\.leanback" android:required="false" \/>/,
    ""
  )
  .replace(
    /\s*<!-- AndroidTV support -->\s*<category android:name="android\.intent\.category\.LEANBACK_LAUNCHER" \/>/,
    ""
  )
  .replace(/\s+android:enableOnBackInvokedCallback="[^"]*"/, "");
for (const [name, value] of [
  ["allowBackup", "false"],
  ["dataExtractionRules", "@xml/data_extraction_rules"],
  ["fullBackupContent", "@xml/backup_rules"],
]) {
  configuredManifest = setApplicationAttribute(configuredManifest, name, value);
}
const configuredBuild = build.replace(
  /classpath\("org\.jetbrains\.kotlin:kotlin-gradle-plugin:[^"]+"\)/,
  'classpath("org.jetbrains.kotlin:kotlin-gradle-plugin:2.1.20")'
);
const configuredAppBuild = appBuild.replace(
  /implementation\("androidx\.activity:activity-ktx:[^"]+"\)/,
  'implementation("androidx.activity:activity-ktx:1.12.4")'
);

if (/leanback/i.test(configuredManifest)) {
  throw new Error("Generated Android manifest still declares Leanback TV support");
}
if (!configuredBuild.includes("kotlin-gradle-plugin:2.1.20")) {
  throw new Error("Generated Android project does not use Kotlin 2.1.20");
}
if (!configuredAppBuild.includes("androidx.activity:activity-ktx:1.12.4")) {
  throw new Error("Generated Android project does not use AndroidX Activity 1.12.4");
}
if (
  !configuredMainActivity.includes("enableEdgeToEdge()") ||
  !configuredMainActivity.includes("onConfigurationChanged")
) {
  throw new Error("Generated Android activity does not maintain edge-to-edge layout");
}

function setApplicationAttribute(value, name, attributeValue) {
  const attribute = `android:${name}="${attributeValue}"`;
  const existing = new RegExp(`android:${name}="[^"]*"`);
  if (existing.test(value)) return value.replace(existing, attribute);
  const lineEnding = value.includes("\r\n") ? "\r\n" : "\n";
  return value.replace("<application", `<application${lineEnding}        ${attribute}`);
}

function writeIfChanged(path, value) {
  if (!existsSync(path) || readFileSync(path, "utf8") !== value) {
    writeFileSync(path, value);
  }
}

const backupRules = `<?xml version="1.0" encoding="utf-8"?>
<full-backup-content>
    <exclude domain="root" path="." />
    <exclude domain="file" path="." />
    <exclude domain="database" path="." />
    <exclude domain="sharedpref" path="." />
    <exclude domain="external" path="." />
    <exclude domain="device_root" path="." />
    <exclude domain="device_file" path="." />
    <exclude domain="device_database" path="." />
    <exclude domain="device_sharedpref" path="." />
</full-backup-content>
`;

const dataExtractionRules = `<?xml version="1.0" encoding="utf-8"?>
<data-extraction-rules>
    <cloud-backup>
        <exclude domain="root" path="." />
        <exclude domain="file" path="." />
        <exclude domain="database" path="." />
        <exclude domain="sharedpref" path="." />
        <exclude domain="external" path="." />
        <exclude domain="device_root" path="." />
        <exclude domain="device_file" path="." />
        <exclude domain="device_database" path="." />
        <exclude domain="device_sharedpref" path="." />
    </cloud-backup>
    <device-transfer>
        <exclude domain="root" path="." />
        <exclude domain="file" path="." />
        <exclude domain="database" path="." />
        <exclude domain="sharedpref" path="." />
        <exclude domain="external" path="." />
        <exclude domain="device_root" path="." />
        <exclude domain="device_file" path="." />
        <exclude domain="device_database" path="." />
        <exclude domain="device_sharedpref" path="." />
    </device-transfer>
</data-extraction-rules>
`;

if (configuredManifest !== manifest) {
  writeFileSync(manifestPath, configuredManifest);
}
if (configuredBuild !== build) {
  writeFileSync(buildPath, configuredBuild);
}
if (configuredAppBuild !== appBuild) {
  writeFileSync(appBuildPath, configuredAppBuild);
}
if (configuredMainActivity !== mainActivity) {
  writeFileSync(mainActivityPath, configuredMainActivity);
}
mkdirSync(resourcesPath, { recursive: true });
writeIfChanged(join(resourcesPath, "backup_rules.xml"), backupRules);
writeIfChanged(join(resourcesPath, "data_extraction_rules.xml"), dataExtractionRules);

console.log(
  "Android project configured for phone and tablet distribution, edge-to-edge, and private app data"
);
