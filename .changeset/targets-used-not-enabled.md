---
"@pipelab/shared": minor
"@pipelab/core-node": minor
"@pipelab/providers": patch
"@pipelab/ui": minor
"@pipelab/cli": minor
---

Release builds no longer have enabled/disabled targets or a build on/off switch: every target an engine offers is listed with its own settings, and a target is used when a deployment slot or another build reads it. Deployment slots and Bundle inputs can pick any target of an existing build. Build engines can no longer be changed after creation. Empty deployment slots are filled only when a workflow is created and are never filled again at plan or run time.
