# Godot

The Godot provider exports an existing project through Godot's headless command line and a named export preset. In a Release workflow, choose a Godot project source and the Godot producer, then enable the target profiles you need.

## Project and build settings

The source points to a project directory containing `project.godot`. Inspection reads its project name and `export_presets.cfg`, discovers a `godot` or `godot4` executable on `PATH`, checks for export templates, and offers preset names found in the project. The producer's executable setting defaults to the detected executable; a target's preset must match that target.

Declared output targets are Windows x64, Linux x64, macOS arm64, and web. Each output is an application directory. Web exports are unzipped into the output directory. For desktop targets, the output directory contains the exported executable/application files. A successful export also reports size and SHA-256 checksum metadata.

## Requirements and errors

Install Godot and the platform export templates on the machine that runs Pipelab. The project needs an export preset configured for the selected target. A missing executable is an error; missing templates are reported as a warning during inspection. An unknown preset, a preset for another platform, a nonzero Godot exit, or an export with no files fails the build. Web archive entries with paths escaping the output directory are rejected.

The targets above are declared outputs, not a guarantee that every host can cross-compile every target. The plugin invokes the locally available Godot executable and does not publish a complete host-to-target support matrix.

## Minimal example

For a project at `/work/game` with a preset named `Web`, the source and producer need these values:

```text
source.path: /work/game
producer.executable: godot
target: web (enabled)
target.preset: Web
```

`godot` may be replaced with an executable path. The preset name must exist in that project's `export_presets.cfg` and target Web.
