# PR #96 — Final Build Input UX Fix

Keep the current planner-driven candidate detection, but fix two UI semantics before merging.

## 1. Never mutate `build.input` while discovering candidates

Current code in `release-flow.vue` does this:

```ts
if (options.length === 1 && build.input) delete build.input;
```

Remove that behavior.

`refreshBuildInputs()` must be read-only with respect to the workflow configuration.

Expected behavior:

- one compatible candidate + no explicit input:
  - hide the Input selector;
  - let the planner resolve the input implicitly.

- one compatible candidate + valid explicit input:
  - hide the Input selector;
  - preserve the explicit `build.input`.

- stale, missing, disabled, or incompatible explicit input:
  - preserve the existing `build.input`;
  - surface the planner validation error;
  - do not silently replace or delete it.

Opening Build settings must never rewrite persisted workflow configuration.

Do not silently repair explicit inputs.

## 2. Do not visually default ambiguous inputs to Source

Current selector binding uses:

```vue
:model-value="outputRefValue(settingsBuild.input || { source: true })"
```

This is misleading when multiple compatible inputs exist and `build.input` is undefined.

In that case the planner considers the build ambiguous, but the UI can visually appear as though Source is already selected.

Change the selector behavior so that:

- multiple compatible candidates + no explicit `build.input`:
  - show the Input selector;
  - show no candidate as selected;
  - use a placeholder such as `Choose an input`;
  - require the user to explicitly select an input.

Use the actual explicit input only:

```vue
:model-value="outputRefValue(settingsBuild.input)"
```

Do not use `{ source: true }` as a display fallback for an ambiguous build.

## 3. Preserve the existing single-input UX

Keep the intended behavior from this PR:

- exactly one compatible input:
  - hide the Input selector.

- multiple compatible inputs:
  - show the Input selector.

- zero compatible inputs:
  - do not show an empty selector;
  - surface the planner validation/error state.

Do not change planner semantics.

Keep:

```ts
ReleaseBuildProfileConfig.input?: ReleaseOutputRef
```

Keep support for:

```ts
{
  source: true;
}
```

and:

```ts
{
  (buildId, targetId);
}
```

Keep input at the build-profile level.

Do not add target-level inputs.

## 4. Keep compatibility detection planner-owned

Do not duplicate artifact compatibility logic in the UI.

Continue probing candidate configs through:

```ts
release: plan;
```

and only expose candidates accepted by the planner.

The UI should remain a presentation layer over planner semantics.

## 5. Add focused regression tests

### Single compatible input

- [x] Selector is hidden.
- [x] An existing explicit `build.input` is preserved.
- [x] Opening Build settings does not mutate the workflow.
- [x] Opening Build settings does not trigger a persistence change solely because input discovery ran.

### Explicit build chaining

Given:

```text
Source → Build A → Build B
```

and Build A's output is Build B's only compatible input:

- [x] Build B's selector is hidden.
- [x] Build B's explicit `{ buildId, targetId }` input remains unchanged.

### Invalid/stale explicit input

- [x] Stale explicit input is not deleted.
- [x] Stale explicit input is not replaced with Source.
- [x] Planner validation remains visible.

### Ambiguous input

Given multiple compatible candidates:

- [x] Selector is visible.
- [x] Undefined `build.input` shows no selected option.
- [x] Source is not visually selected by default.
- [x] A `Choose an input` placeholder is shown.
- [x] Selecting an option persists the selected `ReleaseOutputRef`.

### Existing behavior

- [x] Zero compatible inputs shows the existing actionable validation state.
- [x] Build targets still do not expose individual Input settings.

## 6. Verification

Verification completed:

- [x] `pnpm --filter @pipelab/ui test` (58 tests passed).
- [x] `pnpm --filter @pipelab/ui typecheck`.
- [x] `pnpm --filter @pipelab/ui lint` (23 warnings, no errors).
- [x] `pnpm --filter @pipelab/ui build`.
- [x] `git diff --check`.

If shared code is touched, also run the relevant shared tests/typecheck.

## Scope

Do not:

- redesign Release planning;
- change the one-source Release model;
- remove `build.input`;
- remove build chaining;
- add target-level inputs;
- change destination input behavior;
- add DAG/editor work;
- introduce automatic repair of persisted workflow references.

This should remain a small UI correctness fix on top of PR #96.
