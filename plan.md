# CLI Dry-Run + Release Integration Test Plan

## Objective

Finish the testing strategy cleanup by making the CLI the canonical lightweight host for release integration verification.

Electron testing is already intentionally limited and must stay that way.

This task should:

1. make `workflow run --dry-run` perform real release planning/compilation;
2. ensure dry-run never executes workflow/plugin side effects;
3. add representative release integration scenarios through the CLI;
4. remove the remaining need for manual Electron release testing;
5. preserve the new repository rule forbidding Electron E2E/feature tests.

Do not add any new Electron tests.

---

# Existing testing policy to preserve

The repo now has the intended testing split:

```text
Unit/component tests
        +
CLI integration/E2E
        +
Desktop package/make
```

Keep:

* `.agents/rules/testing.md`
* `GEMINI.md` testing guidance
* Electron smoke disabled from CI
* `smoke:electron:manual`
* Desktop make/package matrix
* CLI E2E under `apps/cli/tests/e2e`
* UI behavior tested without Electron

Do not reintroduce Electron as an integration host.

---

# 1. Make CLI `--dry-run` a real compile-only release test

## Current problem

Current `workflow run --dry-run` exits too early.

Conceptually it currently does:

```ts
if (options.dryRun) {
  printSummary();
  writeConfig();
  return;
}
```

This means dry-run does not prove that:

* plugins can load;
* release planning succeeds;
* builds resolve;
* destinations resolve;
* compilation succeeds;
* artifact routing is valid.

That makes it too weak for release integration testing.

---

# 2. Redefine `--dry-run`

`workflow run --dry-run` should mean:

```text
Load workflow/release config
→ load built-in plugins
→ build ReleaseRegistry
→ resolve defaults if appropriate
→ plan/validate release
→ compile workflow
→ serialize result
→ STOP before workflow execution
```

It must never execute plugin runners.

No filesystem writes from workflow steps.

No Steam upload.

No Poki publish.

No Electron packaging.

No Godot process launch.

No external network side effects.

---

# 3. Expected CLI behavior

Example:

```bash
pipelab workflow run my-release --dry-run
```

Should:

```text
✓ load config
✓ load plugins
✓ validate/plan
✓ compile workflow
✓ exit 0
```

If compilation/planning fails:

```text
✗ print useful errors
✗ exit non-zero
```

---

# 4. `--output` behavior in dry-run

When used with:

```bash
pipelab workflow run my-release --dry-run --output result.json
```

write a deterministic machine-readable result.

Preferred shape:

```ts
interface WorkflowDryRunResult {
  workflowId: string;
  release: ReleaseConfig;
  plan: ReleasePlan;
  workflow: Workflow;
}
```

Exact shape may differ if existing CLI result conventions suggest something simpler.

The important part is that tests can inspect:

* resolved Build Profiles;
* selected targets;
* destination routing;
* compiled workflow steps;
* artifact dependencies.

Do not output only the original input config.

---

# 5. Keep planning and compilation authoritative

Do not reproduce planner/compiler logic inside the CLI command.

Use existing core APIs:

```text
resolveReleaseDefaults(...)
planRelease(...)
compileWorkflow(...)
```

or the canonical existing equivalents.

CLI is only an orchestration/test host.

---

# 6. Default resolution in dry-run

If normal Release execution automatically resolves defaults before execution, dry-run must follow the same logic.

Example:

```text
Construct
→ Steam
```

must dry-run through:

```text
Construct
→ auto default Desktop
→ Electron
→ Windows x64
→ Steam
```

Dry-run must represent the same configuration/execution plan the real release would use.

Avoid having:

```text
real execution behavior ≠ dry-run behavior
```

---

# 7. Dry-run must not persist automatic fixes unless intended

Prefer treating dry-run as non-mutating.

If default resolution produces:

```text
Desktop / Electron / Windows x64
```

for an incomplete ReleaseConfig:

* include the resolved version in dry-run output;
* do not write it back to the stored workflow config.

Dry-run should answer:

```text
"What would Pipelab run?"
```

not:

```text
"Modify my release."
```

---

# 8. Add CLI release integration test file

Create or extend:

```text
apps/cli/tests/e2e/tests/releases.spec.ts
```

Prefer a separate file rather than continuing to grow generic `integration.spec.ts`.

Use the existing test helpers:

```ts
createSandbox()
runCLI()
```

Do not introduce another framework.

Do not introduce Playwright.

---

# 9. Test: Construct → Poki

Create a lightweight release fixture/config representing:

```text
Construct source
→ Poki
```

Run:

```text
workflow run <id> --dry-run --output <result>
```

Assert:

```text
no Desktop build generated
Poki routes from Source
no Electron producer step
compiled release is valid
```

Do not contact Poki.

---

# 10. Test: Construct → Steam

Test:

```text
Construct
→ Steam
```

Expected automatic resolution:

```text
Desktop
Electron
Windows x64
```

Assert:

```text
exactly one Desktop build exists
engine is Electron
Windows x64 enabled
Construct feeds Electron
Electron feeds Steam
compiled workflow is valid
```

Do not actually run Electron packaging.

Do not contact Steam.

---

# 11. Test: Construct → Steam + Poki

Test:

```text
Construct
├─ Poki
└─ Steam
```

Expected:

```text
Poki ← Source

Steam ← Desktop / Electron / Windows x64
```

Assert:

```text
exactly one Desktop build
Poki uses Source
Steam uses Desktop
Electron build is not duplicated
compiled graph contains correct fan-out
```

---

# 12. Test: Godot → Steam

Critical regression case.

Input:

```text
Godot project
→ Steam
```

Current preferred Desktop fallback:

```text
Electron / Windows x64
```

Electron cannot consume a Godot project.

Assert:

```text
Electron is NOT created
invalid preferred default is rejected
release remains unresolved OR uses a valid Godot Desktop build only if configured
dry-run exits non-zero when no valid route exists
```

This protects planner-authoritative default resolution.

---

# 13. Test existing compatible build reuse

Input config already contains:

```text
Desktop
Electron
Windows x64
```

with Steam unrouted.

Dry-run should reuse it.

Assert:

```text
no second Desktop build
existing build ID preserved
Steam routes to existing target
```

---

# 14. Test source-direct destination

Use a Web Folder or Construct-style web output with a compatible destination.

Assert:

```text
destination uses Source directly
no fake Web build generated
```

This keeps the original source-direct invariant protected at integration level.

---

# 15. Test automatic transforms

Add one representative test where planner uses automatic plumbing such as:

```text
ZIP
→ automatic unzip
→ destination
```

Assert:

```text
automatic producer appears in compiled workflow
automatic producer does NOT appear as persisted Build Profile
```

Do not duplicate every transform case.

One representative path is enough.

---

# 16. Test failure output

Add a dry-run failure case.

Example:

```text
Generic files
→ incompatible destination
```

Expected:

```text
exit non-zero
useful planner/validation error
no runner execution
```

Tests should be able to distinguish:

```text
invalid release
```

from:

```text
runtime/plugin execution failure
```

because dry-run must never reach execution.

---

# 17. Make dry-run side-effect safe

Add a regression test proving workflow steps are not executed.

Use a test plugin/action or filesystem output that would create a marker if executed.

Run:

```text
--dry-run
```

Assert:

```text
compiled step exists
marker/output file does NOT exist
```

This is important.

Dry-run must never accidentally become:

```text
"run everything except deployments"
```

It should run nothing.

---

# 18. CLI command architecture

Keep the command flow simple.

Preferred structure:

```ts
load release config

await builtInPlugins(...)

const registry = buildReleaseRegistry(...)

const resolved = resolveReleaseDefaults(...)

const plan = planRelease(...)

assertNoBlockingErrors(plan)

const workflow = compileWorkflow(...)

if (dryRun) {
  writeDryRunResult(...)
  return
}

executeWorkflow(...)
```

Avoid duplicating this logic between dry-run and normal execution.

Factor shared preparation into a helper if needed:

```ts
prepareReleaseExecution(...)
```

returning:

```ts
{
  config,
  plan,
  workflow
}
```

Then:

```text
dry-run → serialize
normal  → execute
```

---

# 19. Do not let CLI tests become provider live tests

For Steam/Poki/etc., integration tests should verify:

```text
planner
compiler
artifact routing
generated task inputs
```

Do not require:

* Steam credentials;
* Poki credentials;
* real uploads;
* external service availability.

Use current deterministic test boundaries/mocks.

---

# 20. Update testing documentation

Add a short note to `.agents/rules/testing.md`:

```text
Release integration scenarios should prefer:

pipelab workflow run <id> --dry-run

when verifying planner/compiler/routing behavior without executing runners.
```

Keep the existing strict Electron rule unchanged.

Do not weaken:

```text
Do not add Electron E2E tests.
```

---

# 21. Update `GEMINI.md`

Add one concise line:

```text
Use CLI `workflow run --dry-run` for release planner/compiler integration tests that must not execute providers.
```

No need for a large documentation expansion.

---

# 22. Update Phase 3 verification checklist

Replace vague/manual checks with deterministic CLI acceptance.

Phase 3 verification should become:

```text
□ shared planner/default-resolution tests (not run for this cleanup)
✓ core compiler/runtime tests
□ UI tests (not run for this cleanup)
✓ CLI release dry-run integration tests
✓ CLI runtime integration tests
□ Desktop make/package matrix (not run for this cleanup)
✓ Electron feature/E2E intentionally absent
```

Remove any requirement for manual Electron release-flow testing.

---

# 23. Do not add more Electron testing

This is a hard constraint.

Do not add:

```text
Electron release tests
Electron workflow tests
Electron plugin tests
Electron UI automation
Playwright Electron tests
BrowserWindow test harnesses
xvfb application feature tests
desktop IPC feature tests
```

The only permitted Electron runtime test remains:

```text
one manual startup smoke
```

and it stays disabled from CI for now.

---

# 24. Definition of done

This task is complete when:

```text
✓ `workflow run --dry-run` performs plugin load + plan + compile
✓ dry-run executes zero workflow steps
✓ dry-run can output plan/workflow result
✓ Construct → Poki covered through CLI
✓ Construct → Steam covered through CLI
✓ Construct → Steam + Poki covered through CLI
✓ Godot → Steam invalid Electron default covered through CLI
✓ existing compatible build reuse covered
✓ one automatic-transform path covered
✓ failure case covered
✓ no Electron feature/E2E tests added
✓ Electron smoke remains disabled from CI
□ Desktop packaging matrix remains intact (not run for this cleanup)
□ full CI passes
```

---

# TODO

## CLI dry-run

* [x] Refactor `workflow run --dry-run`
* [x] Load built-in plugins during dry-run
* [x] Build ReleaseRegistry during dry-run
* [x] Resolve release defaults through canonical resolver
* [x] Run `planRelease`
* [x] Fail on blocking planner errors
* [x] Run the canonical release compiler (`compileReleasePlan`)
* [x] Return before `executeWorkflow`
* [x] Keep dry-run non-mutating
* [x] Support `--output` with structured dry-run result

## CLI execution preparation

* [x] Factor shared release preparation helper if useful
* [x] Use same preparation path for real execution and dry-run
* [x] Avoid planner/compiler duplication
* [x] Preserve current normal execution behavior

## CLI release tests

* [x] Add `releases.spec.ts`
* [x] Test Construct → Poki
* [x] Test Construct → Steam
* [x] Test Construct → Steam + Poki
* [x] Test Godot → Steam rejects Electron default
* [x] Test existing compatible Desktop build reuse
* [x] Test source-direct destination
* [x] Test representative automatic transform
* [x] Test incompatible release failure
* [x] Test dry-run causes no runtime side effects

## Assertions

* [x] Assert generated Build Profile count
* [x] Assert preferred engine/target
* [x] Assert destination `ReleaseOutputRef`
* [x] Assert compiled step dependencies
* [x] Assert fan-out uses one build
* [x] Assert no fake Web build
* [ ] Assert no Electron build for incompatible Godot source (failure occurs before compilation)
* [x] Assert no runner side effects in dry-run

## Test infrastructure

* [x] Keep Vitest
* [x] Keep `createSandbox()`
* [x] Keep `runCLI()`
* [x] Avoid Playwright
* [x] Avoid live third-party services
* [x] Keep fixtures deterministic

## Documentation

* [x] Update `.agents/rules/testing.md` with CLI dry-run guidance
* [x] Keep explicit ban on Electron feature/E2E tests
* [x] Update `GEMINI.md` with dry-run guidance
* [x] Do not weaken existing Electron restrictions

## Phase 3 plan

* [x] Replace manual release smoke items with CLI dry-run integration acceptance
* [x] Mark Electron feature testing as intentionally out of scope
* [x] Keep Desktop make/package as desktop acceptance

## Electron

* [x] Do not add any Electron tests
* [x] Keep smoke manual-only
* [x] Keep Electron smoke disabled from CI
* [x] Keep Desktop package/make matrix

## Final verification

* [ ] Run shared tests
* [x] Run core-node tests
* [ ] Run UI tests
* [x] Run CLI E2E tests
* [x] Run lint
* [x] Run typecheck
* [ ] Run full CI
* [x] Confirm dry-run executes no workflow steps
* [x] Confirm no CI job launches Electron for feature testing
* [ ] Confirm Desktop package/make still succeeds
