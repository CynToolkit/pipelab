---
"@pipelab/shared": patch
"@pipelab/workflow-runtime": minor
---

Expose workflow task IDs through a browser-safe entry point so shared release compilation does not load the Node.js process host in Desktop's renderer.
