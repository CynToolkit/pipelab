# Repository architecture

Pipelab is a pnpm/Turborepo workspace. Product behavior lives in app shells,
shared packages, provider plugins, and worker services. The maintained
contributor guide is [Develop Pipelab](apps/documentation/contributing/development.md)
and [Contributor architecture](apps/documentation/contributing/architecture.md).

## Workspace boundaries

| Directory | Responsibility |
| --- | --- |
| `apps/desktop` | Electron lifecycle, native dialogs and shell operations, preload bridge, IPC, and starting the local CLI server. |
| `apps/ui` | Vue interface, graph pipeline editor, Release workflow editor, and browser-side API calls. |
| `apps/cli` | CLI command registration and packaged executable bundle. It starts the core-node server and exposes pipeline and Release workflow commands. |
| `packages/core-node` | Node context, HTTP/WebSocket server, handlers, persistence, plugin registry, and workflow host adapters. |
| `packages/shared` | Shared types, schemas, configuration, plugin definitions, and Release planning/compiler contracts. |
| `packages/workflow-runtime` | Host-abstracted task workflow types, local host, and execution runtime. |
| `plugins/*` | Provider-specific actions, workflow producers, sources, and destinations. Core-node statically registers the built-in plugins. |
| `workers/*`, `supabase/` | Cloudflare Worker services and database migrations/functions for cloud features. |

## Runtime paths

The desktop app starts or resolves a separate CLI server process. The Vue UI
uses the local WebSocket server for engine requests and the Electron preload
bridge for native operations such as file dialogs. The CLI server is
implemented by `@pipelab/core-node`; `pipelab serve` binds to loopback at
`127.0.0.1:33753` by default.

Pipelab has two execution models:

- A **pipeline** is the graph editor model. The legacy evaluator runs its
  enabled action blocks in saved order and records outputs for later blocks.
- A **Release workflow** is planned from a source, producers, destinations,
  artifacts, and dependencies. The compiled task workflow runs through
  `@pipelab/workflow-runtime`; ready steps may run concurrently.

## Package imports

Workspace package manifests define supported exports. Inspect the owning
package's `package.json`, `src/index.ts`, README, and scripts before changing
or importing from it. Do not assume an undeclared package subpath is supported.
Provider-specific behavior belongs in its plugin package; generic runtime
contracts belong in shared packages or the workflow runtime.

For feature-specific architecture and setup, use the maintained
[contributor docs](apps/documentation/contributing/architecture.md).
