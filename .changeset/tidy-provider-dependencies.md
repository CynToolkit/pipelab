---
"@pipelab/plugin-core": minor
"@pipelab/providers": patch
"@pipelab/core-node": patch
"@pipelab/cli": patch
---

Remove provider imports of core-node by placing reusable package, download and
process helpers in the existing helper package. Supply managed paths, executable
installation and bundled asset resolution through a structural host context.
Provider, Release and Workflow IDs remain unchanged.
