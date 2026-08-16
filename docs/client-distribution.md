# Release distribution

## Published artifacts

A version release publishes these files:

- `mimorii-client-agent-v<version>-android-universal.apk`
- `mimorii-agent-v<version>-linux-x64.tar.gz`
- `mimorii-agent-v<version>-windows-x64.zip`
- `mimorii-v<version>-windows-x64-setup.exe`
- `mimorii-v<version>-windows-x64.msi`
- SHA-256 checksum files for each platform

The Android APK is the Mimorii client and Android device-status agent in one application. `apps/agent-mobile` is a Tauri plugin loaded by `apps/client`, not a separately installable application. A second agent APK would duplicate the client, resources, runtime, and signing identity without adding an independently useful deployment.

The universal APK includes `arm64-v8a`, `armeabi-v7a`, and `x86_64` native libraries. These cover current phones and tablets, supported older 32-bit ARM devices, and x64 Android environments. The unused 32-bit x86 target is omitted. One universal APK keeps the total GitHub Release size lower than three ABI APKs because shared web assets and Android resources appear once.

The desktop agent supports automatic service installation on Linux and Windows. Release automation ships the x64 targets already built and tested by CI. The Windows executable and both client installers are Authenticode-signed and timestamped. The Android APK is aligned for 16 KiB pages before it is signed and verified.

## Version releases

`package.json` is the canonical project version. `pnpm release:validate` requires the API, contracts, agents, Tauri client, plugins, and generated OpenAPI metadata to match it.

The `Release` workflow runs on every push to `main`. It compares the canonical version at the pushed commit with the pre-push commit:

- An increased semantic version builds and publishes the release.
- An unchanged version exits after metadata validation.
- A downgrade, invalid version, inconsistent metadata, or conflicting existing tag fails without publishing.

The release reuses the `CI` workflow as a required publish gate. After CI and every platform build succeed, it publishes the container image, creates `v<version>` at the exact bump commit, and creates the corresponding GitHub Release with generated notes and all nine files. Re-running the same workflow is idempotent: the tag must still identify the same commit and release assets are replaced by name.

Ordinary pushes continue through `CI`, including release metadata validation, tests, release builds, workflow linting, and the container smoke test. They do not publish images, tags, workflow artifacts, or GitHub Releases.

## Container architecture

Mimorii has one deployable application image: `ghcr.io/pureportal/mimorii`. The Nest API serves the compiled web client from `MIMORII_CLIENT_DIST`, and Compose exposes one Mimorii service and one PostgreSQL service. The web frontend has no separate server process, runtime configuration, health check, or scaling boundary, so a second frontend image would duplicate the static files and require a new deployment architecture without providing an independently useful service.

Each stable version publishes these image tags:

- `<version>`
- `sha-<full-commit-sha>`
- `main`
- `latest`

Prereleases publish the version, commit, and branch tags but do not replace `latest`. The package is a multi-platform manifest for `linux/amd64` and `linux/arm64`, with an SBOM and build provenance.

GitHub Packages showed only one image because the previous workflow used `${{ github.repository }}` as its only image name and built the repository's only Dockerfile. That package count matches the deployment architecture.

## GitHub configuration

Configure these Actions secrets:

| Secret                         | Content                                                          |
| ------------------------------ | ---------------------------------------------------------------- |
| `ANDROID_KEYSTORE_BASE64`      | Base64-encoded Android release keystore                          |
| `ANDROID_KEYSTORE_PASSWORD`    | Keystore password                                                |
| `ANDROID_KEY_ALIAS`            | Release key alias                                                |
| `ANDROID_KEY_PASSWORD`         | Release key password                                             |
| `WINDOWS_CERTIFICATE_BASE64`   | Base64-encoded PFX code-signing certificate with its private key |
| `WINDOWS_CERTIFICATE_PASSWORD` | PFX password                                                     |

The Android release key must remain unchanged for updates to `app.mimorii.monitor`. Keep an offline backup outside GitHub. The Windows certificate must contain a private key, include the Code Signing enhanced key usage, be currently valid, and chain to a CA trusted by Windows. Signing files are decoded only on ephemeral runners and removed after use.

Android push is optional. Configure all four Actions variables or leave all four unset:

- `MIMORII_FIREBASE_API_KEY`
- `MIMORII_FIREBASE_APPLICATION_ID`
- `MIMORII_FIREBASE_PROJECT_ID`
- `MIMORII_FIREBASE_SENDER_ID`

No publishing token secret is required. Jobs use the repository `GITHUB_TOKEN` with job-specific `contents`, `packages`, `attestations`, and `id-token` permissions.

The existing `mimorii` package must grant this repository write access under **Package settings > Manage Actions access** if it is not already linked. Its current private visibility is independent of the public repository. Change the package to public manually only when anonymous pulls are intended; the workflow does not change package visibility.

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

Do not add keystores, certificates, passwords, or encoded credentials to the repository.

## Size and retention

Release builds use Rust LTO, size optimization, panic aborts, and symbol stripping. Android also uses R8 code shrinking, resource shrinking, and one universal package for the three supported ABIs. Production web source maps are disabled.

The container uses a multi-stage build and `pnpm deploy --prod` so the runtime contains only the API's production dependency closure, compiled API, and compiled web client. The Docker context excludes native clients, generated output, tests, documentation, local tooling, and workspace metadata. BuildKit caches dependency and image layers without placing cache contents in the runtime image.

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

Use Windows x64 with Microsoft C++ Build Tools and the Windows SDK. An unsigned validation build is available with:

```powershell
pnpm tauri:windows:build
pnpm tauri:windows:stage
```

For local signing, import the PFX into `Cert:\CurrentUser\My`, set `WINDOWS_SIGNING_CERTIFICATE_THUMBPRINT`, and run `pnpm tauri:windows:release`. Remove the imported certificate afterward.

### Desktop agent

Build the current platform's size-optimized executable with:

```bash
cargo build --locked --release --manifest-path apps/agent-deskopt/Cargo.toml
```
