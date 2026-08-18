# Release distribution

## Published artifacts

A version release publishes these files:

- `mimorii-client-agent-v<version>-android-universal.apk`
- `mimorii-agent-v<version>-linux-x64.tar.gz`
- `mimorii-agent-v<version>-windows-x64.zip`
- `mimorii-v<version>-ubuntu-x64.deb`
- `mimorii-v<version>-windows-x64-setup.exe`
- `mimorii-v<version>-windows-x64.msi`
- SHA-256 checksum files for each platform

The Android APK is the Mimorii client and Android device-status agent in one application. `apps/agent-mobile` is a Tauri plugin loaded by `apps/client`, not a separately installable application. A second agent APK would duplicate the client, resources, runtime, and signing identity without adding an independently useful deployment.

The universal APK includes `arm64-v8a`, `armeabi-v7a`, and `x86_64` native libraries. These cover current phones and tablets, supported older 32-bit ARM devices, and x64 Android environments. The unused 32-bit x86 target is omitted. One universal APK keeps the total GitHub Release size lower than three ABI APKs because shared web assets and Android resources appear once.

The desktop agent supports automatic service installation on Linux and Windows. Release automation ships the x64 targets already built and tested by CI. The Ubuntu client is a Debian package built on Ubuntu 22.04. Windows and Ubuntu artifacts are published unsigned. The Android APK is aligned for 16 KiB pages before it is signed and verified.

## Version releases

`package.json` is the canonical project version. `pnpm release:validate` requires the API, contracts, agents, Tauri client, plugins, and generated OpenAPI metadata to match it.

The `Release` workflow runs on every push to `main`. It validates the commit through the reusable `CI` workflow and compares the canonical version at the pushed commit with the pre-push commit:

- An increased semantic version builds and publishes the release.
- An unchanged version publishes only the `main` and commit-tagged container images.
- A downgrade, invalid version, inconsistent metadata, or conflicting existing tag fails without publishing.

Every successful push publishes the server and check-agent images with `main` and commit tags. When the version increases, Android, Ubuntu, and Windows builds run as additional publish gates. After every platform build succeeds, the same image builds also receive version tags, stable releases receive `latest`, `v<version>` is created at the exact bump commit, and the corresponding GitHub Release is created with generated notes and all eleven files. Re-running the same workflow is idempotent: the tag must still identify the same commit and release assets are replaced by name.

Pull requests run `CI` directly. Ordinary `main` pushes do not create tags, installer artifacts, or GitHub Releases.

## Container architecture

Mimorii publishes the combined API and web deployment as `ghcr.io/pureportal/mimorii-server` and the check-only agent as `ghcr.io/pureportal/mimorii-check-agent`. The server image contains the Nest API and compiled web client. The check-agent image runs HTTP, TCP, and DNS checks without host telemetry.

Every `main` push publishes these image tags:

- `sha-<full-commit-sha>`
- `main`

A version release also publishes:

- `<version>`
- `latest`

Prereleases publish the version, commit, and branch tags but do not replace `latest`. Each package is a multi-platform manifest for `linux/amd64` and `linux/arm64`, with an SBOM and build provenance.

## GitHub configuration

Configure these Actions secrets:

| Secret                      | Content                                 |
| --------------------------- | --------------------------------------- |
| `ANDROID_KEYSTORE_BASE64`   | Base64-encoded Android release keystore |
| `ANDROID_KEYSTORE_PASSWORD` | Keystore password                       |
| `ANDROID_KEY_ALIAS`         | Release key alias                       |
| `ANDROID_KEY_PASSWORD`      | Release key password                    |

The Android release key must remain unchanged for updates to `app.mimorii.monitor`. Keep an offline backup outside GitHub. The keystore is decoded only on ephemeral runners and removed after use.

Android push is optional. Configure all four Actions variables or leave all four unset:

- `MIMORII_FIREBASE_API_KEY`
- `MIMORII_FIREBASE_APPLICATION_ID`
- `MIMORII_FIREBASE_PROJECT_ID`
- `MIMORII_FIREBASE_SENDER_ID`

No publishing token secret is required. Jobs use the repository `GITHUB_TOKEN` with job-specific `contents`, `packages`, `attestations`, and `id-token` permissions.

The `mimorii-server` and `mimorii-check-agent` packages must grant this repository write access under **Package settings > Manage Actions access** if they are not already linked. Package visibility is independent of the public repository. Change each package to public manually only when anonymous pulls are intended; the workflow does not change package visibility.

Create one-line base64 values in PowerShell with:

```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes("release.keystore"))
```

On Linux, use:

```bash
base64 -w 0 release.keystore
```

Do not add keystores, certificates, passwords, or encoded credentials to the repository.

## Size and retention

Release builds use Rust LTO, size optimization, panic aborts, and symbol stripping. Android also uses R8 code shrinking, resource shrinking, and one universal package for the three supported ABIs. Production web source maps are disabled.

The server container uses a multi-stage build and `pnpm deploy --prod` so the runtime contains only the API's production dependency closure, compiled API, and compiled web client. The check-agent container uses a multi-stage Rust build and runs as a non-root user. BuildKit caches dependency and image layers without placing cache contents in either runtime image.

Intermediate Actions artifacts use zero recompression for already compressed installers and expire after seven days. GitHub Release assets remain available with the release.

## Local validation

Install Node.js 24, pnpm 10.33.2, and Rust stable, then run:

```bash
pnpm install --frozen-lockfile
pnpm release:validate
pnpm check
pnpm test
```

### Android

Install JDK 21, Android SDK platform 36, build tools 36.1.0, Android NDK 30.0.14904198, and these Rust targets:

```bash
rustup target add aarch64-linux-android armv7-linux-androideabi x86_64-linux-android
```

Set `ANDROID_HOME`, `NDK_HOME`, and `ANDROID_BUILD_TOOLS_VERSION`, then initialize a clean generated project and build an unsigned release:

```bash
pnpm tauri:android:init
pnpm tauri:android:build
```

For a signed local APK, set `ANDROID_SIGNING_STORE_FILE`, `ANDROID_SIGNING_STORE_PASSWORD`, `ANDROID_SIGNING_KEY_ALIAS`, and `ANDROID_SIGNING_KEY_PASSWORD`, then run:

```bash
pnpm tauri:android:release
```

### Windows client

Use Windows x64 with Microsoft C++ Build Tools and the Windows SDK. Build and stage the unsigned installers with:

```powershell
pnpm tauri:windows:build
pnpm tauri:windows:stage
```

### Ubuntu client

Use Ubuntu 22.04 x64 with the Tauri Linux prerequisites. Build and stage the Debian installer with:

```bash
pnpm tauri:ubuntu:build
pnpm tauri:ubuntu:stage
```

### Desktop agent

Build the current platform's size-optimized executable with:

```bash
cargo build --locked --release --manifest-path apps/agent-desktop/Cargo.toml
```

Validate the check-only agent Compose configuration and build its image with:

```bash
docker compose --env-file .env.agent -f apps/agent-desktop/compose.yaml config --quiet
docker build -t mimorii-check-agent:local apps/agent-desktop
```
