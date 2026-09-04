---
"@pipelab/ui": minor
"@pipelab/shared": minor
---

feat: add Paths — a beginner-friendly shipping companion UI

Replace the dead simple-editor with a new Path Builder screen:
- Source card at the top (engine type + folder + last export)
- Per-destination rows with delivery selector (App/Web/Archive) and Ship button
- Add/remove destinations via inline sheets, no navigation
- Credentials inline on first use, keychain-referenced
- Ship All button for parallel shipping
- Destination states: ready, shipping (progress), shipped (timestamp), failed (retry/skip), skipped

New path data model in shared (Source, Destination, Path, RunState types).
Old plugin-based pipeline remains functional; Paths is a parallel entry point.
