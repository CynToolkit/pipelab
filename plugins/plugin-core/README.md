# @pipelab/plugin-core

Shared utilities for Pipelab plugins, including filesystem, archive, process,
and bundled asset helpers. Workflow execution uses native `WorkflowTask`
implementations from `@pipelab/workflow-runtime`.

## Dependency ownership

This existing helper package sits below built-in providers. It has no dependency
on `@pipelab/core-node`; providers receive a structural `ProviderHostContext`.
The host implements that contract without exposing its server or lifecycle.

| Capability | Category | Owner |
| --- | --- | --- |
| `fetchPackage`, npm cache resolution and offline fallback | Generic execution utility | This package |
| `downloadFile`, progress and cancellation | Generic execution utility | This package |
| `runPnpm`, `runWithLiveLogs`, process hooks | Generic execution utility | This package |
| Filesystem and archive helpers used by providers | Generic execution utility | This package |
| Construct web export detection | Provider utility | `providers/src/web-runtime.ts` |
| SteamCMD, Butler, Cargo and provider templates | Provider utility | Owning provider folder |
| Node/pnpm installation, startup progress | Host service | `core-node` |
| Bundled asset location and desktop/CLI layout | Host service | `core-node`, through `context.resolveBundledAsset` |
| Managed temporary, cache, package and connection paths | Host service | `core-node`, through context path methods |
| Cancellation-aware artifact ZIP tasks | Host service | `core-node` |

`resolveBundledAsset(name, context)` delegates to the supplied host. No provider
loads core-node to find assets or ensure executables. Core-node retains its
existing helper exports for callers. The legacy `PipelabContext` type export
here is an alias for the structural provider host contract.
