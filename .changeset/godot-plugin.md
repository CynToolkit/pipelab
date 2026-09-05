---
"@pipelab/app": minor
---

feat(plugin-godot): add "Export Godot project" action

Adds a new Godot plugin with a single "Export Godot project" action. It takes a Godot 4.x
project folder, auto-detects matching presets from `export_presets.cfg` (or generates one for
the target platform: Windows, Linux, macOS or Web, defaulting to the host platform), downloads
the Godot 4.4.1 headless editor and export templates on first use, and runs
`godot --headless --export-release`. Output paths are exposed via the `output`, `parentFolder`
and `folder` outputs.
