Goal: Redesign Pipelab’s GitHub Actions pipeline so normal developer CI gives a trustworthy result in roughly 2–4 minutes, while preserving real Windows/macOS/Intel release assurance and moving expensive delivery work off the CI critical path.

☐ Establish a before/after benchmark using existing runs. Record run #417 as the lightweight/UI baseline (~4m16s) and run #413 as the heavy desktop baseline (~23m09s). Track separately: Detect Changes duration, first trustworthy CI result, Linux tests, platform checks, Build All, desktop builds, and final delivery duration. Do not optimize the 30–40s change-detection job first; the test/dependency graph is the dominant issue.

### Baseline from GitHub Actions

Durations below are job wall times from completed runs #417 and #413. The full correctness result waited for the slowest generic test-matrix leg; delivery then added more time after that gate.

| Measurement | Run #417 (UI/lightweight) | Run #413 (desktop/heavy) |
| --- | ---: | ---: |
| Whole workflow | 4m16s (ended in deployment failure) | 23m09s (ended in website/release failures) |
| Detect Changes | 36s | 36s |
| First full correctness result (slowest test leg) | 3m04s from run start (Intel test matrix) | 13m41s from run start (Intel test matrix) |
| Linux tests | 33s | 2m24s |
| Windows full test matrix | 1m02s | 6m30s |
| macOS ARM full test matrix | 1m36s | 6m30s |
| macOS Intel full test matrix | 2m21s | 12m55s |
| Build All | 58s | 1m22s |
| Desktop builds: Linux / Windows / macOS Intel / macOS ARM | Skipped | 1m05s / 3m40s / 6m46s / 5m50s |
| Desktop build-to-release tail | Skipped | ~8m00s (desktop jobs began at 18:48:18Z; workflow ended 18:56:18Z) |
| Release job | Skipped | 1m10s (failed uploading existing versioned assets) |

Run links: [#417](https://github.com/CynToolkit/pipelab/actions/runs/35980922487) · [#413](https://github.com/CynToolkit/pipelab/actions/runs/35903259911). The root workflow duration and job timings are API-observed.

### Controlled validation after the redesign

| Change | Run | Affected work | CI Gate | Delivery artifacts |
| --- | --- | --- | ---: | --- |
| UI-only | [#36010023685](https://github.com/CynToolkit/pipelab/actions/runs/36010023685) | UI typecheck, lint, Linux tests, Build All; platform and desktop jobs skipped | 2m15s from run start | Not applicable |
| Portable CLI | [#36012560329](https://github.com/CynToolkit/pipelab/actions/runs/36012560329) | CLI typecheck, lint, Linux E2E, Build All; platform and desktop jobs skipped | 2m10s from run start | Not applicable |
| Desktop-only | [#36010948724](https://github.com/CynToolkit/pipelab/actions/runs/36010948724) | Linux tests, both platform smokes, lint/typecheck, Build All, all four desktop builds | 2m50s after Detect Changes completed; 4m10s runner queue preceded detection | All four artifacts uploaded in 10m33s from run creation, including queue; both macOS `lipo` checks passed |

The UI-only run met the 2–2.5 minute gate target. The desktop trial finished every artifact target; it was a PR run, so signing and Delivery were not exercised. A separate UI-only run before the dependency declaration fix failed typecheck and the CI Gate, confirming that typecheck failures block the required gate.

GitHub only starts `workflow_run` listeners when their workflow file exists on the repository default branch. The current default `main` is legacy, so Delivery will not automatically run from `develop` while that branch remains default. When `develop` is promoted to the new default `main`, this workflow will be on the default branch and can receive subsequent successful Pipeline runs. No changes to legacy `main` are part of this PR.

☐ Replace test-matrix with a Linux-first portable test job. Rename it to something like test-linux or verify-tests. Run the affected Turbo test set only on ubuntu-latest. Start with pnpm turbo test ... --concurrency=2 instead of --concurrency 1; the public Linux runner has enough cores and the current major package tests are isolated. Keep the affected-package filtering. Benchmark concurrency=2 before considering anything higher. The CLI E2E suite must run here exactly once, not once per OS.

☐ Delete macos-26-intel from generic tests entirely. Do not replace it with another full Intel test job. The repo has no Intel-specific test behavior that justifies running the complete test suite on native Intel hardware.

☐ Replace the remaining full cross-platform test duplication with small targeted platform smoke jobs. Windows should cover only behavior that genuinely depends on Windows, particularly the Windows-specific packages/core-node/src/fs-utils.test.ts branch and relevant Steam/desktop/Electron host behavior when those packages are affected. macOS ARM should run host-dependent Electron packaging only when Electron/macOS-sensitive code is affected. Do not run CLI, shared, UI, release planner/compiler, workers, migration, Godot mapping, etc. again on those runners; those tests use platform values as data and are already covered on Linux.

☐ Extend scripts/detect-changes-logic.mjs / detect-changes.ts with explicit CI-category outputs rather than encoding increasingly complicated expressions in YAML. Add booleans such as needs_windows_smoke, needs_macos_smoke, needs_desktop_build, and—after inspecting current release semantics—desktop_version_changed. Add unit tests for every classification. Preserve the website-only optimization already present.

☐ Fix caching correctness. Any cache used by a host/architecture-dependent job must include both ${{ runner.os }} and ${{ runner.arch }}. Never allow Intel and ARM macOS tests to share the same Turbo cache archive. For very small platform smoke tests, consider disabling Turbo test caching entirely so the smoke really executes. Leave setup-node’s pnpm cache enabled; its generated keys already distinguish architecture, as visible in the current logs.

☐ Rewire the DAG for parallelism. Build All should no longer wait for the complete verification suite. After changes, start verify-lint, verify-typecheck, test-linux, applicable platform smoke checks, and build-all concurrently. build-all only needs change detection and its own build prerequisites. Desktop packaging should start once build-all is ready rather than waiting for unrelated portable tests. The final gate/release is where verification and produced artifacts converge. This deliberately trades a small amount of potentially wasted compute on a failing commit for several minutes less wall-clock latency.

☐ Make lint/typecheck real gates. Remove continue-on-error: true from both verification steps unless there is an explicitly documented reason they are informational only. GitHub applies continue-on-error after the step outcome, making the step conclusion successful even when the underlying command failed. The final CI gate must fail on lint, typecheck, portable tests, or required targeted platform checks.

☐ Add one stable CI Gate job whose only purpose is to aggregate required verification results. Configure branch protection around this one stable job rather than individual matrix entries. It should finish as soon as code correctness is established; desktop release/deployment must not be required for this gate.

☐ Keep the four real desktop artifact targets for delivery: Linux x64, Windows x64, macOS x64 on macos-26-intel, and macOS ARM64 on macos-26. Intel remains here because this is actual product output, not generic testing. After each macOS build, inspect the produced .app executable and assert x86_64 for Intel and arm64 for Apple Silicon using lipo. For signed non-PR builds, also run a lightweight signing verification. This gives stronger Intel assurance than the current Electron E2E, which only checks that a package path exists.

☐ Do not put full generic tests back in front of desktop builds. build-desktop should depend on build-all and change classification. release should depend on CI Gate plus successful required desktop artifacts. Tests and desktop packaging should therefore overlap instead of forming tests → build → desktop.

☐ Separate CI from delivery after the DAG rewrite is proven. Move Cloudflare deployment and desktop GitHub Release publication out of the fast CI workflow into a delivery workflow triggered only after successful CI on develop/main, with a manual dispatch path preserved. Checkout the triggering SHA, not the default-branch SHA. Pass affected/change metadata as a small artifact if needed. CI failures then mean “the code is bad”; deployment/release failures mean “delivery is broken”, instead of one red Pipeline result ambiguously meaning either.

☐ Preserve cross-workflow artifacts rather than rebuilding unnecessarily when splitting workflows. Have CI upload monorepo-dist plus a tiny JSON metadata artifact containing affected packages/change categories. The delivery workflow should download artifacts from the triggering successful CI run. Verify the currently supported actions/download-artifact cross-run syntax before implementation rather than guessing at it.

☐ Fix desktop release semantics while moving delivery. Today the release tag is derived from apps/desktop/package.json, so repeated develop pushes can attempt to republish the same semantic version; run #413 failed while deleting/replacing an asset from the existing release. Inspect updater expectations first. Preferred behavior: publish a versioned release only when the desktop version changes or forcePublish is explicitly requested. If Pipelab intentionally needs every develop commit published, introduce a distinct unique development-build/channel identifier instead of repeatedly mutating the same versioned release.

☐ Remove dead and unnecessary workflow work. Delete the disabled publish-preview job rather than running a four-second placeholder. Remove pnpm/install/setup work from release/deploy jobs that no longer execute Node workspace commands. Use pnpm install --frozen-lockfile consistently where installs remain. Keep change detection’s install optimization as a later task because it is not the current bottleneck.

☐ Add CI concurrency cancellation only to developer CI. New commits to the same PR/ref should cancel obsolete CI runs. Do not automatically cancel a delivery workflow halfway through signing/publishing. Splitting CI and delivery makes this distinction straightforward.

☐ After the pipeline architecture is stable, profile the two remaining slow portable tests rather than prematurely rewriting them. @pipelab/cli is the dominant Linux test (~55s on run #413) and its Vitest config forces fileParallelism: false, maxWorkers: 1, and a single fork. Determine whether its sandboxing allows 2 workers safely. @pipelab/plugin-electron takes ~25s on Linux and should remain a real integration test, but only once in portable CI plus targeted platform validation when relevant.

☐ Validate the redesign with at least three controlled changes: a UI-only change, a portable core/CLI change, and an app/desktop packaging change. Confirm that affected-package detection still skips irrelevant work, platform smoke jobs execute rather than incorrectly hitting another architecture’s cache, all four release artifacts have the expected architecture, lint/typecheck failures really stop the CI gate, and delivery cannot run after a failed gate.

☐ Acceptance targets: UI-only CI Gate ≤2–2.5 minutes where runner availability permits; heavy monorepo CI Gate ≤4 minutes; actual signed four-platform desktop delivery roughly ≤10–12 minutes rather than ~23 minutes; zero generic tests on Intel; zero ARM↔Intel Turbo cache reuse; no GitHub release attempt for an unchanged semantic version unless explicitly forced.

☐ FINAL GOAL: Pipelab should have a fast Linux-centric CI path that answers “is this commit correct?” quickly, a tiny set of targeted OS checks for genuinely host-dependent code, and a separate delivery path that answers “can we build/sign/deploy every product artifact?”. Intel hardware remains only where it provides real x64 product assurance, not as an expensive duplicate test runner.
