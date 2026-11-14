---
"@pipelab/app": patch
---

Starting the Desktop CLI on a slow Windows machine no longer fails when PowerShell takes more than five seconds to answer: each identity check now has 15 seconds and one retry, and cleanup has 30.
