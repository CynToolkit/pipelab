# Electron

The Electron provider provides a Release workflow producer for web directory artifacts.

## Patch executable

Enable **Patch executable** (`patchExecutable: true`) when packaging a Windows app to add the `NvOptimusEnablement` and `AmdPowerXpressRequestHighPerformance` exports that request a high-performance GPU. The option defaults to off and applies to the package actions, including Release workflow builds. It is skipped for Linux and macOS targets; installer creation and preview do not apply it.

Pipelab downloads [gpupatch v0.2.1](https://github.com/CynToolkit/gpupatch/releases/tag/v0.2.1) on first use and caches it in the host's third-party tools directory. Supported patching hosts are Windows x64, Linux x64, and macOS x64 or arm64. This does not expand Electron's build support. A failed download or patch stops packaging before the build is published.

For a package action that accepts a JSON configuration, use:

```json
{ "name": "My Game", "patchExecutable": true }
```

For **Package app with configuration**, enable the checkbox directly. For a Release workflow, set `patchExecutable: true` in the Electron producer or Windows target configuration.

## Release workflow producer

The Electron producer accepts a web application directory and declares Windows x64, Linux x64, and macOS arm64 desktop targets. Enable one or more targets in the producer profile. These are declared output targets; local toolchain and host constraints can affect whether a particular build can be made. The provider does not promise universal cross-compilation.

The provider does not promise universal cross-compilation; host toolchains and
platform constraints determine which selected target can be built.
