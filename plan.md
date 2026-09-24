# PR #96 — Last Input Repair Edge Case

One remaining UX edge case.

## Problem

A stale explicit `build.input` is correctly preserved and its planner error is displayed.

However, when candidate discovery finds exactly one valid replacement, the Input selector is still hidden because `buildInputSelectionMode()` only considers the candidate count.

This leaves the user unable to repair the stale reference explicitly.

Example:

```text
Persisted input:
Build B → deleted Build A / windows

Current compatible candidates:
Source
```

Expected:

```text
Input
[ Choose an input ▼ ]

Referenced build A is missing.
```

The user can explicitly choose Source.

Current behavior:

```text
Referenced build A is missing.
```

with no way to fix the input.

## Fix

Make the input selection mode account for input validation issues.

Expected behavior:

* [x] Exactly one compatible candidate + no input issue → hide selector.
* [x] Exactly one compatible candidate + stale/invalid explicit input → show selector.
* [x] Multiple compatible candidates → show selector.
* [x] Zero compatible candidates → show validation/error state without an empty selector.
* [x] Never automatically replace or delete the stale explicit input.
* [x] Only change `build.input` after an explicit user selection.

The simplest approach is to let the selection-mode helper receive the current input issues, or introduce a small helper expressing this rule explicitly.

## Regression test

Add a focused test for:

```text
existing build.input = stale build/target
planner reports input error
candidate discovery returns exactly one valid candidate
```

Verify:

* [x] the Input control is visible;
* [x] the selector is rendered;
* [x] the stale `build.input` remains unchanged before interaction;
* [x] selecting the sole candidate explicitly replaces `build.input`.

## Small documentation cleanup

While touching `plan.md`, fix the malformed examples currently rendered as:

```ts
{ buildId, targetId }
```

and:

```ts
release:plan
```

They should describe `{ buildId, targetId }` and `release:plan` normally.

## Verification

Verification completed:

- [x] `pnpm --filter @pipelab/ui test` (59 tests passed).
- [x] `pnpm --filter @pipelab/ui typecheck`.
- [x] `pnpm --filter @pipelab/ui lint` (23 warnings, no errors).
- [x] `pnpm --filter @pipelab/ui build`.
- [x] `git diff --check`.

Do not change planner semantics or automatically repair persisted inputs.
