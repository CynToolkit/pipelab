# Tauri

The Tauri plugin packages a web application as a desktop app. It includes package, configure, and preview pipeline actions and a Release workflow producer.

## Actions and settings

**Package app with configuration** requires an input folder and Tauri configuration. **Configure Tauri** creates the configuration separately. **Preview app** requires a nonempty URL and configuration, builds a package, and launches it against that URL. Configuration includes application identity and version, window dimensions and behavior, icon, and packaging options. The package action emits an output directory; Configure emits a `configuration` output.

**Create Installer** is registered but disabled in this beta with the message “Tauri installer creation is not available in this beta.”

## Release workflow producer

The producer accepts a web application directory and declares Windows x64, Linux x64, and macOS arm64 outputs. This target list does not guarantee cross-compilation from every host. Builds use Tauri's local Rust/Cargo toolchain; a missing Cargo executable is reported as an error. Framework build errors appear in task logs.

## Minimal example

```text
input-url: http://localhost:3000
```

The snippet shows Preview inputs; it does not expose an input-folder field. The runner rejects an empty URL or missing configuration. No account credentials are required for local packaging.
