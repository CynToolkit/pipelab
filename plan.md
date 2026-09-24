# PR #97 — Remove Legacy Identity from New Release Workflows

The new Release Workflow system is unreleased, so do **not** preserve legacy Filesystem plugin identities inside it.

Legacy compatibility should exist only for the old Pipeline/SavedFile system.

## Goal

Reach a clean separation:

```text
New Release Workflow
├── core Release providers
├── core workflow primitives
└── plugin providers such as Construct / Electron / Steam

Legacy Pipeline
└── plugin-filesystem legacy nodes
```

The new Release system should contain **no `@pipelab/plugin-filesystem/...` provider or task IDs**.

Do not add migrations for unreleased Release workflow data.

---

## 1. Give built-in Release providers clean core IDs

Replace the compatibility IDs currently used by the new built-ins.

Do not use:

```text
@pipelab/plugin-filesystem/folder-source
@pipelab/plugin-filesystem/web-folder-source
@pipelab/plugin-filesystem/zip-source
@pipelab/plugin-filesystem/web-zip-source

@pipelab/plugin-filesystem/folder-destination
@pipelab/plugin-filesystem/zip-destination
```

Use core-owned IDs instead.

Suggested naming:

```text
@pipelab/core/source/folder
@pipelab/core/source/web-folder
@pipelab/core/source/zip
@pipelab/core/source/web-zip

@pipelab/core/destination/folder
@pipelab/core/destination/zip
```

These are new Release providers, not compatibility aliases.

Update:

* built-in definitions;
* defaults;
* tests;
* CLI fixtures;
* UI/catalog expectations;
* examples and docs;
* any persisted test fixtures.

Do not support both old and new Release IDs.

The Release Workflow feature is unreleased, so old Release IDs can simply disappear.

---

## 2. Clean up internal workflow task IDs as well

Avoid carrying historical filesystem-plugin naming into newly compiled workflows.

Current new-engine IDs such as:

```text
filesystem:copy
filesystem:remove
filesystem:zip
filesystem:unzip
```

should move to an explicitly core-owned namespace.

Suggested:

```text
@pipelab/core/fs/copy
@pipelab/core/fs/remove

@pipelab/core/archive/zip
@pipelab/core/archive/unzip

@pipelab/core/passthrough
```

Keep these centralized in `CORE_WORKFLOW_TASKS` or an equivalent authoritative definition.

Do not scatter literal task IDs across producers/plugins.

For example Construct should reference the authoritative core unzip task rather than hardcoding another filesystem identity.

The compiled new workflow should look conceptually like:

```text
@pipelab/plugin-construct/export-construct-project
                  ↓
@pipelab/core/archive/unzip
                  ↓
@pipelab/plugin-electron/electron:package:v2
```

That clearly distinguishes:

* provider-specific plugin behavior;
* generic core workflow behavior.

---

## 3. Keep `plugin-filesystem` entirely legacy

`@pipelab/plugin-filesystem` remains only because old Pipeline/SavedFile documents may reference its nodes.

Keep exactly the legacy identities required there:

```text
fs:copy
fs:remove
fs:run
unzip-file-node
zip-node
zip-v2-node
fs:open-in-explorer
```

Do not expose Release definitions from this package.

Do not make new Release compilation depend on any of its runners.

Do not reuse its IDs in new workflows.

Conceptually:

```text
plugins/plugin-filesystem
└── old Pipeline compatibility only
```

Its README/package description should make that explicit.

When old Pipeline support is eventually removed, this entire package can be deleted.

---

## 4. New Release must work without `plugin-filesystem`

Add an explicit architectural test proving this.

Given a Release registry containing **no Filesystem plugin**:

```text
buildCoreReleaseRegistry([])
```

it must still provide:

```text
Folder source
Web Folder source
ZIP source
Web ZIP source

Folder destination
ZIP destination

automatic unzip
passthrough
```

And these definitions must all use core IDs.

Also verify a Release can compile and execute with no `plugin-filesystem` Release dependency.

---

## 5. Keep provider plugins provider-specific

Real integrations remain plugins.

Examples:

```text
Construct source
→ @pipelab/plugin-construct/source

Godot source/build
→ @pipelab/plugin-godot/...

Electron build
→ @pipelab/plugin-electron/...

Steam upload
→ @pipelab/plugin-steam/...
```

Generic infrastructure should not become fake plugins merely because the existing plugin system can represent it.

The distinction should be:

```text
core
  generic execution/building blocks

plugins
  integrations with a particular engine/platform/service
```

---

## 6. Preserve the primitive layer for future hooks

Do not implement hooks yet.

But keep the generic task layer suitable for future lifecycle hooks such as:

```text
before source
after source

before build
after build

before upload
after upload
```

Future hooks may need:

```text
copy
remove
zip
unzip
run command
```

They should call the same core workflow primitives.

Do not route future hooks through `plugin-filesystem`.

Also, `Run Command` should eventually be treated as a generic workflow primitive rather than a filesystem concept.

No hook schema, persistence, UI, or lifecycle execution should be added in PR #97.

---

## 7. Fix core unzip cancellation

While finishing this refactor, fix the cancellation regression found in the audit.

`filesystem:unzip` / its renamed core equivalent currently calls:

```ts
await extractZip(file, output);
```

without propagating the workflow `AbortSignal`.

Update the ZIP extraction primitive to:

* accept an optional `AbortSignal`;
* stop/close ZIP processing on abort;
* stop the active stream if necessary;
* reject with an `AbortError`;
* clean up listeners reliably.

Pass:

```ts
context.signal
```

from the core unzip workflow task.

Add focused cancellation coverage.

ZIP and unzip should follow the same cancellation contract.

---

## 8. Do not preserve unreleased Release compatibility

Specifically remove the assumption from the current PR that these IDs need persisted compatibility:

```text
@pipelab/plugin-filesystem/*-source
@pipelab/plugin-filesystem/*-destination
```

They do not.

We only need compatibility for **released legacy Pipeline/SavedFile data**.

Do not add:

* ReleaseConfig aliases;
* ReleaseConfig migrations;
* fallback lookup of old Release provider IDs;
* dual registration of legacy/new Release providers.

We want one clean model before Release Workflow ships.

---

## 9. Tests

### Core Release registry

* [x] built-in source IDs all use `@pipelab/core/...`;
* [x] built-in destination IDs all use `@pipelab/core/...`;
* [x] automatic producer IDs are core-owned;
* [x] no Release definition contains `@pipelab/plugin-filesystem`;
* [x] registry works with no Filesystem plugin registered.

### Compilation

* [x] Folder source compiles to core copy task;
* [x] Web Folder source compiles to core copy task;
* [x] ZIP source compiles to core copy task;
* [x] Folder destination compiles to core copy task;
* [x] ZIP destination compiles to core ZIP task;
* [x] Web ZIP → automatic unzip → Electron uses core unzip;
* [x] Construct extraction uses core unzip;
* [x] passthrough uses core passthrough.

### Execution

Keep execution/integration scenarios in:

```text
apps/cli/tests/e2e
```

Verify:

* [x] Folder → Folder executes;
* [x] Folder → ZIP executes;
* [x] Web ZIP → unzip → downstream build executes;
* [x] cancellation during unzip aborts predictably.

### Legacy

* [x] `plugin-filesystem.release` remains undefined;
* [x] old Pipeline node IDs remain registered with their existing runners;
* [x] no legacy Pipeline IDs are renamed.

---

## 10. Remove unnecessary integration tests from package-local suites

Follow `AGENTS.md`.

Keep package-local tests for genuine unit concerns such as:

* registry composition;
* ID ownership;
* primitive behavior;
* filesystem safety;
* cancellation helpers.

Keep workflow/planner/compiler execution integration in:

```text
apps/cli/tests/e2e
```

Do not duplicate full Release execution scenarios under `packages/core-node`.

---

## 11. Changeset

Update the existing changeset to describe the final architecture.

It should communicate that:

* Release Folder/ZIP providers are now core built-ins;
* Release no longer depends on the Filesystem plugin;
* generic filesystem/archive primitives are core workflow tasks;
* `plugin-filesystem` remains for legacy Pipeline compatibility.

Because Release Workflow is unreleased, do not describe the new core IDs as a migration or compatibility rename.

---

## 12. Verification

Run focused checks, then:

```text
pnpm --filter @pipelab/workflow-runtime test
pnpm --filter @pipelab/workflow-runtime typecheck

pnpm --filter @pipelab/core-node test
pnpm --filter @pipelab/core-node typecheck

pnpm --filter @pipelab/plugin-filesystem test
pnpm --filter @pipelab/plugin-filesystem typecheck

pnpm --filter @pipelab/plugin-construct test
pnpm --filter @pipelab/plugin-construct typecheck

pnpm --filter @pipelab/cli test

pnpm lint
pnpm typecheck
pnpm build

git diff --check
```

Then confirm exact-head CI is green.

- [ ] Exact-head CI is green on the final PR head.

---

## Scope

Do not:

* implement hooks;
* add compatibility for unreleased Release Workflow IDs;
* add a ReleaseConfig migration for these IDs;
* modify legacy Pipeline/SavedFile structure;
* delete `plugin-filesystem`;
* expose generic filesystem/archive operations as configurable Release builds;
* redesign the planner or workflow runtime.

Final architecture:

```text
NEW RELEASE WORKFLOW

@pipelab/core/source/*
@pipelab/core/destination/*
        │
        ▼
@pipelab/core/fs/*
@pipelab/core/archive/*
@pipelab/core/passthrough

               +

@pipelab/plugin-construct/*
@pipelab/plugin-godot/*
@pipelab/plugin-electron/*
@pipelab/plugin-steam/*
...


FUTURE HOOKS

before/after source/build/upload
        │
        ▼
same @pipelab/core/* primitives


LEGACY PIPELINE

@pipelab/plugin-filesystem
├── fs:copy
├── fs:remove
├── fs:run
├── unzip-file-node
├── zip-node
├── zip-v2-node
└── fs:open-in-explorer
```

- [x] Verify locally saved user-created Pipelines still run through the CLI host (legacy `fs:copy` graph E2E).

Legacy identity should stop at the legacy Pipeline boundary
