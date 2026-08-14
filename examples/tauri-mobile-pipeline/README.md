# Tauri Mobile Pipeline

Builds a Tauri app for **Android** and **iOS** using the Pipelab Tauri plugin's
mobile build path.

## What it does

1. `tauri:scaffold` — creates a fresh Tauri project (web frontend + `src-tauri`).
2. `tauri:package` — writes a mobile-ready `tauri.conf.json` (enables all bundle
   targets) and runs the platform build:
   - Android: `cargo tauri android init` then `cargo tauri android build --target aarch64 --apk`
   - iOS: `cargo tauri ios init` then `cargo tauri ios build --target aarch64`

The `platform` and `arch` action inputs select the mobile target. Use the
`mobileConfig` input to inject `tauri.conf.json > app > mobile` (e.g.
`"homeIndicator": "hidden"`, `"orientation": "portrait"`).

## Prerequisites

Mobile builds are delegated to the official Tauri CLI, which requires the native
toolchains:

- **Android** — Android SDK + NDK, `ANDROID_HOME` set, and the SDK packages
  `platform-tools`, `build-tools`, plus a platform/NDK matching your `rustup`
  targets (`aarch64-linux-android`, ...). See
  https://tauri.app/start/prerequisites/#android
- **iOS** — macOS with Xcode and the iOS SDK. See
  https://tauri.app/start/prerequisites/#ios

Without these, the pipeline will report `Android SDK not found` /
`failed to ensure iOS environment` from the Tauri CLI — this is expected in
environments that only have the Rust + desktop toolchain.

## Run

```bash
pnpm --filter @pipelab/cli start -- \
  run examples/tauri-mobile-pipeline/pipeline.json \
  --user-data /tmp/pl-userdata
```
