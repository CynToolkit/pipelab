---
"@pipelab/providers": minor
"@pipelab/core-node": patch
"@pipelab/cli": patch
---

Consolidate the seven built-in provider workspaces into `@pipelab/providers`, with isolated provider modules and tests. Workspace imports use the new package; saved provider, Release, task, and integration IDs remain unchanged, so Release configurations need no migration.
