# PR #95 — Final Remaining Phase 4 Goals

Goal: close the last persistence-integrity gaps found in the full PR audit.

Do not stop until every applicable checkbox is complete and the current PR head passes the full verification gate.

## P1 — Make strict project migration reject corrupt legacy input

* [x] Harden `loadStrictProjects()` so it validates the raw project document against the schema for its declared version before migration.
* [x] Do not change the generic legacy migrator behavior globally.
* [x] Keep the strictness local to the new strict project persistence boundary.
* [x] For `1.0.0`, validate the actual V1 shape before running the V1→V2 migration.
* [x] For `2.0.0`, validate the actual V2 shape before running the V2→V3 migration.
* [x] For `3.0.0`, validate the V3 shape directly.
* [x] Reject unknown/future versions explicitly.
* [x] After migration, always validate the normalized V3 result with `parseFileRepo()`.
* [x] A malformed legacy document must never be converted into an empty/default-looking valid project index.

Add regression coverage for:

* [x] V1 with valid `data`.
* [x] V1 with `data: null` → reject.
* [x] V1 with malformed pipeline entries → reject.
* [x] V2 with omitted optional `pipelines` → migrate successfully.
* [x] V2 with malformed `projects` → reject.
* [x] V3 with omitted supported optional arrays → normalize successfully.
* [x] unsupported future version → reject with actionable error.
* [x] corrupt source file remains untouched after failure.

## P1 — Surface project/config load failures at the application level

* [x] Do not allow `App.vue` to catch initial persistence load failures and then continue rendering normal application content from in-memory defaults.
* [x] Introduce an explicit initial-data failure state.
* [x] Distinguish at minimum:

  * backend disconnected;
  * projects/config load failure;
  * connections load failure;
  * other initial-data failure.
* [x] Do not set the application into a normal loaded state when required persisted data failed to load.
* [x] Show an actionable UI error instead of presenting `defaultFileRepo` / `defaultConnections` as if they came from disk.
* [x] Preserve retry capability.
* [x] A successful retry should replace the error state and load real persisted data.

Add UI tests for:

* [x] corrupt `projects.json` load failure.
* [x] corrupt `connections.json` load failure.
* [x] failed initial load does not render normal persisted project state.
* [x] retry after a transient load failure succeeds.

## P1 — Await every project-index mutation that affects user-visible state

Audit all `updateFileStore(...)` calls in the dashboard and related project/pipeline flows.

* [x] `await updateFileStore(...)` when creating a project.
* [x] Do not close the create-project modal or select the new project until persistence succeeds.
* [x] `await updateFileStore(...)` when renaming a project.
* [x] Do not close the rename modal until persistence succeeds.
* [x] Await pipeline-index mutations after pipeline creation.
* [x] Await pipeline migration index updates.
* [x] Await imported-pipeline index updates.
* [x] Audit all other `updateFileStore(...)` calls and await them wherever subsequent UI state assumes persistence succeeded.
* [x] Failed writes must not produce success toasts.
* [x] Failed writes must not navigate/select/close UI as though the mutation succeeded.
* [x] Surface persistence failures through the existing toast/error UX.

Add tests proving:

* [x] project create failure leaves UI/project list unchanged.
* [x] project rename failure leaves original name visible.
* [x] pipeline index save failure does not report successful creation/import/migration.

## P1 — Decide and enforce the cross-process persistence model

The current mutation queues are process-local.

First make the supported behavior explicit.

Supported: yes. Multiple Pipelab processes may mutate one user-data directory;
project-index transactions and per-pipeline history mutations use cross-process
lockfiles. Stale locks fail closed with recovery instructions rather than being
removed automatically.

* [x] Determine whether simultaneous access to the same user-data directory by:

  * desktop backend / `pipelab serve`;
  * standalone CLI workflow commands;
  * another Pipelab process
    is supported.

If concurrent multi-process access **is supported**:

* [x] Replace or augment process-local workflow/project locking with a cross-process persistence strategy.
* [x] Use a filesystem lock, lockfile protocol, optimistic revision/CAS, or another robust cross-process mechanism.
* [x] Coordinate `projects.json` read-modify-write operations across processes.
* [x] Ensure two processes creating different workflows cannot lose one workflow-index entry.
* [x] Ensure workflow create/delete/save cannot race with project saves across processes.
* [x] Apply equivalent protection to BuildHistory files if multiple processes can mutate the same history.
* [x] Handle stale/crashed locks safely.
* [x] Add multi-process integration coverage where practical.

The unsupported single-writer alternative is not selected; the supported
multi-process behavior above is implemented.

## P2 — Make workflow persistence validation independent of plugin startup races

* [x] Ensure `workflow:load` cannot perform registry-dependent connection validation against a partially initialized plugin registry.
* [x] Ensure `workflow:save` cannot perform registry-dependent connection validation against a partially initialized plugin registry.
* [x] Ensure execution continues to wait for complete plugin readiness.
* [x] Prefer one explicit ready registry/dependency passed into the Release Workflow persistence/domain boundary.
* [x] Alternatively, make workflow load/save handlers await the same plugin initialization promise used by execution.
* [x] Do not rely solely on the official UI waiting for `startup:progress = done`; the backend boundary itself must be correct.

Add a regression test proving:

* [x] a workflow request issued before plugin initialization completes cannot silently skip integration validation.
* [x] the same request after plugin readiness validates connection integration correctly.

## P2 — Remove or implement ignored build-target input semantics

Currently `ReleaseBuildTargetConfig.input` is persisted and validated but the planner does not consume it.

Choose one behavior and make the contract consistent.

Preferred Phase 4 option:

* [x] Remove `input?: ReleaseOutputRef` from `ReleaseBuildTargetConfig`.
* [x] Remove target-input persistence validation.
* [x] Reject persisted target-level `input` as unsupported if strict owned-key validation requires it.
* [x] Keep build-profile input as the authoritative build input mechanism.

Target-specific inputs are not selected; the preferred removal and rejection
behavior above is implemented.

Do not leave a persisted Pipelab-owned field whose semantics are silently ignored.

## P2 — Reject non-finite persisted BuildHistory numbers

* [x] Replace persisted numeric validation based only on `typeof value === "number"` with finite-number checks where appropriate.
* [x] Reject:

  * `NaN`;
  * `Infinity`;
  * `-Infinity`.
* [x] Apply this to persisted numeric fields including:

  * timestamps;
  * durations;
  * counters;
  * artifact sizes;
  * delivery timing fields;
  * log timestamps;
  * error timestamps.
* [x] Preserve legitimate zero and negative values only where the domain type intentionally permits them.
* [x] Ensure no value can pass validation and then become `null` during `JSON.stringify()`.

Add regression tests for:

* [x] `startTime: NaN`.
* [x] `duration: Infinity`.
* [x] artifact `size: NaN`.
* [x] delivery duration/timestamps with non-finite values.
* [x] invalid history write leaves the previous file unchanged.

## P2 — Surface workflow-load failures on the runs page

* [x] In `workflow-runs.vue`, handle `workflow.type === "error"`.
* [x] Display the workflow load error instead of silently ignoring it.
* [x] Do not continue presenting the run page as a healthy workflow when the persisted workflow is missing/corrupt/mismatched.
* [x] Preserve history errors independently if both workflow and history loads fail.
* [x] Avoid scheduling misleading automatic refresh behavior when the workflow itself cannot be loaded.

Add UI/state coverage for:

* [x] history succeeds but workflow load fails.
* [x] workflow route/project identity mismatch.
* [x] corrupt workflow.
* [x] successful retry if the persisted workflow becomes valid again.

## Regression re-audit

After implementing the above, recheck that the previously fixed Phase 4 invariants remain true:

* [x] missing workflow never creates a file.
* [x] orphan workflow file is never overwritten.
* [x] project/workflow/file IDs must match.
* [x] generic project save cannot modify workflow index entries.
* [x] project deletion is blocked when workflows reference it.
* [x] stale connection references block workflow execution.
* [x] wrong-integration connections block workflow execution.
* [x] execution always compiles from the validated persisted workflow.
* [x] history supports real legacy artifacts.
* [x] history is validated before every write.
* [x] corrupt history is never replaced with defaults.
* [x] strict connection loading never falls back from corrupt data.
* [x] Release output references remain exact.
* [x] persisted IDs remain cross-platform filename-safe.
* [x] dashboard broken workflows remain visible.
* [x] disconnected `useConfig` loads/saves reject explicitly.
* [x] `useFiles.update()` remains persistence-first.
* [x] changeset remains present and accurate.

## Final verification gate

Do not mark this task complete until all applicable checks are green on the final commit:

* [x] `pnpm --filter @pipelab/shared test`
* [x] `pnpm --filter @pipelab/core-node test`
* [x] `pnpm --filter @pipelab/ui test`
* [x] `pnpm --filter @pipelab/cli test`
* [x] shared typecheck
* [x] core-node typecheck
* [x] UI typecheck
* [x] CLI typecheck
* [x] repository lint
* [x] repository build
* [x] `git diff --check`
* [x] Linux test matrix
* [x] Windows test matrix
* [x] macOS ARM test matrix
* [x] macOS Intel test matrix
* [x] Build All
* [x] desktop Linux packaging
* [x] desktop Windows packaging
* [x] desktop macOS ARM packaging
* [x] desktop macOS Intel packaging
* [x] no relevant job skipped because of a failed prerequisite

CI evidence: Pipeline run [35862033504](https://github.com/CynToolkit/pipelab/actions/runs/35862033504)
passed on source commit `a19c86168e9e5d64d52df265d093c21efe6cc5e5`. All matrix,
Build All, and four desktop packaging jobs completed successfully. Deploy and
release jobs were conditionally skipped for this pull request.

## Scope guardrails

Do not expand this pass into:

* legacy Pipeline/SavedFile runtime modernization;
* global migration-framework redesign;
* `processGraph()` changes;
* Release preference UI;
* cloud execution;
* MCP;
* DAG editor work;
* scheduling/triggers;
* unrelated plugin refactors;
* unrelated persistence cleanup.

The goal is to finish Phase 4's data-integrity guarantees, not broaden the project scope.
