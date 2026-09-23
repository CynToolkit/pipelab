# Build Input UX Cleanup

Goal: hide the Build "Input" setting when there is no meaningful choice, while preserving build-to-build chaining.

## Context

A Release has exactly one top-level source.

A build profile may consume either:

- the Release source; or
- a target output from another build.

`build.input` therefore remains valid and necessary for chained builds.

The problem is only UX: when exactly one compatible input exists, showing an Input selector is unnecessary.

## 1. Simplify the Build settings UI

For each build profile, determine the compatible input candidates already available to that build.

- [x] If exactly **one compatible input** exists:
  - hide the Input selector;
  - let the existing planner resolve it implicitly;
  - do not require the user to select the Source manually.

- [x] If **multiple compatible inputs** exist:
  - show the Input selector;
  - include the Source when compatible;
  - include compatible outputs from other builds;
  - persist the selection in `build.input`.

- [x] If **no compatible input** exists:
  - do not show a meaningless empty selector;
  - surface the existing validation/error state explaining that the build has no compatible input.

Example:

```text
Source
  ↓
Electron
```

## Verification

- [x] UI tests pass (53 tests).
- [x] UI typecheck passes.
- [x] UI lint passes (23 existing warnings, no errors).
- [x] UI production build passes.
- [x] `git diff --check` passes.

The UI could not be checked in a live browser because Chrome DevTools MCP is not configured in this environment.
