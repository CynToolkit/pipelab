# Phase 4 — Data Integrity & Schema Hardening

Goal: make persisted data used by the new Release Workflow experience trustworthy and predictable.

Important constraint: persistence validity and release readiness are different things. A structurally valid workflow draft must remain saveable even if it is not ready to Ship. Provider-required fields, missing routing, etc. remain planner/validation issues and must not become persistence errors.

- [x] Create authoritative persisted schemas and parsers for the new Release Workflow data.
  - Define a real versioned ReleaseConfig v3 schema in `packages/shared`.
  - Cover the complete Pipelab-owned structure: top-level config, source envelope, builds, targets, destinations, slots and output refs.
  - Keep provider-owned `config` payloads generic.
  - Require non-empty persisted identity fields and valid booleans/arrays/reference shapes.
  - Reject unsupported ReleaseConfig versions with an actionable error.
  - Preserve existing valid `3.0.0` workflows exactly.
  - Make the schema/parser the source of truth used by `validateReleaseConfigShape`.
  - Validate project/workflow-index and connections schemas at persistence boundaries.
  - Detect duplicate Pipelab-owned IDs.
  - Preserve provider-specific extra connection fields.
  - Do not use full `validateRelease()` as the persistence schema.

- [x] Centralize ReleaseConfig version and creation defaults.
  - Remove duplicated `"3.0.0"` and blank ReleaseConfig construction from `packages/core-node/src/config.ts` and `apps/ui/src/components/ReleaseFlowWizard.vue`.
  - Add one shared `RELEASE_CONFIG_VERSION`.
  - Add a typed ReleaseConfig creation factory for deterministic Pipelab-owned defaults.
  - Continue using provider `createDefaultConfig()` / catalog defaults for provider-owned config.
  - Do not synthesize a fake filesystem workflow when loading a missing workflow.
  - A missing workflow must be treated as `not found`.

- [x] Introduce strict, atomic JSON persistence for new-engine stores without changing legacy Pipeline/SavedFile behavior.
  - Add/reuse a core-node JSON persistence helper using write-to-temp + rename in the same directory.
  - Use it for ReleaseConfig files and release-relevant project/connections persistence.
  - Align with the existing atomic strategy in `BuildHistoryStorage`.
  - Distinguish missing file, malformed JSON, unsupported version, invalid schema and I/O failure.
  - Invalid existing files must stay untouched.
  - Never replace corrupt data with defaults during load.
  - Preserve supported project migrations.
  - Validate migrated output before accepting it.
  - Reject unknown/future versions.
  - Do not globally change legacy `setupPipelineConfigFile*`, `savedFileMigrator`, `processGraph()` behavior.

- [x] Make workflow identity and project references authoritative and impossible to mismatch.
  - Add a domain-level workflow loader/saver based on workflow identity.
  - Derive the canonical workflow file internally instead of trusting arbitrary config filenames.
  - On load/save verify:
    - workflow index entry exists;
    - referenced project exists;
    - workflow config file exists;
    - `ReleaseConfig.id` equals the indexed workflow ID;
    - `ReleaseConfig.project` equals the indexed project;
    - canonical `configName` points to the expected workflow;
    - route/caller project ID matches persisted project ID.
  - Missing, wrong or stale references must return explicit errors.
  - Never silently repair, reassign or recreate broken references.
  - Prevent deleting a project while a new-engine workflow references it.
  - Do not expand these rules into legacy pipeline behavior.

- [x] Make workflow create/save/delete and workflow-index mutations failure-safe.
  - Move coordination between workflow files and `projects.json` behind the core-node/domain boundary.
  - Stop implementing the transaction in `apps/ui/src/store/files.ts`.
  - Creation:
    - validate first;
    - write workflow config;
    - write workflow index;
    - rollback if the second mutation fails.
  - Save:
    - verify existing identity/reference relationship;
    - atomically replace workflow data;
    - update `lastModified` consistently.
  - Delete:
    - do not leave a dangling index entry;
    - do not leave an orphaned config file;
    - use reversible rename/snapshot rollback where needed.
  - Renderer receives one success/error result for the complete operation.

- [x] Stop the UI from hiding persistence corruption or stale references.
  - Do not treat backend load failure as defaults, empty state or success.
  - `apps/ui/src/pages/index.vue` currently silently drops workflows when `workflow:load-by-name` fails: replace this with an explicit broken/error state.
  - `release-flow.vue` must reject a loaded workflow whose ID/project does not match the route.
  - Make config-load errors propagate from `useConfig` instead of leaving default data looking successfully loaded.
  - Keep recovery UX minimal; full recovery UI belongs to later phases.

- [ ] Harden connections persistence while preserving plugin extensibility.
  - Validate connections on both load and save.
  - Enforce version, Pipelab-owned envelope and unique IDs.
  - Reject malformed/unsupported connection files predictably.
  - Retain arbitrary provider credential fields.
  - Do not replace corrupt connections with `defaultConnections` during load.
  - For release fields declared as `type: "connection"`, detect selected connection IDs that:
    - no longer exist;
    - clearly belong to the wrong declared integration.
  - Return validation/reference issues instead of selecting another connection automatically.
  - Do not turn provider internals into shared Pipelab schemas.

- [x] Version and structurally validate persisted workflow run history and artifacts.
  - Replace unchecked `JSON.parse(...) as BuildHistoryEntry[]` with a versioned history document schema.
  - Cover Pipelab-owned:
    - run entries;
    - statuses;
    - steps;
    - errors;
    - logs;
    - deliveries;
    - artifact descriptors;
    - hosted-artifact metadata.
  - Preserve the current raw-array history format through an explicit compatibility/migration reader.
  - Never discard existing valid run history.
  - Reject malformed JSON, malformed-but-valid JSON and unsupported history versions.
  - Keep provider/runtime-owned output and metadata generic where appropriate.
  - Historical workflow/project IDs must not require the current workflow to still exist.

- [x] Remove new-engine fallback identities and untrustworthy persisted metadata during execution.
  - Remove `config.project || config.id`.
  - Remove `config.project || "workflow"`.
  - Require the validated project ID.
  - Execution must load through the same validated workflow/project domain service used by the editor.
  - Ship must not bypass persistence checks.
  - Populate history workflow/project metadata from validated entities.
  - Do not persist fabricated metadata such as `projectName = config.name`.
  - If a legacy history field has no truthful value for release workflows, make it optional/version it rather than inventing data.

- [ ] Tighten Pipelab-owned types without destroying provider/runtime extension points.
  - Remove unjustified broad casts and index signatures at persistence boundaries.
  - Prioritize:
    - ReleaseConfig envelopes;
    - project/workflow references;
    - connections metadata;
    - run history;
    - artifacts.
  - Keep generic records for:
    - provider configs;
    - task `with`;
    - outputs;
    - variables;
    - inspection metadata;
    - other deliberately extensible provider/runtime data.
  - Remove `as ReleaseConfig` / `as BuildHistoryEntry[]` from persistence boundaries.
  - Parsing must perform runtime narrowing.
  - Avoid unrelated cleanup/refactors.

- [ ] Add regression coverage for every Phase-4 acceptance case and run repository-required verification.
  - Shared tests:
    - valid ReleaseConfig v3 round-trip;
    - malformed structure;
    - incomplete structural data;
    - unsupported version.
  - Core-node persistence tests:
    - corrupt JSON without overwrite/default fallback;
    - missing workflow file;
    - stale workflow index → missing file;
    - wrong workflow ID;
    - wrong project ID;
    - missing project;
    - duplicate IDs;
    - atomic write failure;
    - transaction rollback;
    - corrupt connections;
    - valid existing project migrations.
  - History tests:
    - raw-array compatibility/migration;
    - malformed entries;
    - unsupported history version;
    - artifact persistence;
    - interrupted runs.
  - UI tests:
    - failed workflow loads are not silently omitted;
    - failed config loads are not replaced by successful-looking defaults.
  - Integration test:
    - existing valid ReleaseConfig v3 loads;
    - saves;
    - reloads unchanged;
    - executes through the validated persistence boundary.
  - Follow `AGENTS.md` verification rules:
    - focused `@pipelab/shared` tests + typecheck;
    - focused `@pipelab/core-node` tests + typecheck;
    - focused `@pipelab/ui` tests + typecheck;
    - applicable lint/build checks for the cross-package change.
  - Record unavailable checks and why instead of silently skipping them.

## Implementation boundaries

Do not solve this by globally changing the generic migration system and accidentally changing legacy behavior.

The new-engine persistence layer should become strict while the legacy Pipeline / SavedFile / `processGraph()` path stays frozen.

In particular, fix these current problems:
- workflow load currently creates a missing workflow file through `ensure(...)`;
- ReleaseConfig workflow load/save is effectively unvalidated;
- workflow creation updates workflow file and project index separately;
- failed workflow loads are silently hidden on the dashboard;
- project deletion ignores workflows;
- history uses unchecked casts after JSON parsing;
- execution uses fallback project identities;
- ReleaseConfig defaults/version are duplicated.

## Explicitly out of scope

- Legacy Pipeline/SavedFile migration.
- Legacy runtime modernization.
- Persisted release build preferences.
- Release preference UI.
- Remote/local-agent/cloud execution.
- MCP / AI workflow interface.
- Visual DAG editing.
- Triggers/scheduling/unattended automation.
- Runtime redesign not required for correctness.
