# PR #97 — Focused Final Cleanup

Goal: finish PR #97 with only the remaining necessary cleanup.

## 1. Make core workflow task IDs authoritative

`CORE_WORKFLOW_TASKS` should have one owner.

Move the generic task IDs to `@pipelab/workflow-runtime`, then import them from there in:

* core Release built-ins;
* core workflow task registration;
* `plugin-construct`.

Do not hardcode:

```text
@pipelab/core/archive/unzip
```

inside Construct separately.

Keep:

```text
@pipelab/core/fs/copy
@pipelab/core/fs/remove
@pipelab/core/archive/zip
@pipelab/core/archive/unzip
@pipelab/core/passthrough
```

No wider abstraction work.

## 2. Keep the new core Release IDs

The removal of the old Release IDs is intentional.

Keep:

```text
@pipelab/core/source/folder
@pipelab/core/source/web-folder
@pipelab/core/source/zip
@pipelab/core/source/web-zip

@pipelab/core/destination/folder
@pipelab/core/destination/zip
```

Do not add aliases or migrations for the old `@pipelab/plugin-filesystem/...` Release IDs.

`plugin-filesystem` remains only for legacy Pipeline compatibility.

## 3. Keep the unzip cancellation fix

No redesign needed.

Keep:

* `AbortSignal` passed to `extractZip()`;
* active extraction stopped on abort;
* `AbortError` returned;
* focused cancellation coverage.

## 4. Small test placement cleanup

Keep package-local tests focused on:

* built-in IDs;
* registry composition;
* primitive behavior;
* cancellation.

If a package-local test is just duplicating an existing CLI planner/compiler integration case, remove it.

Do not add more tests than necessary.

## 5. Update the PR description

Remove the outdated statement that persisted Release IDs are preserved.

Say instead that:

* Folder/ZIP Release providers are now core built-ins;
* they use new `@pipelab/core/...` IDs;
* old Release IDs are intentionally not retained because Release Workflow is unreleased;
* `plugin-filesystem` remains for legacy Pipeline compatibility;
* unzip cancellation is supported.

## Verification

Only run the checks relevant to touched packages:

```text
pnpm --filter @pipelab/workflow-runtime test
pnpm --filter @pipelab/workflow-runtime typecheck

pnpm --filter @pipelab/core-node test
pnpm --filter @pipelab/core-node typecheck

pnpm --filter @pipelab/plugin-construct test
pnpm --filter @pipelab/plugin-construct typecheck

pnpm --filter @pipelab/cli test

git diff --check
```

Then rely on CI for the broader repository verification.

## Scope

Do not:

* implement hooks;
* add Release ID compatibility;
* redesign the planner/runtime;
* delete `plugin-filesystem`;
* rename legacy Pipeline node IDs;
* add extra cleanup unrelated to PR #97.
