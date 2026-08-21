import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const products = Object.freeze({
  client: {
    applicationId: "app.mimorii.monitor",
    displayName: "Mimorii",
  },
  agent: {
    applicationId: "app.mimorii.agent",
    displayName: "Mimorii Agent",
  },
});
const productKey = process.argv[2];
const product = products[productKey];
if (!product) throw new Error("Android product must be client or agent");

const androidDirectory = join(repoRoot, "apps/client/src-tauri/gen/android");
const manifestPath = join(androidDirectory, "app/src/main/AndroidManifest.xml");
const buildPath = join(androidDirectory, "build.gradle.kts");
const appBuildPath = join(androidDirectory, "app/build.gradle.kts");
const stringsPath = join(androidDirectory, "app/src/main/res/values/strings.xml");
const javaPackageDirectory = configureJavaPackage(
  join(androidDirectory, "app/src/main/java"),
  product.applicationId
);
const mainActivityPath = join(javaPackageDirectory, "MainActivity.kt");
const resourcesPath = join(androidDirectory, "app/src/main/res/xml");
const manifest = readFileSync(manifestPath, "utf8");
const build = readFileSync(buildPath, "utf8");
const appBuild = readFileSync(appBuildPath, "utf8");
const strings = readFileSync(stringsPath, "utf8");
const configuredMainActivity = `package ${product.applicationId}

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
configuredManifest = configureForegroundServicePermission(configuredManifest, productKey);
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
const configuredAppBuild = appBuild
  .replace(/namespace = "[^"]+"/, `namespace = "${product.applicationId}"`)
  .replace(
    /implementation\("androidx\.activity:activity-ktx:[^"]+"\)/,
    'implementation("androidx.activity:activity-ktx:1.12.4")'
  )
  .replace(
    /isMinifyEnabled = true\r?\n(?!\s*isShrinkResources = true)/,
    "isMinifyEnabled = true\n            isShrinkResources = true\n"
  )
  .replace(/applicationId = "[^"]+"/, `applicationId = "${product.applicationId}"`);
const configuredStrings = strings
  .replace(
    /<string name="app_name">[\s\S]*?<\/string>/,
    `<string name="app_name">${product.displayName}</string>`
  )
  .replace(
    /<string name="main_activity_title">[\s\S]*?<\/string>/,
    `<string name="main_activity_title">${product.displayName}</string>`
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
if (!configuredAppBuild.includes("isShrinkResources = true")) {
  throw new Error("Generated Android release does not shrink unused resources");
}
if (!configuredAppBuild.includes(`applicationId = "${product.applicationId}"`)) {
  throw new Error(`Generated Android application ID is not ${product.applicationId}`);
}
if (!configuredAppBuild.includes(`namespace = "${product.applicationId}"`)) {
  throw new Error(`Generated Android namespace is not ${product.applicationId}`);
}
if (!configuredStrings.includes(`>${product.displayName}</string>`)) {
  throw new Error(`Generated Android application name is not ${product.displayName}`);
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

function configureForegroundServicePermission(value, selectedProduct) {
  let configured = value
    .replace(
      /\s*<uses-permission\s+android:name="android\.permission\.FOREGROUND_SERVICE"\s+tools:node="remove"\s*\/>/,
      ""
    )
    .replace(/\s+xmlns:tools="http:\/\/schemas\.android\.com\/tools"/, "");
  if (selectedProduct !== "agent") return configured;
  configured = configured.replace(
    '<manifest xmlns:android="http://schemas.android.com/apk/res/android">',
    '<manifest xmlns:android="http://schemas.android.com/apk/res/android"\n    xmlns:tools="http://schemas.android.com/tools">'
  );
  return configured.replace(
    '    <uses-permission android:name="android.permission.INTERNET" />',
    '    <uses-permission android:name="android.permission.INTERNET" />\n    <uses-permission android:name="android.permission.FOREGROUND_SERVICE" tools:node="remove" />'
  );
}

function configureJavaPackage(javaDirectory, applicationId) {
  const productDirectories = Object.values(products)
    .map(({ applicationId: candidate }) => join(javaDirectory, ...candidate.split(".")))
    .filter((directory) => existsSync(directory));
  if (productDirectories.length !== 1) {
    throw new Error(
      `Expected one generated Android package directory, found ${productDirectories.length}`
    );
  }

  const packageDirectory = join(javaDirectory, ...applicationId.split("."));
  const currentDirectory = productDirectories[0];
  if (currentDirectory !== packageDirectory) {
    mkdirSync(dirname(packageDirectory), { recursive: true });
    renameSync(currentDirectory, packageDirectory);
  }

  for (const path of kotlinFilesIn(packageDirectory)) {
    const source = readFileSync(path, "utf8");
    const configured = Object.values(products).reduce(
      (value, candidate) => value.replaceAll(candidate.applicationId, applicationId),
      source
    );
    writeIfChanged(path, configured);
  }
  return packageDirectory;
}

function kotlinFilesIn(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return kotlinFilesIn(path);
    return entry.isFile() && entry.name.endsWith(".kt") ? [path] : [];
  });
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

writeIfChanged(manifestPath, configuredManifest);
writeIfChanged(buildPath, configuredBuild);
writeIfChanged(appBuildPath, configuredAppBuild);
writeIfChanged(stringsPath, configuredStrings);
writeIfChanged(mainActivityPath, configuredMainActivity);
mkdirSync(resourcesPath, { recursive: true });
writeIfChanged(join(resourcesPath, "backup_rules.xml"), backupRules);
writeIfChanged(join(resourcesPath, "data_extraction_rules.xml"), dataExtractionRules);

console.log(`Android project configured for the Mimorii ${productKey} application`);
