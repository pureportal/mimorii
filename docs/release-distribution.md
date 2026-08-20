# Release distribution

## Release assets

Each GitHub release publishes four packages and one checksum manifest:

| Product                             | Asset                                    |
| ----------------------------------- | ---------------------------------------- |
| Mimorii Agent for Android           | `mimorii-agent-android.apk`              |
| Mimorii Agent for Ubuntu/Debian x64 | `mimorii-agent-ubuntu-debian-x64.tar.gz` |
| Mimorii Agent for Windows x64       | `mimorii-agent-windows-x64.zip`          |
| Mimorii Client for Android          | `mimorii-client-android.apk`             |
| SHA-256 checksums                   | `mimorii-sha256-checksums.txt`           |

Asset filenames are versionless. The application and executable metadata still contain the
release version, while downloads through GitHub's latest-release route remain stable:

- <https://github.com/pureportal/mimorii/releases/latest/download/mimorii-agent-android.apk>
- <https://github.com/pureportal/mimorii/releases/latest/download/mimorii-agent-ubuntu-debian-x64.tar.gz>
- <https://github.com/pureportal/mimorii/releases/latest/download/mimorii-agent-windows-x64.zip>
- <https://github.com/pureportal/mimorii/releases/latest/download/mimorii-client-android.apk>
- <https://github.com/pureportal/mimorii/releases/latest/download/mimorii-sha256-checksums.txt>

The checksum manifest contains one entry for each package. It is generated only after all four
platform artifacts have been downloaded into the publishing job, then verified before release
creation.

## Platform packages

The Android agent and client are separate applications that can be installed together. The client
uses `app.mimorii.monitor` and packages the web client as an Android app. The agent uses
`app.mimorii.agent` and enables the Android device-status collector. Both APKs are signed, aligned
for 16 KiB pages, and include `arm64-v8a`, `armeabi-v7a`, and `x86_64` native libraries.

The Linux archive is a statically linked x64 agent build for Ubuntu and Debian. It contains one
executable, `mimorii-agent-desktop`, with its executable mode preserved. The Windows archive
contains one x64 executable, `mimorii-agent-desktop.exe`. Both agents can install their user-level
startup service with `mimorii-agent-desktop service install`.

## Version releases

`package.json` is the canonical project version. `pnpm release:validate` requires the API,
contracts, agents, Tauri applications, plugins, and generated OpenAPI metadata to match it.

The `Release` workflow runs on pushes to `main`. A release commit builds both Android applications,
the Ubuntu/Debian agent, and the Windows agent. Publishing proceeds only after the reusable CI
workflow, all package jobs, and both container image builds succeed. The workflow validates the
four package filenames, creates and verifies the checksum manifest, then creates or updates the
version tag and GitHub release.

Every successful `main` push publishes the server and check-agent container images with `main` and
commit tags. Version releases also publish the version tag, and stable releases update `latest`.
The containers are multi-platform images for `linux/amd64` and `linux/arm64` with SBOM and build
provenance.

## GitHub configuration

Configure these Actions secrets:

| Secret                      | Content                                 |
| --------------------------- | --------------------------------------- |
| `ANDROID_KEYSTORE_BASE64`   | Base64-encoded Android release keystore |
| `ANDROID_KEYSTORE_PASSWORD` | Keystore password                       |
| `ANDROID_KEY_ALIAS`         | Release key alias                       |
| `ANDROID_KEY_PASSWORD`      | Keystore key password                   |

The Android release key must remain unchanged for application updates. Keep an offline backup
outside GitHub. The workflow decodes the key only on the ephemeral Android runner and removes it
after the build.

Android push is optional. Configure all four Actions variables or leave all four unset:

- `MIMORII_FIREBASE_API_KEY`
- `MIMORII_FIREBASE_APPLICATION_ID`
- `MIMORII_FIREBASE_PROJECT_ID`
- `MIMORII_FIREBASE_SENDER_ID`

## Local checks

Install Node.js 24, pnpm 10.33.2, and Rust stable, then run:

```bash
pnpm install --frozen-lockfile
pnpm check
pnpm test
```

For Android builds, also install JDK 21, Android SDK platform 36, build tools 36.1.0, Android NDK
30.0.14904198, and the required Rust targets:

```bash
rustup target add aarch64-linux-android armv7-linux-androideabi x86_64-linux-android
pnpm tauri:android:init
pnpm tauri:android:client:build
pnpm tauri:android:agent:build
```

To produce signed APKs, set `ANDROID_SIGNING_STORE_FILE`,
`ANDROID_SIGNING_STORE_PASSWORD`, `ANDROID_SIGNING_KEY_ALIAS`, and
`ANDROID_SIGNING_KEY_PASSWORD`, then run:

```bash
pnpm tauri:android:release
```

Build and test the desktop agent for the current platform with:

```bash
cargo build --locked --release --manifest-path apps/agent-desktop/Cargo.toml
cargo test --locked --manifest-path apps/agent-desktop/Cargo.toml
```
