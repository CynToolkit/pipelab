---
"@pipelab/plugin-core": major
"@pipelab/providers": patch
"@pipelab/core-node": patch
"@pipelab/cli": patch
---

Remove provider imports of core-node by placing reusable package, download and
process helpers in the existing helper package. Supply managed paths, executable
installation and bundled asset resolution through a structural host context.
Provider, Release and Workflow IDs remain unchanged.

This is an intentional breaking cleanup of the legacy/internal plugin-core helper
API: `PipelabContext` is now a provider-facing structural `ProviderHostContext`
type alias, not the concrete core-node class. `resolveBundledAsset(name, context)`
requires an explicit host context, and `detectRuntime` and its `OutputRuntimes`
type are no longer exported from plugin-core; web runtime detection belongs to
providers. No hidden core-node
loading or new compatibility layer is introduced.
