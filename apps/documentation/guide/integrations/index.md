# Providers and tasks

Pipelab combines **Release workflow providers** with **pipeline tasks**. Sources,
producers, and destinations appear in the Release editor. Pipeline tasks run in
the graph editor. Some plugins appear in both places; a task in one editor is
not automatically a source, producer, or destination in the other.

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

## Pipeline tasks

| Plugin | Registered tasks | Reference |
|---|---|---|
| Filesystem | Zip, Unzip file, Copy file/folder, Remove file/folder, Run Command, Open path in explorer | [Filesystem actions](./filesystem) |
| System | Manual event, Log, Alert, Prompt, Wait | [System actions](./system) |
| Electron | Configure, package, installer, and preview actions | [Electron](./electron) |
| Tauri | Configure, package, and preview actions | [Tauri](./tauri) |
| Discord | Package and preview a Discord Activity | [Discord Activity](./discord-activity) |
| Netlify | Build Netlify site, Upload to Netlify | [Netlify](./netlify) |
| Minify | Minify code, Minify images | [Minify](./minify) |
| NVPatch | Patch binary | [NVPatch](./nvpatch) |

Construct, Godot, Steam, itch.io, and Poki also register legacy pipeline tasks;
their provider pages describe the Release workflow surface and call out task
behavior where it differs. Files that exist in plugin source but are not
registered, including Unity, GDevelop, Neutralino, Epic Games Store, Join, and
List files, are not available choices in the current product.

For authoring guidance, see [Edit and run a pipeline](../pipelines) and
[Build and ship with a Release workflow](../release-workflows).
