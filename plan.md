# PR #95 — Final Cleanup

Goal: finish the last small Phase 4 cleanup without expanding scope.

## 1. Replace the custom lock implementation with `proper-lockfile`

* [x] Add `proper-lockfile` to `@pipelab/core-node`.
* [x] Remove the custom PID/token/stale-lock protocol from `release-persistence-lock.ts`.
* [x] Keep a small `serializeFileMutation()` wrapper around `proper-lockfile`.
* [x] Use centralized options with `realpath: false`, bounded retries, stale timeout, and heartbeat/update interval.
* [x] Keep atomic JSON temp-file + rename writes unchanged.
* [x] Continue locking:

  * `projects.json` for Release/project transactions;
  * each pipeline history file independently.
* [x] Keep the existing real multi-process workflow concurrency test.
* [x] Add one real multi-process BuildHistory test proving two processes can save different runs to the same pipeline without losing either entry.

## 2. Finish the few remaining UI persistence error paths

* [x] Catch failures from pipeline transfer and only close/show success after persistence succeeds.
* [x] Catch persistence failures from pipeline/project/workflow delete confirmation callbacks and show an error toast.
* [x] Handle or remove the unhandled `reloadFiles(true)` call on dashboard mount.
* [x] Do not show success UI after a failed persistence operation.

## 3. Final verification

* [x] Update `plan.md` to describe `proper-lockfile` instead of the custom lock protocol.
* [ ] Make sure CI evidence references the final PR head, not the previous commit.
* [x] Run focused tests for core-node/shared/UI/CLI.
* [x] Run typecheck, lint, build, and `git diff --check`.
* [ ] Push and confirm the full GitHub Actions matrix is green on the exact final head.

### Implementation notes

`serializeFileMutation()` acquires a `proper-lockfile` lock on the target data
file. The shared lock options are `realpath: false`, 10 retries (25–250 ms), a
30-second stale timeout, and a 10-second heartbeat/update interval. Project
index transactions and each individual pipeline history file remain locked for
their complete read-modify-write operation. Build-history JSON continues to be
written to a unique temporary file and atomically renamed into place.

The final CI check must be recorded against the pushed PR head after all source
and plan changes are committed; earlier workflow results are not evidence for
that final head.

Do not touch unrelated legacy Pipeline/SavedFile, runtime, cloud, MCP, DAG, or scheduling code.
