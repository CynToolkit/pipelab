# Electron

The Electron plugin packages a web application as a desktop app. It also provides a Release workflow producer for web directory artifacts.

## Pipeline actions

Registered actions include **Package app**, **Package app with configuration**, **Configure Electron**, **Create installer**, and **Preview app**. Package actions require a local input folder. The configuration form includes application name, bundle ID, version, author, icon, description, window size and behavior, optional extra npm packages, and integration/build options. Defaults include name `Pipelab`, bundle ID `com.pipelab.app`, version `1.0.0`, author `Pipelab`, and an 800×600 window. Preview requires a URL and configuration; it packages the app, then launches it with that URL. Empty URLs, missing configuration, and package failures stop preview.

Configure exposes configuration values without building. The configuration-based package action takes a JSON `configuration` object. A legacy packaging action remains registered; prefer the configuration-based action for new pipelines.

## Release workflow producer

The Electron producer accepts a web application directory and declares Windows x64, Linux x64, and macOS arm64 desktop targets. Enable one or more targets in the producer profile. These are declared output targets; local toolchain and host constraints can affect whether a particular build can be made. The plugin does not promise universal cross-compilation.

## Minimal example

For **Preview app**, provide a reachable URL and configuration. The preview action itself has no input-folder field; it packages the configured app before opening the URL.

```text
input-url: http://localhost:3000
configuration: { "name": "My Game" }
```

The preview runner merges provided values with defaults. No credentials are required for local packaging. Build errors from Electron Forge or package installation appear in the task logs. Installer creation is a registered Electron action; it does not guarantee every host can produce every installer format.
