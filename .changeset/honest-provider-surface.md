---
"@pipelab/shared": minor
"@pipelab/core-node": minor
"@pipelab/cli": patch
"@pipelab/ui": patch
"@pipelab/providers": patch
"@pipelab/plugin-core": patch
---

Remove obsolete plugin marketplace APIs, dynamic registration state and ineffective
provider enablement controls. Migrate settings to schema 8 while preserving real
preferences and saved connections. Built-in providers ship together with Pipelab;
integrations configure credentials and accounts on the Connections screen in shipped builds. Provider, Release and task IDs
remain unchanged.
