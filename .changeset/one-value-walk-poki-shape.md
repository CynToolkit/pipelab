---
"@pipelab/shared": patch
"@pipelab/core-node": patch
"@pipelab/ui": patch
"@pipelab/providers": patch
---

A run's environment bindings and Connections now come from one shared walk of what the workflow uses, in core and in the UI; a build nothing reads no longer contributes values. The Poki game check reports a pass only for the answer shape it recognizes.
