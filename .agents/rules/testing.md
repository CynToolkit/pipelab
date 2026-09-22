# Pipelab Testing Policy

## Electron

Do not add Electron E2E, integration, workflow, release, or plugin tests.

Electron is the desktop shell. The only permitted Electron runtime test is a
single minimal startup smoke test that verifies:

- Electron launches.
- The renderer loads.
- The preload/host bridge initializes.
- No fatal startup error occurs.

That smoke test is currently disabled from CI and is manual-only if retained.
It must never become a feature-test harness. Do not use Electron,
Playwright + Electron, `xvfb`, `BrowserWindow` automation, or desktop IPC to
test application features.

Only one startup smoke may ever exist. It must not test release configuration,
workflow execution, plugins, planner behavior, compiler behavior, runtime
behavior, settings, routing, or UI business flows.

## Integration / E2E

All workflow, plugin, runtime, and release integration or end-to-end execution
tests must run through `apps/cli`. The CLI is Pipelab's lightweight canonical
execution host.

Use the existing Vitest suite under `apps/cli/tests/e2e`, with
`createSandbox()` and `runCLI()` from `@pipelab/test-utils`. Prefer
deterministic fake or mocked provider boundaries when a third-party service is
not the behavior under test.

Use CLI `workflow run --dry-run` for release planner/compiler integration tests
that must not execute providers. Dry-run must load plugins, plan, compile, and
return before workflow execution.

## Unit and UI tests

Keep planner, compiler, runtime, descriptor, validation, and default-resolution
tests close to their packages. Test Vue presentation and state behavior with UI
unit/component tests. Do not launch Electron to test UI behavior.

## Desktop CI

Desktop CI verifies that Electron can package and make successfully on the
supported platforms. Packaging is not an application E2E test.
