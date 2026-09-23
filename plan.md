# PR #95 — Phase 4 Audit Fixes

Goal: bring PR #95 fully in line with the Phase 4 Data Integrity & Schema Hardening plan.

Do not mark this complete until the full repository test matrix is green and all persistence boundaries below are enforced.

## P0 — Fix the broken CLI integration

- [x] Remove all CLI usage of the deleted `setupWorkflowConfigFileByName`.
- [x] Update `apps/cli/src/commands/workflows.ts` to load Release Workflows through the new strict Release Workflow persistence/domain boundary.
- [x] Do not restore the unsafe old helper just to make the CLI compile.
- [x] Make CLI workflow listing use validated ReleaseConfig loading.
- [x] Make CLI lookup-by-name use validated ReleaseConfig loading.
- [x] Make CLI workflow deletion use the same coordinated delete behavior as the desktop/backend.
- [x] Make CLI workflow execution use the same validated persisted entity used by desktop execution.
- [x] Preserve existing CLI behavior where possible.
- [x] Run the CLI E2E suite and confirm the current `setupWorkflowConfigFileByName` import failure is gone.

## P1 — Make file-backed IDs path-safe

- [x] Define one shared validator/helper for persisted IDs that become filesystem paths.
- [x] Reject IDs containing path separators, traversal segments, absolute paths or other unsafe path syntax.
- [x] Apply it to `ReleaseConfig.id`.
- [x] Apply it to workflow IDs in the project/workflow index.
- [x] Apply it to project IDs where those IDs are used as persisted filenames or directory components.
- [x] Ensure existing nanoid-generated IDs remain valid.
- [x] Add tests for:
  - `../connections`
  - `../../foo`
  - `foo/bar`
  - `foo\\bar`
  - absolute paths
  - empty/whitespace IDs
  - normal nanoid IDs

- [x] Prefer IPC/domain APIs based on `workflowId` rather than trusting arbitrary config filenames.

## P1 — Prevent generic project saves from mutating the workflow index

- [x] Make `ReleasePersistence` the only code path allowed to create, update or delete workflow-index entries.
- [x] `projects:save` must not be able to arbitrarily:
  - add workflow entries;
  - delete workflow entries;
  - move workflows between projects;
  - change workflow `configName`;
  - change workflow identity metadata.

- [x] When saving general project changes, preserve the current persisted workflow index or reject attempted workflow-index mutations.
- [x] Continue allowing normal project metadata changes.
- [x] Continue preventing deletion of projects referenced by workflows.
- [x] Add tests proving `projects:save` cannot create stale or mismatched workflow references.

## P1 — Harden workflow transaction/rollback behavior

- [x] On workflow creation, detect if the canonical workflow file already exists while no index entry exists.

- [x] Treat that situation as corrupt/orphaned state.

- [x] Do not overwrite or adopt the orphan automatically.

- [x] Do not delete an existing orphan during rollback.

- [x] Add a regression test for:
  - orphan workflow file exists;
  - no project-index entry exists;
  - create/save is attempted;
  - operation fails explicitly;
  - original file remains byte-for-byte untouched.

- [x] Review workflow delete rollback.

- [x] Rename the workflow file to a reversible tombstone before index mutation.

- [x] Update the index atomically.

- [x] Once the index update succeeds, tombstone cleanup failure must not restore the workflow file and create an orphan.

- [x] Treat tombstone cleanup as cleanup after the committed transaction.

- [x] Ensure an index-write failure restores the workflow file.

- [x] Add tests for index-write failure and tombstone-cleanup failure.

## P1 — Fix run-history compatibility

- [x] Make the history parser accept the actual persisted artifact union.
- [x] Support legacy `Artifact`:
  - `id`
  - `name`
  - `path`
  - `size`
  - `type`
  - optional descriptor/version/cloud/etc. where valid.

- [x] Support Workflow Runtime artifact instances separately.
- [x] Do not require `stepId` and `artifact` for valid legacy `Artifact` entries.
- [x] Validate each union branch explicitly.
- [x] Replace the current fake “legacy artifact” test with a real legacy `Artifact` fixture that has no `stepId` or `artifact`.
- [x] Verify existing valid raw-array history documents continue to load.

## P1 — Validate history before every persisted write

- [x] Validate the complete versioned history document before writing it to disk.
- [x] Apply this to:
  - `save`;
  - `update`;
  - interrupted-run reconciliation;
  - any other mutation path.

- [x] Never allow malformed runtime/IPC data to be persisted and only discovered during the next read.
- [x] Keep atomic temp-file + rename writes.
- [x] Add tests proving malformed updates fail without altering the existing history file.

## P1 — Use one validated Release Workflow load boundary everywhere

- [x] Create/reuse one domain operation that loads:
  - ReleaseConfig;
  - workflow index entry;
  - project;
  - connections;
  - plugin release registry/reference validation.

- [x] Use the same operation from:
  - desktop workflow load;
  - Release Workflow editor;
  - workflow execution;
  - CLI workflow commands.

- [x] Ensure execution validates persisted connection references before planning/running.
- [x] A stale connection ID must prevent execution.
- [x] A connection belonging to the wrong declared integration must prevent execution.
- [x] Do not auto-select or guess another connection.
- [x] Add an execution-level test for stale/wrong connection references.

## P2 — Finish the ReleaseConfig persisted schema

- [x] Make parsing validate the complete Pipelab-owned ReleaseConfig contract.
- [x] Validate optional owned fields when present, including:
  - `description`;
  - build `name`;
  - destination-slot `name`;
  - other optional Pipelab-owned fields.

- [x] Validate output references exactly.
- [x] Reject unexpected/malformed combinations in Pipelab-owned envelopes.
- [x] Keep provider-owned `config` objects extensible/generic.
- [x] Keep provider readiness separate from persistence validity.
- [x] Prefer a real Valibot versioned schema/parser if practical instead of an expanding handwritten validator.

  Reviewed during implementation: the persisted envelope is structurally validated by the
  focused parser while provider-owned `config` objects remain extensible; duplicate-ID,
  exact-reference, and registry-aware checks are cross-field/domain rules. Replacing this
  boundary with a Valibot schema would duplicate those rules without improving the narrowed
  result, so the current parser is the practical choice.
- [x] Remove the final unchecked `as ReleaseConfig` persistence assertion if the schema can return a narrowed type.
- [x] Add malformed optional-field tests.

## P2 — Finish connections schema validation

- [x] Validate `integrationName` when present.
- [x] Preserve provider-owned extra fields.
- [x] Continue detecting duplicate connection IDs.
- [x] Keep connection version errors explicit.
- [x] Add malformed `integrationName` coverage.

## P2 — Make persistence errors actionable

- [x] Do not collapse ReleaseConfig parse failures into only:
      `Workflow '<id>' has invalid persisted data.`
- [x] Surface the useful reason to IPC/UI, including:
  - unsupported version;
  - malformed field/path;
  - missing required identity;
  - invalid reference shape.

- [x] Preserve stable error categories/codes where useful.
- [x] Keep the underlying cause available for logging/debugging.
- [x] Add tests asserting the caller receives useful error details.

## P2 — Fix broken-workflow dashboard rendering

- [x] Fix the dashboard branch where:
  - there are zero valid pipelines;
  - zero valid workflows;
  - one or more broken workflows.

- [x] In that state, broken workflow errors must render.
- [x] Do not show the generic “No pipelines found” state instead.
- [x] Ensure search-result empty state does not hide broken persisted workflows.
- [x] Add a UI test for an all-broken-workflows project.

## P2 — Route reset operations through strict persistence

- [x] Stop `connections:reset` from using the old fallback/direct-write config manager.
- [x] Stop `projects:reset` from using the old fallback/direct-write config manager.
- [x] Perform reset using:
  - strict load;
  - explicit default for the requested key;
  - strict validation;
  - atomic save.

- [x] Corrupt persisted files must not be silently replaced with defaults during reset.
- [x] Keep legacy Pipeline/SavedFile behavior unchanged.

## P2 — Remove fabricated workflow history metadata

- [x] Do not persist `projectPath: ""` purely to satisfy the legacy type.
- [x] Make `projectPath` optional/version-appropriate for Release Workflow history if no truthful value exists.
- [x] Preserve compatibility with existing legacy history entries that have a real project path.
- [x] Ensure `projectName` continues to come from the validated project entity.
- [x] Do not reintroduce fallback project identity values.

## P2 — Tighten persistence-boundary casts

- [x] Remove remaining unjustified persistence casts such as:
  - `as ReleaseConfig`;
  - `as unknown as BuildHistoryEntry`;
  - equivalent unchecked boundary casts.

- [x] Runtime parsers should return properly narrowed values.
- [x] Keep generic types only for genuinely extensible provider/runtime-owned payloads.

## Regression verification

- [x] Add/update ReleaseConfig tests:
  - valid v3 round-trip;
  - unsupported version;
  - malformed optional owned fields;
  - unsafe workflow IDs;
  - malformed output refs;
  - duplicate IDs.

- [x] Add/update ReleasePersistence tests:
  - missing workflow;
  - stale index;
  - wrong workflow ID;
  - wrong project ID;
  - route/project mismatch;
  - unsafe ID;
  - existing orphan file;
  - create rollback;
  - update rollback;
  - delete rollback;
  - tombstone cleanup failure.

- [x] Add/update project persistence tests:
  - duplicate IDs;
  - stale workflow project;
  - project deletion with workflow reference;
  - generic `projects:save` cannot mutate workflow index.

- [x] Add/update connection tests:
  - malformed file;
  - unsupported version;
  - duplicate IDs;
  - malformed `integrationName`;
  - missing selected connection;
  - wrong integration;
  - execution rejects stale connection refs.

- [x] Add/update history tests:
  - legacy raw-array compatibility;
  - versioned-document compatibility;
  - real legacy `Artifact`;
  - Workflow Runtime artifact;
  - malformed artifact;
  - malformed delivery;
  - unsupported history version;
  - invalid update rejected before write;
  - interrupted-run persistence.

- [x] Add/update UI tests:
  - failed workflow load stays visible;
  - all-broken workflow state renders errors;
  - config load failure does not masquerade as defaults;
  - failed load can be retried.

- [x] Add/update CLI E2E coverage:
  - list workflows through strict persistence;
  - lookup by ID/name through strict persistence;
  - dry-run;
  - execute;
  - delete;
  - malformed/stale persisted workflow fails predictably.

## Final verification gate

Do not mark the task complete until all of these pass:

- [x] `pnpm --filter @pipelab/shared test`
- [x] `pnpm --filter @pipelab/core-node test`
- [x] `pnpm --filter @pipelab/ui test`
- [x] CLI E2E tests
- [x] Shared typecheck
- [x] Core-node typecheck
- [x] UI typecheck
- [x] Applicable CLI typecheck
- [x] Applicable lint checks
- [x] Applicable builds
- [x] `git diff --check`
- [x] Full GitHub Actions test matrix green on Linux, Windows and macOS
- [x] No build jobs skipped because prerequisite tests failed

Local full-repository verification was rerun under Node 24.19.0 (the repository/CI runtime):
`pnpm test` 17/17 tasks, `pnpm typecheck` 24/24 tasks, `pnpm lint` 26/26 tasks, and
`pnpm build` 25/25 tasks passed. GitHub Actions run `35839392405` also passed the Linux,
Windows, macOS ARM, and macOS Intel test matrix, Build All, preview publish, and all four
desktop packaging jobs. Deploy and release jobs were skipped by pull-request conditions,
not failed prerequisites.

## Scope guardrails

Do not expand this work into:

- legacy Pipeline/SavedFile migrations;
- `processGraph()` modernization;
- release preference UI;
- cloud/remote execution;
- MCP;
- visual DAG editing;
- triggers/scheduling;
- unrelated runtime refactors.

The objective is to finish Phase 4 correctly, not redesign unrelated legacy systems.

- [x] Re-audit and recheck every verifiable item; leave external CI gates unchecked until independently green.

# PR #95 — Final Phase 4 Audit Fixes

Goal: close the remaining integrity gaps in PR #95 without expanding scope.

Do not stop until every checkbox is complete and the full CI matrix is green.

## P1 — Remove the execution persistence bypass

* [x] Make persisted workflow state the single source of truth for execution.
* [x] `executeWorkflow()` must not validate persisted workflow A and then execute a caller-provided prepared workflow B.
* [x] Remove `options.prepared` from the execution boundary, or otherwise guarantee it was generated from the exact validated persisted config loaded inside `executeWorkflow()`.
* [x] CLI execution must use the same authoritative execution path.
* [x] Desktop execution must use the same authoritative execution path.
* [x] History metadata, project identity, workflow identity and compiled steps must all originate from the same validated persisted entity.
* [x] Add a regression test proving a caller cannot supply a different prepared config than the persisted workflow.
* [x] Keep dry-run planning separate from actual execution if needed.

## P1 — Serialize workflow/project index mutations

* [x] Prevent concurrent Release Workflow mutations from losing `projects.json` updates.
* [x] Serialize all mutations affecting the Release Workflow index, including:

  * workflow create;
  * workflow save;
  * workflow delete;
  * strict project saves that may race with workflow mutations.
* [x] Use one mutation queue/lock keyed by the project-index file or equivalent domain-level coordination.
* [x] Do not rely on atomic rename alone; atomic writes prevent torn files but not lost updates.
* [x] Ensure two concurrent workflow creations preserve both workflow index entries.
* [x] Ensure concurrent workflow save/delete operations cannot orphan workflow files or stale index entries.
* [x] Add regression tests for:

  * concurrent create of workflow A and B;
  * concurrent save/delete;
  * workflow mutation racing with project save.

## P1 — Fix supported project migration compatibility

* [x] Align `parseFileRepo()` with the existing persisted schema/migration contract.
* [x] `pipelines` is historically optional and must default to `[]` when omitted where supported.
* [x] `workflows` must likewise respect its supported optional/default semantics.
* [x] A valid V1/V2 project file must still migrate successfully into valid V3.
* [x] Validate the migrated result after defaults are normalized.
* [x] Do not reject previously valid project data merely because an optional array was omitted.
* [x] Add tests for:

  * [x] V2 without `pipelines`;
  * [x] V2 with pipelines;
  * [x] V3 without optional arrays if supported by the schema;
  * [x] migrated output satisfying the strict parser.

## P1 — Complete BuildHistory persisted validation

* [x] Make the history parser validate the complete Pipelab-owned `BuildHistoryEntry` contract.
* [x] Validate optional entry fields when present:

  * [x] `endTime`;
  * [x] `duration`;
  * [x] `output`;
  * [x] `metadata`.
* [x] Validate the complete `ExecutionStep` contract when fields are present:

  * [x] `uses`;
  * [x] `output`;
  * [x] `destinationId`;
  * [x] `serviceId`;
  * [x] `destinationName`;
  * [x] `slotId`;
  * [x] `artifact`.
* [x] Validate `output` and `metadata` are objects where required by their declared types.
* [x] Validate the complete artifact descriptor:

  * [x] `kind`;
  * [x] `technology`;
  * [x] `platform`;
  * [x] `architecture`;
  * [x] `container`;
  * [x] `format`;
  * [x] `capabilities`.
* [x] Reject malformed descriptor values such as numeric platform/architecture/format.
* [x] Preserve deliberately extensible runtime/provider metadata only where the type explicitly permits it.
* [x] Continue accepting both:

  * [x] legacy `Artifact`;
  * [x] `WorkflowArtifactInstance`.
* [x] Keep raw-array history compatibility.
* [x] Add malformed-but-valid-JSON regression tests for every newly validated optional field.

## P1 — Stop UI config persistence from silently succeeding offline

* [x] `useConfig.load()` must not silently return defaults as though a successful persisted load occurred when the API is disconnected.
* [x] Expose an explicit load error/unavailable state instead.
* [x] `useConfig.save()` must not update local state and resolve successfully when persistence could not occur.
* [x] A failed save must reject and leave the caller aware that data was not persisted.
* [x] Review `useFiles.update()` so local project state is not permanently committed before persistence succeeds.
* [x] Either:

  * [x] persist first and update local state after success; or
  * [x] optimistically update but rollback on failure.
* [x] Await `update()` in callers where persistence completion matters.
* [x] Ensure project deletion, project creation, pipeline transfer and other project mutations cannot appear successful while disk persistence failed.
* [x] Add tests for:

  * [x] disconnected config load;
  * [x] disconnected config save;
  * [x] project save failure;
  * [x] optimistic update rollback or delayed local commit.

## P2 — Make ReleaseConfig output references exact everywhere

* [x] Use one authoritative `ReleaseOutputRef` validator.
* [x] Apply it to:

  * [x] build input;
  * [x] build target input if supported;
  * [x] destination slot input.
* [x] Accept only:

  * [x] `{ source: true }`;
  * [x] `{ buildId: string, targetId: string }`.
* [x] Reject extra keys.
* [x] Reject mixed source/build references.
* [x] Reject incomplete build refs.
* [x] Add tests for:

  * [x] `{ source: true, extra: 1 }`;
  * [x] `{ source: true, buildId: "x", targetId: "y" }`;
  * [x] `{ buildId: "x" }`;
  * [x] valid source ref;
  * [x] valid build ref.

## P2 — Validate workflow-index owned fields completely

* [x] Make `parseFileRepo()` validate `workflow.type === "internal-workflow"`.
* [x] Validate all other Pipelab-owned workflow index fields before narrowing to `FileRepo`.
* [x] Do not rely on a TypeScript assertion for fields the runtime parser did not check.
* [x] Add malformed workflow `type` coverage.

## P2 — Do not convert BuildHistory I/O failures into empty history

* [x] Update `getAllPipelineFiles()` so only genuinely missing directories/files are treated as empty state.
* [x] Propagate permission errors, device errors and other unexpected filesystem failures.
* [x] Do not return `[]` for arbitrary exceptions.
* [x] Add a regression test for a simulated non-ENOENT filesystem failure.

## P2 — Make post-commit workflow delete cleanup semantics accurate

* [x] Treat workflow deletion as committed once:

  * [x] the workflow file has been tombstoned;
  * [x] the project index has successfully removed the workflow entry.
* [x] Tombstone cleanup failure after that commit must not report that the delete transaction itself failed.
* [x] Log/surface cleanup failure separately if useful.
* [x] Do not restore the workflow after the index commit.
* [x] Ensure retry behavior is predictable.
* [x] Add a test proving:

  * [x] index mutation succeeds;
  * [x] tombstone deletion fails;
  * [x] workflow remains deleted;
  * [x] API does not falsely report an uncommitted deletion.

## P2 — Make persisted IDs cross-platform filename-safe

* [x] Harden `isSafePersistedId()` for all supported desktop platforms.
* [x] Reject characters invalid in Windows filename components, including at least:

  * [x] `<`
  * [x] `>`
  * [x] `:`
  * [x] `"`
  * [x] `|`
  * [x] `?`
  * [x] `*`
* [x] Reject Windows reserved device names such as:

  * [x] `CON`
  * [x] `PRN`
  * [x] `AUX`
  * [x] `NUL`
  * [x] `COM1`–`COM9`
  * [x] `LPT1`–`LPT9`
* [x] Reject trailing dots/spaces where they would produce invalid/ambiguous filenames.
* [x] Preserve existing valid nanoid/project IDs.
* [x] Add cross-platform persisted-ID tests.

## Process — Add release tracking if required

* [x] Review the repo changeset requirement for this PR.
* [x] If these exported/public package behavior changes require release tracking, add an appropriate changeset for affected public packages such as:

  * [x] `@pipelab/shared`;
  * [x] `@pipelab/core-node`.
* [x] Keep the changeset focused on the user-visible/public API impact.
* [x] Do not manually change package versions.

## Regression verification

* [x] Add execution-boundary test preventing mismatched prepared workflow execution.
* [x] Add concurrent workflow mutation tests.
* [x] Add project migration compatibility tests.
* [x] Add complete BuildHistory malformed-field tests.
* [x] Add offline/disconnected config persistence tests.
* [x] Add exact ReleaseOutputRef tests.
* [x] Add workflow-index `type` validation test.
* [x] Add unexpected history filesystem-error test.
* [x] Add post-commit tombstone cleanup test.
* [x] Add Windows-safe ID tests.

## Final verification gate

Do not mark this complete until all of these pass:

* [x] `pnpm --filter @pipelab/shared test`
* [x] `pnpm --filter @pipelab/core-node test`
* [x] `pnpm --filter @pipelab/ui test`
* [x] `pnpm --filter @pipelab/cli test`
* [x] shared typecheck
* [x] core-node typecheck
* [x] UI typecheck
* [x] CLI typecheck
* [x] applicable lint checks
* [x] applicable builds
* [x] `git diff --check`
* [ ] full GitHub Actions test matrix green on Linux, Windows and macOS
* [ ] Build All green
* [ ] desktop packaging jobs green
* [ ] no test/build job skipped because of a failed prerequisite

## Scope guardrails

Do not expand this pass into:

* legacy Pipeline/SavedFile migration redesign;
* `processGraph()` modernization;
* release preference UI;
* cloud/remote execution;
* MCP;
* visual DAG editing;
* triggers/scheduling;
* unrelated runtime refactors.

Keep the implementation narrowly focused on closing the remaining Phase 4 integrity gaps.
