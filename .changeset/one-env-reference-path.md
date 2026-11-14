---
"@pipelab/core-node": patch
"@pipelab/providers": patch
"@pipelab/ui": patch
"@pipelab/workflow-runtime": patch
---

Desktop forwards exactly the environment variables a run resolves (embedded references included), using the same plan as the run; the UI no longer keeps its own list. Steam and itch.io ID validation ignores `${{ env.X }}` bindings, which are resolved at run time.
