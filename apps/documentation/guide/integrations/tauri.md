# Tauri

The Tauri plugin packages a web application as a desktop app through a Release workflow producer.

## Release workflow producer

The producer accepts a web application directory and declares Windows x64,
Linux x64, and macOS arm64 outputs. This target list does not guarantee
cross-compilation from every host. Builds use Tauri's local Rust/Cargo
toolchain; a missing Cargo executable is reported as an error.
