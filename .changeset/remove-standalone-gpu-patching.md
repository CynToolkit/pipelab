---
"@pipelab/core-node": major
"@pipelab/shared": major
---

Remove the standalone GPU patching plugin and its **Patch binary** action from the bundled engine and default configuration. Existing pipelines using that action must remove it and enable Electron's **Patch executable** option. Saved pipelines are not automatically converted.
