# Electron

The Electron plugin provides a Release workflow producer for web directory artifacts.

## Release workflow producer

The Electron producer accepts a web application directory and declares Windows x64, Linux x64, and macOS arm64 desktop targets. Enable one or more targets in the producer profile. These are declared output targets; local toolchain and host constraints can affect whether a particular build can be made. The plugin does not promise universal cross-compilation.

The plugin does not promise universal cross-compilation; host toolchains and
platform constraints determine which selected target can be built.
