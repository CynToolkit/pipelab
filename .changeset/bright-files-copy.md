---
"@pipelab/core-node": patch
"@pipelab/plugin-construct": patch
"@pipelab/plugin-filesystem": patch
"@pipelab/workflow-runtime": patch
---

Move Release Folder and ZIP providers into core so Release no longer depends on the Filesystem plugin. Generic filesystem and archive operations run as core workflow tasks. Keep `plugin-filesystem` for legacy Pipeline compatibility, and export reusable safe copy and remove helpers from `workflow-runtime`.
