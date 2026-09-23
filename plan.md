# PR #95 — Strict History Final Fix

Goal: keep BuildHistory strict, make the runtime stop producing invalid delivery records, and delete incompatible local dev history for this session.

## 1. Keep the persisted schema strict

* [x] Keep `delivery.artifactId` required and non-empty in `parseBuildHistoryDocument()`.
* [x] Do not add compatibility for `artifactId: ""`.
* [x] Do not silently repair malformed persisted history.

## 2. Fix the workflow runtime producer

The runtime currently creates delivery results with `artifactId: ""` when no artifact was resolved.

* [x] Remove all production of empty-string `artifactId`.
* [x] A completed delivery must always contain a real non-empty artifact ID.
* [x] A failed delivery should only contain a delivery result when a real artifact was resolved.
* [x] If a delivery step is skipped/blocked before an artifact exists, do not fabricate a delivery record with an empty artifact ID.
* [x] Preserve the failure/skipped information on the workflow step itself.
* [x] Ensure every `WorkflowDeliveryResult` emitted by `runWorkflow()` satisfies the strict persisted BuildHistory parser.

Add focused tests:

* [x] successful delivery → non-empty `artifactId`.
* [x] delivery fails after resolving an artifact → non-empty `artifactId`.
* [x] delivery skipped because its producer failed → no invalid delivery with `artifactId: ""`.
* [x] feed runtime-generated delivery results through `parseBuildHistoryDocument()` and confirm they parse.

## 3. Delete incompatible local history for this dev session

This is local cleanup only, not a product migration.

* [x] Locate the history file reported by the error for pipeline `main`.
* [x] Delete that offending `main.history.json`.
* [x] Inspect the local history directory for other existing `*.history.json` files.
* [x] Delete any other local history file that does not pass the current strict parser (none found).
* [x] Do not add automatic deletion of corrupt/incompatible history to production code.
* [x] Do not add a migration for these local dev files.
* [x] Restart the local backend and confirm startup reconciliation succeeds.

Be conservative: delete only BuildHistory files that are incompatible with the current strict schema.

## 4. Also finish the pending connections initialization race

* [x] Change missing `connections.json` initialization to use `writeJsonFileAtomicallyIfMissing()`.
* [x] If another process creates the file first, re-read and strictly parse it instead of overwriting it.
* [x] Add the focused race regression test.

## 5. Final gate

* [x] shared tests
* [x] workflow-runtime tests
* [x] core-node tests
* [x] UI/CLI tests if affected (CLI suite passed; UI is unaffected)
* [x] typecheck
* [x] lint
* [x] build
* [x] `git diff --check`
* [x] restart the local dev stack with the cleaned history directory
* [x] execute a workflow with a successful delivery and verify history reloads
* [x] execute a workflow with a failed/skipped delivery and verify history reloads
* [x] push
* [x] confirm GitHub Actions is green on the exact final PR head

Do not weaken the strict BuildHistory schema and do not introduce automatic production cleanup for incompatible history.
