# Tauri Mobile + Desktop Pipeline

Builds the **same** sample web app into both a **desktop** bundle and an
**Android** build using the Pipelab Tauri plugin. One Tauri project, two
targets — the example canvas contains a desktop (`platform: linux`) package
block and a mobile (`platform: android`) package block that both consume the
same `html-export` input folder.

## What it does

1. `tauri:scaffold` — creates a fresh Tauri project (web frontend + `src-tauri`).
2. `tauri:package` — writes a mobile-ready `tauri.conf.json` (enables all bundle
   targets) and runs the platform build:
   - Desktop: `cargo tauri build` (target selected via `platform`/`arch`).
   - Android: `cargo tauri android init` then `cargo tauri android build --target aarch64 --apk`
   - iOS: `cargo tauri ios init` then `cargo tauri ios build --target aarch64`

The `platform` and `arch` action inputs select the target. `platform` accepts
`win32` / `linux` / `darwin` (desktop) as well as `android` / `ios` (mobile),
and `arch` accepts `x64` / `arm64` / `ia32` / `armv7l` / `universal` / ...

## Prerequisites

Builds are delegated to the official Tauri CLI, which requires the native
toolchains:

- **Desktop** — the host's system webview libraries (e.g. `webkit2gtk-4.1`,
  `gtk+-3.0`, `librsvg-2.0` on Linux). See
  https://tauri.app/start/prerequisites/#linux
- **Android** — Android SDK + NDK, `ANDROID_HOME` set, and the SDK packages
  `platform-tools`, `build-tools`, plus a platform/NDK matching your `rustup`
  targets (`aarch64-linux-android`, ...). The Pipelab plugin **self-heals** this
  on first run (it reuses an existing SDK or downloads one into the shared cache
  folder and adds the Rust target). See
  https://tauri.app/start/prerequisites/#android
- **iOS** — macOS with Xcode and the iOS SDK. See
  https://tauri.app/start/prerequisites/#ios

## Run

```bash
pnpm --filter @pipelab/cli start -- \
  run examples/tauri-mobile-pipeline/pipeline.json \
  --user-data /tmp/pl-userdata
```

On a host that only has the Rust + desktop toolchain, the Android block will
still succeed (the plugin provisions the SDK into the shared cache); the desktop
block additionally needs the webview system libraries installed.
