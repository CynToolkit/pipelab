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
- [ ] Full GitHub Actions test matrix green on Linux, Windows and macOS
- [ ] No build jobs skipped because prerequisite tests failed

Local full-repository verification was rerun under Node 24.19.0 (the repository/CI runtime):
`pnpm test` 17/17 tasks, `pnpm typecheck` 24/24 tasks, `pnpm lint` 26/26 tasks, and
`pnpm build` 25/25 tasks passed. The two remaining items require an external GitHub Actions
run on the matrix hosts.

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
