import { spawnSync } from "node:child_process";
import { rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
rmSync(join(repoRoot, "apps/client/src-tauri/target/release/bundle"), {
  recursive: true,
  force: true,
});
const certificateThumbprint = process.env.WINDOWS_SIGNING_CERTIFICATE_THUMBPRINT?.trim();
const args = [
  "--filter",
  "@mimorii/client",
  "exec",
  "tauri",
  "build",
  "--bundles",
  "nsis",
  "msi",
  "--ci",
];

if (certificateThumbprint) {
  if (!/^[A-Fa-f0-9]{40}$/.test(certificateThumbprint)) {
    throw new Error("WINDOWS_SIGNING_CERTIFICATE_THUMBPRINT must be a SHA-1 thumbprint");
  }
  args.push(
    "--config",
    JSON.stringify({
      bundle: { windows: { certificateThumbprint } },
    })
  );
}

const pnpmCli = process.env.npm_execpath?.trim();
if (!pnpmCli) throw new Error("The Windows client build must run through pnpm");

const result = spawnSync(process.execPath, [pnpmCli, ...args], {
  cwd: repoRoot,
  env: process.env,
  stdio: "inherit",
});

if (result.error) throw result.error;
if (result.status !== 0) throw new Error(`Windows Tauri build exited with status ${result.status}`);

if (certificateThumbprint) {
  const signingResult = spawnSync(
    "powershell.exe",
    [
      "-NoProfile",
      "-NonInteractive",
      "-ExecutionPolicy",
      "Bypass",
      "-File",
      join(repoRoot, "scripts/sign-windows-executable.ps1"),
      "-CertificateThumbprint",
      certificateThumbprint,
    ],
    {
      cwd: repoRoot,
      env: process.env,
      stdio: "inherit",
    }
  );
  if (signingResult.error) throw signingResult.error;
  if (signingResult.status !== 0) {
    throw new Error(`Windows executable signing exited with status ${signingResult.status}`);
  }
}
