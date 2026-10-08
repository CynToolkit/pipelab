# @pipelab/providers

Built-in Release and Workflow providers shipped with Pipelab. Construct,
Electron, Godot, Tauri, Steam, Itch, and Poki keep isolated implementation and
test folders under `src/`; this workspace package versions them together.

The single public entry point exports the seven named provider definitions,
selected host helpers for browser profiles and sign-in, and existing public
task factory aliases. Provider modules remain internal and independently testable.
The core-node `builtInProviders` list composes the definitions into renderer
metadata, Release definitions, and Workflow tasks.

Provider, Release, and task IDs retain their `@pipelab/plugin-*` values for
saved workflow and connection compatibility. Consolidation does not require
a Release configuration migration.

Run `pnpm --filter @pipelab/providers test` for all providers, or use a focused
script such as `pnpm --filter @pipelab/providers test:construct` for one folder.
Dependencies are declared once in this package's manifest.

The Godot provider icon is the Godot Engine logo by Andrea Calabró, licensed
under CC BY 4.0. The bundled asset and license are from
[`godotengine/godot/misc/logo`](https://github.com/godotengine/godot/tree/master/misc/logo).

Providers depend on shared contracts, workflow-runtime and the existing
`@pipelab/plugin-core` execution helpers. They do not import core-node. Managed
paths, executable installation and bundled asset resolution are supplied by the
host through `ProviderHostContext`; see the helper package README for the
ownership audit. Real packaging execution coverage lives in the CLI host E2E
suite; provider folder tests exercise isolated implementation and mocked boundaries.
