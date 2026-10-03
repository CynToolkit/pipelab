# Release workflow providers

The Release editor filters choices based on the selected input, target, and
host. The lists below describe registered capabilities; they do not guarantee
that every target can be built from every operating system.

## Release workflow providers

| Type | Available providers | Use them to |
|---|---|---|
| Sources | Folder, Web app folder, ZIP, Web app ZIP, Construct 3, Godot | Bring local project files or an exported Construct/Godot project into a workflow |
| Producers | Passthrough, Extract ZIP, Godot, Electron, Tauri | Transform an input or build a desktop/web artifact |
| Destinations | Folder, ZIP, Steam, itch.io, Poki | Copy, archive, or publish an artifact |

Core folder and ZIP sources, producers, and destinations are provided by
Pipelab; see [Folder and ZIP providers](./folder-zip). Provider details:

- [Construct 3](./construct) exports a `.c3p` project using a local Chromium
  profile.
- [Godot](./godot) exports configured Godot presets to declared targets.
- [Electron](./electron) packages web applications and previews app URLs.
- [Tauri](./tauri) packages web applications and previews app URLs. Installer
  creation is unavailable in this beta.
- [Steam](../publishing/steam), [itch.io](../publishing/itch), and
  [Poki](../publishing/poki) document account and destination setup.

For workflow setup and execution, see
[Build and ship with a Release workflow](../release-workflows).
