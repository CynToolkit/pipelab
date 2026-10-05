# @pipelab/providers

Built-in Release and Workflow providers shipped with Pipelab. Construct,
Electron, Godot, Tauri, Steam, Itch, and Poki keep isolated implementation and
test folders under `src/`; this workspace package versions them together.

The root exports the seven named provider definitions. Provider subpaths
such as `@pipelab/providers/construct` expose that module's canonical `provider`
and existing helper exports. The core-node `builtInProviders` list composes
the definitions into renderer metadata, Release definitions, and Workflow tasks.

Provider, Release, and task IDs retain their `@pipelab/plugin-*` values for
saved workflow and connection compatibility. Consolidation does not require
a Release configuration migration.

Run `pnpm --filter @pipelab/providers test` for all providers, or use a focused
script such as `pnpm --filter @pipelab/providers test:construct` for one folder.
Dependencies are declared once in this package's manifest.
