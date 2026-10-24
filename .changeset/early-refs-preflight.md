---
"@pipelab/workflow-runtime": minor
"@pipelab/core-node": patch
"@pipelab/shared": patch
"@pipelab/providers": patch
---

Preflight run-scoped environment and connection override values before workflow history or runtime setup. Resolve an immutable alias-to-field snapshot for provider tasks, redact resolved values, and pass the initiating client's environment through execution IPC. Let Itch upload tasks consume the run-scoped Itch API key and reject a missing key before Butler setup.
