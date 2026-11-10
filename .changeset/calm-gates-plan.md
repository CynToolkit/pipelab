---
"@pipelab/ui": minor
"@pipelab/shared": minor
"@pipelab/core-node": minor
"@pipelab/providers": minor
"@pipelab/cli": minor
---

feat: preflight checks, host-aware builds, workflow settings and a Plan graph

- Runs check every destination account before the first step and stop if one is definitively rejected (Itch, Poki, Steam). `--skip-preflight` on the CLI and a workflow setting turn it off; dry runs stay offline.
- Builds that cannot run on the host (for example macOS on Linux) are shown as unavailable and left out of runs.
- New Workflow settings page: stop on first failure, retention policy with a live preview and Apply now, desktop notifications.
- Retention is applied at the end of each run and in the background at app start.
- Duplicate a build from the Builds page.
- New Plan tab draws the execution plan as a zoomable, pannable graph.
- The workflow header and tabs stay mounted while you switch tabs; tabs are kept alive, remember their scroll position, and share one workflow document so an edit on one tab is never overwritten by another.
- Artifacts moved under Runs, Settings is a gear in the tab bar, and Ship has a menu with "Ship without checking destinations" (`skipPreflight` on `workflow:execute`) and "View plan".
