# Client distribution

The `Build client releases` workflow builds these x64 Windows and universal Android artifacts from a clean checkout:

- `mimorii-v<version>-android-universal-release-signed.apk`
- `mimorii-v<version>-windows-x64-setup.exe`
- `mimorii-v<version>-windows-x64.msi`
- SHA-256 checksum files for both platforms

The Android APK contains `arm64-v8a`, `armeabi-v7a`, and `x86_64` Mimorii native libraries plus the mobile device-status collector in `apps/agent-mobile`. The collector uses Android WorkManager and is packaged through the Tauri client in `apps/client`. The NSIS setup executable is the standard Windows download; the MSI is available for managed deployment. Tagged builds attach all five files to the matching GitHub release. Manual workflow runs keep the files as GitHub Actions artifacts for 30 days.

The Windows job also uploads an SPDX JSON SBOM as a separate workflow artifact. Public repositories receive GitHub build-provenance attestations for the APK and installers plus an SBOM attestation for the Windows installers.

## GitHub configuration

Configure these Actions secrets before running `.github/workflows/clients.yml`:

| Secret                         | Content                                                          |
| ------------------------------ | ---------------------------------------------------------------- |
| `ANDROID_KEYSTORE_BASE64`      | Base64-encoded Android release keystore                          |
| `ANDROID_KEYSTORE_PASSWORD`    | Keystore password                                                |
| `ANDROID_KEY_ALIAS`            | Release key alias                                                |
| `ANDROID_KEY_PASSWORD`         | Release key password                                             |
| `WINDOWS_CERTIFICATE_BASE64`   | Base64-encoded PFX code-signing certificate with its private key |
| `WINDOWS_CERTIFICATE_PASSWORD` | PFX password                                                     |

The Windows certificate must contain a private key, include the Code Signing enhanced key usage, be currently valid, and chain to a CA trusted by Windows. The workflow imports it only into the ephemeral runner certificate store, signs and timestamps the application executable plus both installers, verifies all three signatures, and then removes the imported certificates.

The Android release key must remain the same for every update of `app.mimorii.monitor`. Store an offline backup separately from GitHub.

To enable Android push in release builds, configure all four of these Actions variables. A partially configured set fails the build; leaving all four unset builds the client without Firebase push.

- `MIMORII_FIREBASE_API_KEY`
- `MIMORII_FIREBASE_APPLICATION_ID`
- `MIMORII_FIREBASE_PROJECT_ID`
- `MIMORII_FIREBASE_SENDER_ID`

Create one-line base64 values in PowerShell with:

```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes("release.keystore"))
[Convert]::ToBase64String([IO.File]::ReadAllBytes("code-signing.pfx"))
```

On Linux, use:

```bash
base64 -w 0 release.keystore
base64 -w 0 code-signing.pfx
```

Do not add keystores, PFX files, passwords, or encoded credentials to the repository.

## Release workflow

Client versions must match in:

- `package.json`
- `apps/client/package.json`
- `apps/client/src-tauri/tauri.conf.json`
- `apps/client/src-tauri/Cargo.toml`

Push a tag matching that version, such as `v2.0.0`, to build, verify, attest, and publish both clients. A mismatched tag fails before either platform build.

Run the same distribution checks locally after changing client metadata or scripts:

```bash
pnpm clients:validate
```

The Android job installs its pinned SDK, build tools, NDK, JDK, and Rust targets. It then runs `tauri android init` in the clean checkout, tests the mobile collector, builds one universal release APK, aligns it for 16 KiB pages, signs it, verifies the signer, checks all supported native ABIs, and lints the generated release app and Android plugins. Nothing under the ignored `apps/client/src-tauri/gen/` directory is required from source control.

The Windows job imports the PFX into `Cert:\CurrentUser\My` and passes its thumbprint to the canonical build script. The script supplies an explicit ephemeral Tauri config for installer signing and signs the final application executable after bundling. Stable installer metadata, the fixed MSI upgrade code, WebView2 bootstrapper behavior, and timestamp settings live in `apps/client/src-tauri/tauri.windows.conf.json`.

## Local Android build

Install Node.js 24, pnpm 10.33.2, Rust stable, JDK 21, Android SDK platform 36, Android build tools 36.1.0, and Android NDK 30.0.14904198. Add these Rust targets:

```bash
rustup target add aarch64-linux-android armv7-linux-androideabi x86_64-linux-android
```

Set `ANDROID_HOME`, `NDK_HOME`, and `ANDROID_BUILD_TOOLS_VERSION`, install dependencies, and initialize a new checkout once:

```bash
pnpm install --frozen-lockfile
pnpm tauri:android:init
```

An unsigned universal release build is available with:

```bash
pnpm tauri:android:build
```

The unsigned APK is written to `apps/client/src-tauri/gen/android/app/build/outputs/apk/universal/release/app-universal-release-unsigned.apk`.

For a signed local artifact, set these environment variables and run the canonical release command:

- `ANDROID_SIGNING_STORE_FILE`
- `ANDROID_SIGNING_STORE_PASSWORD`
- `ANDROID_SIGNING_KEY_ALIAS`
- `ANDROID_SIGNING_KEY_PASSWORD`

```bash
pnpm tauri:android:release
```

The signed APK and checksum are written to `dist/clients/android/`.

## Local Windows build

Use Windows x64 with Node.js 24, pnpm 10.33.2, Rust stable using the MSVC toolchain, Microsoft C++ Build Tools, and the Windows SDK. Tauri downloads its pinned WiX and NSIS tools when needed.

An unsigned installer validation build is available with:

```powershell
pnpm install --frozen-lockfile
pnpm tauri:windows:build
pnpm tauri:windows:stage
```

The generated application is x64. The staging command rejects missing, duplicate, or non-x64 outputs and writes versioned installers plus a SHA-256 checksum file to `dist/clients/windows/`.

For a signed build, set `WINDOWS_CERTIFICATE_PATH` and `WINDOWS_CERTIFICATE_PASSWORD`, then import the certificate and expose only its thumbprint to the build script:

```powershell
$password = ConvertTo-SecureString $env:WINDOWS_CERTIFICATE_PASSWORD -AsPlainText -Force
$certificates = @(Import-PfxCertificate -FilePath $env:WINDOWS_CERTIFICATE_PATH -CertStoreLocation Cert:\CurrentUser\My -Password $password)
$certificate = $certificates | Where-Object HasPrivateKey | Select-Object -First 1
$env:WINDOWS_SIGNING_CERTIFICATE_THUMBPRINT = $certificate.Thumbprint
pnpm tauri:windows:release
```

Verify `Get-AuthenticodeSignature` reports `Valid` for `apps/client/src-tauri/target/release/Mimorii.exe`, the generated MSI, and the NSIS setup executable. Remove the locally imported certificate when it is no longer needed. Staged installers and their checksum are written to `dist/clients/windows/`.
