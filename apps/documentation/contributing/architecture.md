# Contributor architecture and package ownership

This is an implementation map for contributors, not a promise of a stable public SDK. The product-facing explanation of app startup and execution paths is in [How Pipelab runs your work](/guide/architecture).

## Workspace boundaries

| Area | Owns |
| --- | --- |
| `apps/desktop` | Electron lifecycle, native dialogs/shell integration, preload bridge, and IPC handlers. It starts the local CLI server process. |
| `apps/ui` | Vue interface, graph editor, Release workflow editor, and browser-side API calls. |
| `apps/cli` | CLI entry point, command registration, and packaged executable bundle. The Node server and execution handlers are implemented in core-node. |
| `packages/core-node` | Node-side context, HTTP/WebSocket server, handlers, build history, persistence, and adapters that host plugins/workflows. |
| `packages/shared` | Shared types, schemas, configuration, plugin definitions, and Release workflow planning/compiler contracts. |
| `packages/workflow-runtime` | Host-abstracted version 1 task execution contracts and runtime. |
| `plugins/*` | Provider-specific plugin definitions and runners. Core-node statically registers the built-in plugin packages. |
| `workers/*`, `supabase/` | Cloudflare Worker APIs and database migrations/functions for cloud services. |

The legacy graph pipeline and the task workflow runtime are separate execution models. Graph actions use the legacy evaluator and plugin action runners. Saved Release workflows are planned/compiled and then executed by the workflow runtime through a core-node task registry; this adapter does not turn them into graph pipelines. See [Workflow runtime](/reference/workflow-runtime).

## Runtime boundaries

The desktop process starts or reuses the CLI sidecar. In production, the server serves bundled UI assets and accepts UI requests over WebSocket. The UI's native operations go through Electron IPC exposed by preload. `pipelab serve` defaults to `127.0.0.1`; remote binding requires authentication in production. The CLI also exposes direct graph pipeline and saved Release workflow commands.

For cloud artifacts, core-node is the client/host adapter, `workers/pipelab-cloud` owns authenticated API validation and signed transfer operations, and Supabase migrations define persisted metadata and cleanup state. Keep credentials and provider-specific request behavior within those owning boundaries.

## Public package imports

Workspace package manifests declare their supported exports. The shared libraries `@pipelab/core-node`, `@pipelab/shared`, and `@pipelab/workflow-runtime` expose the package root (`.`); do not deep-import `src` files or assume undeclared subpaths are supported. For example:

```ts
import { runWorkflow, createLocalHost } from "@pipelab/workflow-runtime";
```

Check the owning package's `package.json`, `src/index.ts`, README, and scripts before changing or consuming an interface. These workspace exports are not evidence of a supported external SDK stability policy.

## Adding or changing behavior

- Put provider-specific node and task behavior in its owning `plugins/plugin-*` package. The core-node plugin registry owns built-in registration.
- Keep shared contracts and schemas in `packages/shared`; keep Node server, persistence, and host adapters in `packages/core-node`.
- Implement generic scheduling/host contracts in `packages/workflow-runtime`; register Pipelab-specific tasks at the core-node boundary.
- Keep cloud HTTP protocol logic in the Worker/client boundary and update the related tests when either side changes.
- Update product documentation with user-visible behavior. Use the package's own tests, typecheck, and build scripts as appropriate.
