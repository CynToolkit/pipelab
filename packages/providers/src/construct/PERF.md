# Construct export performance

The baseline for Pipelab's Construct setup is **28.6 seconds median**. The
target is under 10 seconds. Setup ends when Pipelab clicks Construct's **Next**
button; Construct's internal export preparation and download happen after that
point and are excluded from this metric.

The latest five-run warm benchmark at `ec126fea` averaged **10.921 seconds
for the full export** and **8.021 seconds through Next**. All five ZIPs passed
inspection. These measurements used the F6 opener, which has since been
replaced with Menu → Project → Export for reliability. None of the 30
subsequent optimization ideas demonstrated a consistent several-second gain.
Host load differs from earlier measurements, so the lower observed time cannot
be attributed to a new optimization.

## Warm full CLI workflow using the Discord example (2026-10-21)

The user-selected input was [`discord.c3p`](https://github.com/CynToolkit/construct-plugin/blob/main/examples/discord.c3p), downloaded at 167,766 bytes (SHA-256 `7a151977b7e719177274a128364443613e7777b73211cae7fbec624bc4be38ba`). It selects Construct `r466-2`. The local CLI ran a temporary copy of `zeqf` with all publishing destinations removed. Each run refreshed the project-scoped profile from the selected Chromium profile and authenticated through the Doppler-provided Construct credentials. Playwright logged full Chromium, `channel: chromium`, headless mode. One successful full workflow warm-up was excluded below.

| Measured run | Setup through Next | Construct export task | Extract | Linux x64 build | Result |
| --- | ---: | ---: | ---: | ---: | --- |
| 1 | 13.500 s | 15.86 s | 0.093 s | 22.89 s | Complete |
| 2 | 12.623 s | 15.03 s | 0.090 s | 22.55 s | Complete |
| 3 | 13.716 s | 16.37 s | 0.166 s | 23.36 s | Complete |
| 4 | 13.614 s | 16.43 s | 0.086 s | 24.96 s | Complete |
| 5 | 12.411 s | 15.09 s | 0.063 s | — | Construct export and extraction completed; Electron Forge produced no output directory |
| **Mean** | **13.173 s** | **15.756 s** | **0.100 s** | **23.440 s** | Four full workflows completed |

The mean sum of the three Listr2 task durations for the four complete measured
workflows was **39.47 seconds**. The Construct task mean is based on five
successful exports; the fifth later failed in Electron packaging. One additional
Construct attempt timed out after 132.06 seconds waiting for the Web platform
option after F6, and a repeat was manually cancelled at the same point. Those
attempts are reported as failures and excluded from successful-export means.
The initial copied profile showed Guest despite containing a login record, so
configured credentials now trigger code-based authentication even when a
custom browser profile is selected. The successful runs reused the managed
profile and its Construct cache. The 2026-10-20 small `r397` fixture results
above are not directly comparable to this larger, different-version project.

## Latest baseline and optimization investigation

Measured on 2026-10-20 using Node 24.19.0, full Chromium
151.0.7922.34, headless mode, the same small r397 fixture and dedicated warm
profile. Source-profile refresh ran inside every measured task. One warm-up
(7.414 s setup / 9.704 s full) was excluded, followed by exactly five measured
exports; no measured samples were discarded.

| Run | Setup through Next | Full source task | CPU pressure before → after (`some avg10`) |
| --- | ---: | ---: | ---: |
| 1 | 8.871 s | 11.183 s | 30.89% → 42.44% |
| 2 | 8.073 s | 10.578 s | 38.06% → 46.06% |
| 3 | 7.623 s | 10.249 s | 41.34% → 44.00% |
| 4 | 7.657 s | 10.260 s | 39.29% → 47.35% |
| 5 | 7.880 s | 12.333 s | 42.58% → 54.92% |
| **Mean** | **8.021 s** | **10.921 s** | — |
| **Median** | **7.880 s** | **10.578 s** | — |

Full time includes Construct's internal export, ZIP download, artifact
registration and browser cleanup; archive inspection and extraction are
excluded. Every ZIP was readable, 389,254 bytes, with root `index.html`.
These results do not establish a load-independent guarantee or performance for
large projects.

Thirty distinct candidates were screened in ten rounds of three:

| Round | Candidates | Outcome |
| --- | --- | --- |
| 1 | Offline cached URL; remove dialog pollers; smaller viewport | Offline failed; no confirmed speedup; removing dialog handling is diagnostic only. |
| 2 | Canonical offline URL; SwiftShader; CSS animations disabled | Offline failed; no several-second improvement. |
| 3 | Suppress restored tabs; lower canvas scale; disable GPU | No gain; repeated GPU trials were slower than controls. |
| 4 | Skip final dialog/page close; newer Chromium; block tracking | No confirmed gain; newer browser failed export. |
| 5 | One raster thread; single-threaded V8; renderer process limit | No confirmed gain; V8 retested below. |
| 6 | Synchronous processing; skip WebGPU probe; disable WebGL | No confirmed gain. |
| 7 | One Construct worker; native animation toggle; default workspace | Differences remained within noise. |
| 8 | Disable JS optimization; disable Wasm tiering; eager JS compilation | Retested with separate warm caches below. |
| 9 | Skip Start Page; simplified UI; mobile UI | No gain; mobile UI failed export. |
| 10 | Disable ZIP workers; one hardware-thread hint; disable UI effects | Applied overrides verified; no gain. Initial unapplied ZIP/hardware samples excluded. |

[V8 rejects compiled-code caches when compiler flags differ](https://github.com/v8/v8/blob/main/src/snapshot/code-serializer.cc). Compiler candidates
therefore received separate cloned profiles, two successful warm-ups each,
and three measured exports each, interleaved with controls in reversed order.
Source-profile refresh still ran every time. All 15 measured exports produced
verified ZIPs. Identical project CPU telemetry was enabled for this comparison.

| Compiler mode | Mean setup | Mean full task | Full-task difference from control |
| --- | ---: | ---: | ---: |
| Control | 8.230 s | 10.792 s | — |
| Eager compilation | 8.077 s | 10.755 s | −0.037 s |
| JS optimization disabled | 7.970 s | 10.220 s | −0.572 s |
| Wasm tiering disabled | 8.467 s | 10.952 s | +0.160 s |
| Single-threaded V8 | 8.142 s | 10.692 s | −0.100 s |

None meets the requested several-second improvement. No experimental provider
behavior was retained. CPU pressure varied throughout; these small differences
are insufficient evidence for adoption. At the time of these measurements,
the baseline still used F6. A reliability issue later led to restoring the
documented menu path; see the follow-up below.

## Retained-editor finding: two workflow executions (prototype only)

A subsequent investigation on **2026-10-21** found a several-second
opportunity: keep the Construct editor alive between exports in the same host
when the selected source state and pinned Construct version are unchanged.
**This behavior is not implemented in the production provider.** It is a
retained-editor path, not a faster fresh-browser warm-profile result. The
five-run 8.021 s setup / 10.921 s full baseline above remains unchanged.

The prototype executed **two actual `runWorkflowTask` calls** in one Node
process, using separate workspaces. The first complete export was an excluded
warm-up; its registered ZIP was inspected before the measured second task.
Every invocation copied the selected source profile to a private offline
snapshot and hashed its non-cache contents. The first browser's initial managed
state had to match that snapshot; the second source snapshot had to be identical
before reuse. Raw profile databases were never copied into the active browser.
The old project was closed through the supported menu, the Open control was
awaited, and the input file was imported again before generating a new ZIP.

The control used the same two-workflow wrapper and original implementation,
closing the browser between tasks. Three measured tasks per method ran in a
fixed interleaved order: control, reuse, reuse, control, control, reuse.
The full timer surrounded the entire second workflow, including normal input,
version/package/browser resolution, source copy/hash, project close/import,
Construct export, download, **browser disposal and artifact registration**.
ZIP inspection was outside the timer. Thus the retained measurement includes
closing Chromium after its one reuse; it does not measure an indefinite manager.
Node 24.19.0, full Chromium 151.0.7922.34, headless mode and the same r397 fixture
were used. No local builds or tests ran alongside the benchmark.

| Measured run | Control setup | Retained setup | Control full | Retained full |
| --- | ---: | ---: | ---: | ---: |
| 1 | 7.477 s | 2.479 s | 12.136 s | 3.912 s |
| 2 | 7.651 s | 2.490 s | 10.885 s | 3.580 s |
| 3 | 7.191 s | 2.777 s | 10.028 s | 4.103 s |
| **Mean** | **7.440 s** | **2.582 s** | **11.016 s** | **3.865 s** |
| **Median** | **7.477 s** | **2.490 s** | **10.885 s** | **3.912 s** |

Mean savings were **4.858 seconds setup** and **7.151 seconds full export**
(64.9% lower full duration). All six measured exports and their six warm-ups
completed with readable ZIPs. Unchanged-fixture ZIPs were 389,254 bytes.
The three retained runs verified two source copies, unchanged source state,
initial managed-profile equality, both workflow completions and the project
close/Open gate. CPU pressure remained high: control `some avg10` before/after
was 36.19/47.66, 47.01/47.90 and 51.79/52.86; retained was 48.02/41.95,
44.97/42.80 and 49.26/43.75. These are local fixture results, not guarantees for
large projects or other host loads.

A separate second-workflow input changed the project's title to a unique value.
The registered ZIP's `index.html` contained that new title: **2.580 s setup /
4.277 s full**, 389,265 bytes. Its first attempt failed during the fresh-browser
warm-up because Construct never exposed the download within 120 seconds; it
never reached the measured reuse. That failure remains in the experiment
record and is excluded from the three unchanged-input comparison samples.
One initial successful two-workflow probe (2.542 / 3.871 s) preceded the fixed
comparison series and is reported separately.

Earlier exploratory prototypes ran two exports within one workflow. One used
an incorrect close shortcut; another repeat missed the picker because closing
Construct's project is asynchronous. Those failures were retained and the
method was replaced by two real workflows with an Open-control readiness gate
and handling for transient save prompts in the isolated automation-owned editor.
They are not counted as successful samples of the corrected method.

### Implementation tasks before production use

1. **Integration owner:** supply a minimal explicit host-lifetime capability.
   The server keeps provider modules alive; separate CLI invocations cannot
   share a browser. No current provider shutdown/disposal contract exists.
   A one-shot CLI must exit promptly, and server shutdown must close its browser.
2. **Construct owner:** retain at most one owned browser initially, scoped to
   project/source/account and resolved release. Copy source state every run;
   reuse only identical snapshots. On source, account, addon or version changes,
   close the old browser before applying the refreshed state and relaunching.
   The prototype currently rejects mismatches; automatic recycle is unimplemented.
   Moving `latest` requires release revalidation or conservative recycle.
   Own and serialize the non-reentrant profile lock, update task logging, and
   close/release on failure, cancellation, replacement and host shutdown.
3. **Execution owner:** cover two separate workflow executions, changed project
   content, changed profile/account/addons/version, concurrent requests, crashes,
   cancellation, lock release, server shutdown and prompt one-shot CLI exit.
   Keep same-host retention timing separate from the fresh-browser baseline.
4. **Documentation/review owner:** update public behavior documentation and
   affected changesets only with the actual implementation, then run the relevant
   focused checks. There is no new opt-in or daemon proposed.

The benchmark proves an impactful discovery for an eligible same-host reuse
case. It does **not** prove production lifecycle handling, automatic refresh on
changed source/version, or reuse across CLI processes. Public integration docs
continue to describe the current implementation accurately.

## Reviewed implementation: five full warm exports

Measured on 2026-10-20 at commit
`3198bcbc2db969291ea77adca5d97759729a39e0`, using Node **v24.19.0** and
`NODE_ENV=production`. The task used Playwright's full Chromium with
`channel: "chromium"`, `headless: true`, and no Xvfb or video. The existing
dedicated seed and managed profile were reused; source-profile refresh still
ran on every export. A blank version input selected the fixture's saved
Construct release, `r397`.

One warm-up completed in 25.812 seconds (21.552 seconds through Next), then
exactly five exports were measured sequentially. The warm-up is excluded from
the statistics, and no measured samples were discarded or replaced.

| Run | CPU pressure before (`some avg10`) | CPU pressure after | Setup through **Next** | Full source task |
| --- | ---: | ---: | ---: | ---: |
| 1 | 51.79% | 81.45% | 19.582 s | 25.000 s |
| 2 | 62.44% | 82.50% | 17.528 s | 23.518 s |
| 3 | 69.98% | 84.16% | 21.111 s | 30.270 s |
| 4 | 86.23% | 85.35% | 31.139 s | 35.902 s |
| 5 | 38.46% | 72.72% | 12.929 s | 18.188 s |
| **Mean** | — | — | **20.458 s** | **26.576 s** |
| **Median** | — | — | **19.582 s** | **25.000 s** |
| **Range** | — | — | **12.929–31.139 s** | **18.188–35.902 s** |

Full duration uses a monotonic timer around `runWorkflowTask`, ending after
the task returns with its registered ZIP artifact, including browser cleanup.
Construct's internal export preparation and ZIP download are included;
subsequent archive extraction is excluded. After stopping the timer, the
harness checks that the registered file is a nonempty readable ZIP containing
root `index.html`. Every measured ZIP was **389,254 bytes**, with a readable
1,442-byte `index.html`. There were no failed warm-up or measured runs.

The input was the existing small `test.c3p` fixture (54,288 bytes compressed),
not a large user project or personal Chrome profile. CPU pressure was elevated
throughout the series; `avg10` is a 10-second rolling pressure average. No
local tests or builds ran concurrently, but background host load was not
controlled. The earlier three-run mean of 15.981 seconds used Node 26 and
different load conditions, so the difference cannot be attributed to the
review fixes. These samples do not establish a universal warm export time.

With the repository's Node 24 toolchain selected, one full invocation is:

```sh
doppler run --project pipelab --config dev \
  --only-secrets CONSTRUCT_USERNAME,CONSTRUCT_PASSWORD --silent -- \
  env -u CI -u DISPLAY -u CONSTRUCT_VERSION -u CONSTRUCT_PROFILE_PATH \
  NODE_ENV=production CONSTRUCT_BENCHMARK_FULL_EXPORT=true \
  CONSTRUCT_BENCHMARK_SEED_FROM_CACHE=true \
  pnpm exec tsx packages/providers/.construct-benchmark.ts
```

## Measurement

Setup time is measured from the start of the
`@pipelab/plugin-construct/export-construct-project` workflow step to its
`"Next" clicked` event. It includes browser and profile setup, loading Construct,
opening the `.c3p` project, and setting the Web export options. It excludes
Construct's post-click export preparation and ZIP download, as well as later
workflow steps such as archive extraction.

Four runs from one saved local release workflow's development history on
2026-10-16 produced these setup durations:

| Run (UTC) | Duration |
| --- | ---: |
| 09:28:30 | 19.206 s |
| 11:19:58 | 50.436 s |
| 11:31:35 | 33.473 s |
| 11:38:18 | 23.645 s |

- Median: **28.559 s** (recorded as 28.6 s)
- Mean: 31.69 s
- Range: 19.206–50.436 s
- The under-10-second target was not met in these baseline runs.

For context, the corresponding full source-step durations were 23.459 s,
64.739 s, 42.912 s, and 27.841 s (39.738 s mean; 35.4 s median). These include work after the
**Next** click and are not the setup baseline. The Construct source step
completed in each sample; some containing workflows failed in later steps. The
provider's 120-second default timeout is a ceiling, not an observed baseline.

These are local observations, not a controlled benchmark: network and machine
load were not normalized. Compare future measurements using the same source
step, project, browser profile, and timeout.

## Optimization trials

Two avoidable delays were fixed:

- The picker now tries Ctrl+O before clicking **Open**. The four baseline logs
  spent a median 5.41 seconds on the unsuccessful button attempt and shortcut
  fallback. In the headed post-change trial, the chooser opened 0.51 seconds
  after Construct reported that the picker was ready.
- Browser presence is checked with Playwright's executable path. The old
  hard-coded `chrome-linux/chrome` path did not exist on this host, while
  Playwright's `chromium-1234/chrome-linux64/chrome` did. The post-change trial
  confirmed that the cached browser was reused without running the installer.

The post-change trial on 2026-10-19 reached **Next** after 32.8 seconds in
headed Chromium under Xvfb with video recording off. This is not directly
comparable with the 28.6-second desktop-development baseline: it used a virtual
display. The full source step took 52.3 seconds, including 18.3 seconds after
the **Next** click to prepare and download the export. The setup target was not
reached.

Earlier headless trials used Playwright's default headless mode. Setup reached
**Next** after 58.5 seconds in development mode and after 50.0 and 125.8
seconds in production mode, with large variation. Those runs did not select
the full Chromium browser with `channel: "chromium"`, so they do not evaluate
Playwright's newer headless mode. The provider uses Chromium, not branded
Google Chrome with a `channel: "chrome"` option. At the time of those trials,
the `headless` input defaulted to false.

One explicitly authorized diagnostic run on 2026-10-20 used the production
`exportc3p` path with Playwright-managed Chromium in headless mode, no
credentials, and `tests/e2e/fixtures/c3-export/test.c3p`. It did not reach
**Next**: Construct did not open a file chooser from Ctrl+O or its Open button,
including after the existing reload retry. The run stopped after about 160.3
seconds; no project was selected, and Construct's export preparation and ZIP
download did not start. Playwright package resolution took 3.603 seconds even
though version 1.62.1 was already cached. This failed run is not a setup-time
measurement. The live run used bundled Chromium, not branded Google Chrome;
at that time, the provider's `headless` input defaulted to false.

To remove that measured cache delay, `fetchPackage` now returns an installed
exact-version cache hit before checking DNS or npm metadata. The focused cache
regression test passed and logged a 1 ms fetch in its isolated temporary-cache
fixture. That unit result is not a full setup remeasurement; the live setup
target still needs a successful run through **Next**.

On 2026-10-20, a read-only page-load probe using the host's `/usr/bin/chromium`
in headless mode reached DOM content readiness in 9.3 seconds and the full
`load` event in 15.7 seconds. A second run using the same disk cache took 13.8
and 21.8 seconds respectively. Neither run showed Construct's project picker;
no credentials or project file were used. These are navigation diagnostics,
not full setup measurements. The provider now returns at DOM content readiness,
logs the navigation duration, and continues waiting for Construct's picker.

A warm-page reuse prototype did not complete project opening after its retry
under Xvfb, so there is no repeat-setup measurement. Reusing a warm Construct
page remains unverified; the isolated disk-cache probe above did not improve
editor navigation.

On 2026-10-20, the native workflow task reached **Next** in **48.179 seconds**
with the same `test.c3p` fixture and Pipelab dev Construct credentials from
Doppler. It used the provider's direct account-API authentication and
Playwright-managed Chromium with `headless: false` under Xvfb; this is bundled
Chromium, not branded Google Chrome. The timer started at workflow-task entry
and ended at the **Next** click. The harness stopped there, before Construct's
internal export preparation and ZIP download. The 10-second target was not
met. An earlier resumed attempt was interrupted before it reported a duration
and is excluded from the measurements.

## Reload and instrumentation notes

The navigation probe above measured a 6.4-second gap between DOM content
readiness and the full `load` event in its first run, and an 8.0-second gap in
its second run. The authenticated flow previously reloaded the editor and
waited for full `load`, despite separately polling for Construct's project
picker afterward. The authentication reload and its one-time recovery reload
now wait for `domcontentloaded`; the picker check remains the readiness gate.

The benchmark harness filters and prints elapsed time for Playwright package
resolution, browser binary availability, browser initialization, API
authentication, auth reload, project-picker readiness, project opening, and
Web export options through **Next**. Later instrumentation also measures file
selection, the project-loading dialog, and export menu transitions. The
harness only forwards known timing labels and safe status lines, so credential
values are not included.

## Full Chromium headless candidate

The provider now launches Playwright's full Chromium with
`channel: "chromium"` for both headed and headless exports. If Chromium is
missing, the provider installs it with `--no-shell`, avoiding the separate
headless-shell download. The benchmark harness requests `headless: true`, so it
does not need Xvfb. The provider's `headless` input now defaults to true; users
can turn it off when they need to see the browser.

One candidate requested the account session before navigation and tried to seed
`localforage` before Construct's page scripts started. The phase-timed runs
showed that the seed did not apply; the provider still injected the session and
reloaded. That ineffective hook has been removed. Direct API authentication
now starts before editor navigation and overlaps navigation and storage
initialization. Custom browser profiles still skip the API call when their
copied session is present.

On 2026-10-20, the native workflow task reached **Next** in **29.262 seconds**
using the same `test.c3p` fixture and Pipelab dev Construct credentials from
Doppler. It used Playwright 1.62.1's full Chromium with `channel: "chromium"`
and `headless: true`, without Xvfb. Authentication used the provider's direct
account API. The timer started at workflow-task entry and ended at the **Next**
click; the harness stopped before Construct's internal export preparation and
ZIP download. The target remains unmet. This is not a controlled comparison
with the 48.179-second headed Xvfb run because the browser display mode differs.
The harness did not print the phase-duration lines in this run; they were added
for later measurements.

The fixture used for that run is 54,288 bytes compressed and 60,998 bytes
across 23 files in its archive. This makes local file transfer an unlikely
explanation for most of the 29.262 seconds.

## Phase-timed headless run

On 2026-10-20, the same native workflow task, fixture, credentials, and
Playwright 1.62.1 full Chromium headless setup reached **Next** in **27.624
seconds**. The harness stopped at the click, before Construct's internal export
preparation and ZIP download. It ran without Xvfb. The target remains unmet.

| Phase | Duration |
| --- | ---: |
| Playwright package resolution | 15 ms |
| Browser binary check | 2 ms |
| Browser initialization | 1.553 s |
| Construct account API authentication | 846 ms |
| Initial document ready | 555 ms |
| Authentication setup | 1.560 s |
| Auth reload | 219 ms |
| Project picker ready | 4.975 s |
| File chooser opened | 59 ms |
| Project open, including picker readiness | 16.001 s |
| Web export options through **Next** | 6.026 s |

The auth reload confirms that pre-navigation `localforage` seeding did not
apply; the task used its existing session-injection and reload fallback. The
16.001-second project-open phase includes the 4.975-second picker wait and
file-chooser setup. By subtraction, project loading after file selection took
about 11 seconds. This is an inference from the phase timings, not a separately
measured timer. Export-option setup then took another 6.026 seconds. Phase
durations overlap their parent timers and should not be summed.

An instrumented repeat on 2026-10-20 reached **Next** in **71.730 seconds**.
It showed 9.195 seconds in `fileChooser.setFiles`, 15.308 seconds from the
loading dialog appearing until it closed, and 31.241 seconds across the export
menu, platform selection, and standard options. These timings vary sharply from
the preceding 27.624-second run, so they do not isolate code changes. Immediately
after this run the host showed a load average of 11.24 with 2 CPUs visible, and
CPU pressure `some avg10` was 80.09%. Host contention likely contributed to the
slow phases; this is an inference from the post-run host snapshot.

| Phase | Duration |
| --- | ---: |
| Playwright package resolution | 16 ms |
| Browser binary check | 6 ms |
| Browser initialization | 2.835 s |
| Construct account API authentication | 971 ms |
| Initial document ready | 557 ms |
| Authentication setup | 1.772 s |
| Auth reload | 241 ms |
| Project picker ready | 6.790 s |
| File chooser opened | 1.683 s |
| File selection completed | 9.195 s |
| Project loading dialog appeared | 60 ms |
| Project loading dialog dismissed | 15.308 s |
| Project open, including picker and loading | 33.045 s |
| Export menu selection | 13.131 s |
| Export platform selection | 12.170 s |
| Standard export options selection | 5.937 s |
| Web export options through **Next** | 31.241 s |
| Setup through **Next** | **71.730 s** |

These phase timers also overlap their parent timers and should not be summed.

## API authentication after document readiness (earlier candidate)

This candidate waited for the initial document and Construct session store
before requesting direct account-API authentication. It then injected the
session and reloaded before opening the project. The current flow starts the API
request earlier so it can overlap those waits.

On 2026-10-20, this flow reached **Next in 21.901 seconds** with full Chromium
headless and the same fixture and credentials. It still used the session
injection and editor reload. The run completed without Xvfb. The target remains
unmet. A post-run host snapshot showed CPU pressure `some avg10` at 23.21%; the
27.624-second run used the same browser mode but a different auth path and had
no matching host snapshot, so the difference does not isolate the auth-order
change.

| Phase | Duration |
| --- | ---: |
| Playwright package resolution | 4 ms |
| Browser binary check | 1 ms |
| Browser initialization | 1.090 s |
| Initial document ready | 304 ms |
| Construct account API authentication | 1.336 s |
| Authentication setup | 3.106 s |
| Auth reload | 352 ms |
| Project picker ready | 2.107 s |
| File chooser opened | 67 ms |
| File selection completed | 1.214 s |
| Project loading dialog appeared | 2.011 s |
| Project loading dialog dismissed | 6.367 s |
| Project open, including picker and loading | 11.768 s |
| Export menu selection | 1.100 s |
| Export platform selection | 2.882 s |
| Standard export options selection | 988 ms |
| Web export options through **Next** | 4.970 s |
| Setup through **Next** | **21.901 s** |

A repeat with this same code path reached **Next in 30.018 seconds**. Its
post-run CPU pressure `some avg10` was 79.66%, which is consistent with host
contention contributing to the variance, though not proof of the cause.

| Phase | Duration |
| --- | ---: |
| Playwright package resolution | 1 ms |
| Browser binary check | 1 ms |
| Browser initialization | 726 ms |
| Initial document ready | 433 ms |
| Construct account API authentication | 1.251 s |
| Authentication setup | 2.452 s |
| Auth reload | 191 ms |
| Project picker ready | 2.757 s |
| File chooser opened | 127 ms |
| File selection completed | 3.836 s |
| Project loading dialog appeared | 196 ms |
| Project loading dialog dismissed | 7.384 s |
| Project open, including picker and loading | 14.311 s |
| Export menu selection | 6.212 s |
| Export platform selection | 3.711 s |
| Standard export options selection | 1.501 s |
| Web export options through **Next** | 11.428 s |
| Setup through **Next** | **30.018 s** |

An experiment started the direct account-API request while Construct's
`localforage` session store initialized, then checked whether the copied profile
already had a session before using that request. Typecheck passed. It reached
**Next in 30.773 seconds**; post-run CPU pressure `some avg10` was 82.69%, so
this result is not a controlled comparison with the preceding run.

| Phase | Duration |
| --- | ---: |
| Playwright package resolution | 1 ms |
| Browser binary check | 1 ms |
| Browser initialization | 618 ms |
| Initial document ready | 417 ms |
| Construct account API authentication | 1.278 s |
| Authentication setup | 1.633 s |
| Auth reload | 317 ms |
| Project picker ready | 4.230 s |
| File chooser opened | 109 ms |
| File selection completed | 311 ms |
| Project loading dialog appeared | 164 ms |
| Project loading dialog dismissed | 12.513 s |
| Project open, including picker and loading | 17.332 s |
| Export menu selection | 3.939 s |
| Export platform selection | 4.320 s |
| Standard export options selection | 1.658 s |
| Web export options through **Next** | 9.922 s |
| Setup through **Next** | **30.773 s** |

## API request overlapped with navigation

The current flow starts the account-API request before editor navigation, while
navigation and Construct's session-store initialization proceed. Once the
editor page is ready, it checks for an existing copied-profile session and
waits for the API result only if injection is needed. Authentication remains
code-based; the Construct login UI is not used.

On 2026-10-20, this flow reached **Next in 18.032 seconds** with the same fixture
and credentials, full Chromium headless, and no Xvfb. It still injected the
session and reloaded the editor. The target remains unmet. The post-run host
snapshot showed CPU pressure `some avg10` at 18.08%, lower than the preceding
82.69% snapshot, so improvement from the earlier run cannot be attributed solely
to the change.

| Phase | Duration |
| --- | ---: |
| Playwright package resolution | 0 ms |
| Browser binary check | 0 ms |
| Browser initialization | 554 ms |
| Initial document ready | 310 ms |
| Construct account API authentication | 1.167 s |
| Authentication setup | 1.263 s |
| Auth reload | 330 ms |
| Project picker ready | 3.498 s |
| File chooser opened | 1.489 s |
| File selection completed | 87 ms |
| Project loading dialog appeared | 12 ms |
| Project loading dialog dismissed | 6.005 s |
| Project open, including picker and loading | 11.093 s |
| Export menu selection | 1.159 s |
| Export platform selection | 2.589 s |
| Standard export options selection | 543 ms |
| Web export options through **Next** | 4.294 s |
| Setup through **Next** | **18.032 s** |

A reload-free authentication attempt used `page.exposeFunction` and a
`localforage` proxy. Although the account API result was available to the page
before navigation, Construct did not read the injected session; the existing
session-injection and reload fallback still ran. The attempt reached **Next in
29.469 seconds** and showed no measured improvement. It is being removed. The
post-run CPU pressure `some avg10` was 27.09%; the result is not a controlled
comparison with the 18.032-second run.

| Phase | Duration |
| --- | ---: |
| Playwright package resolution | 3 ms |
| Browser binary check | 1 ms |
| Browser initialization | 747 ms |
| Initial document ready | 522 ms |
| Construct account API authentication | 1.995 s |
| Authentication setup | 1.729 s |
| Auth reload | 361 ms |
| Project picker ready | 4.006 s |
| File chooser opened | 846 ms |
| File selection completed | 3.611 s |
| Project loading dialog appeared | 48 ms |
| Project loading dialog dismissed | 9.122 s |
| Project open, including picker and loading | 17.639 s |
| Export menu selection | 2.057 s |
| Export platform selection | 5.305 s |
| Standard export options selection | 695 ms |
| Web export options through **Next** | 8.057 s |
| Setup through **Next** | **29.469 s** |

After removing the unsuccessful seed hook, the current auth-overlap flow was
measured again under full Chromium headless. It reached **Next in 20.955
seconds**. CPU pressure `some avg10` was 8.31% before the run and 20.20%
afterward, so host load increased while it ran. The target remains unmet.

| Phase | Duration |
| --- | ---: |
| Playwright package resolution | 1 ms |
| Browser binary check | 0 ms |
| Browser initialization | 575 ms |
| Initial document ready | 330 ms |
| Construct account API authentication | 1.059 s |
| Authentication setup | 1.123 s |
| Auth reload | 352 ms |
| Project picker ready | 2.446 s |
| File chooser opened | 67 ms |
| File selection completed | 325 ms |
| Project loading dialog appeared | 80 ms |
| Project loading dialog dismissed | 10.631 s |
| Project open, including picker and loading | 13.553 s |
| Export menu selection | 1.051 s |
| Export platform selection | 3.312 s |
| Standard export options selection | 537 ms |
| Web export options through **Next** | 4.904 s |
| Setup through **Next** | **20.955 s** |

## Disposable persistent-profile experiment

A temporary benchmark-only environment option reused a persistent Chromium
profile across two workflow-task runs. The cold run reached **Next in 21.377
seconds**. The repeat reused the Construct session and editor cache, skipped the
API login and auth reload, and reached **Next in 14.882 seconds**. CPU pressure
`some avg10` immediately before that repeat was 31.57%, so timings remain
environment-dependent. The profile stored the test session under `/tmp` and is
deleted after this experiment; persistent-profile behavior is not enabled by
default.

| Warm-run phase | Duration |
| --- | ---: |
| Browser initialization | 448 ms |
| Initial document ready | 163 ms |
| Authentication setup, existing session | 432 ms |
| Project picker ready | 1.258 s |
| File chooser opened | 96 ms |
| File selection completed | 110 ms |
| Project loading dialog appeared | 78 ms |
| Project loading dialog dismissed | 7.262 s |
| Project open, including picker and loading | 8.814 s |
| Export menu selection | 966 ms |
| Export platform selection | 3.149 s |
| Standard export options selection | 437 ms |
| Web export options through **Next** | 4.558 s |
| Setup through **Next** | **14.882 s** |

This default latest-editor warm run still missed the target. The same profile
was later tested with the fixture-matching editor release, where fully warmed
repeats did reach the target; profile reuse alone did not make the latest
editor path fast enough.

The same persistent profile was then used with the fixture-matching `r397`
editor release. Its first run reached **Next in 16.103 seconds**; after that
release's page assets were cached, the repeat took **12.443 seconds**. The
repeat still spent 6.312 seconds in the project-loading dialog, with 1.587
seconds to reach the picker and 1.967 seconds through export options. This
release-matching warm-profile path also did not meet the target.

| Warm r397 repeat phase | Duration |
| --- | ---: |
| Browser initialization | 633 ms |
| Initial document ready | 536 ms |
| Authentication setup, existing session | 516 ms |
| Project picker ready | 1.587 s |
| File chooser opened | 34 ms |
| File selection completed | 209 ms |
| Project loading dialog appeared | 62 ms |
| Project loading dialog dismissed | 6.312 s |
| Project open, including picker and loading | 8.212 s |
| Export menu selection | 498 ms |
| Export platform selection | 971 ms |
| Standard export options selection | 493 ms |
| Web export options through **Next** | 1.967 s |
| Setup through **Next** | **12.443 s** |

After this trial, a default latest-editor run on the same warm profile took
**19.191 seconds** to reach **Next**. It spent 7.272 seconds with the project
loading dialog open and 5.815 seconds in export options. The latest-editor
result shows that profile reuse alone does not consistently reach the target.

The fixture's `savedWithRelease: 39700` was used to benchmark the matching
`r397` editor on the same authenticated, cached profile. The first under-10
result was **9.442 seconds** with a read-only recent-page diagnostic enabled.
Three diagnostic-free repeats reached **Next** in 9.641, 8.788, and 9.091
seconds. The workflow timer started at task entry and stopped at **Next** in
each run; internal export preparation and ZIP download were excluded. All runs
used Playwright's full Chromium (`channel: "chromium"`) in headless mode, with
the existing Construct session and page-asset cache in a disposable persistent
profile. No Construct login UI was used. The first repeat began with CPU
pressure `some avg10` at 4.39%; the second began after a 23.93% snapshot. The
host was not otherwise normalized.

| Phase | Run 1 (9.641 s) | Run 2 (8.788 s) | Run 3 (9.091 s) |
| --- | ---: | ---: | ---: |
| Browser initialization | 504 ms | 505 ms | 515 ms |
| Initial document ready | 361 ms | 324 ms | 423 ms |
| Authentication setup, existing session | 452 ms | 395 ms | 505 ms |
| Project picker ready | 1.163 s | 1.141 s | 1.156 s |
| File chooser opened | 127 ms | 49 ms | 66 ms |
| File selection completed | 160 ms | 114 ms | 256 ms |
| Project loading dialog dismissed | 4.840 s | 4.099 s | 4.176 s |
| Project open, including picker and loading | 6.335 s | 5.461 s | 5.711 s |
| Export menu selection | 437 ms | 523 ms | 508 ms |
| Export platform selection | 679 ms | 666 ms | 584 ms |
| Standard export options selection | 315 ms | 422 ms | 298 ms |
| Web export options through **Next** | 1.435 s | 1.615 s | 1.390 s |
| Setup through **Next** | **9.641 s** | **8.788 s** | **9.091 s** |

These runs establish a repeatable sub-10 path when the matching editor assets
and Construct session are already warm. They do not establish sub-10 setup for
the default latest editor with a fresh temporary profile: the best measured
default latest-editor run remains 18.032 seconds. At the time of these trials,
the disposable persistent-profile path was benchmark-only and was removed
afterward. The Pipelab-managed persistent profile is now the default; see the
section below. The short runs depended on an existing authenticated session,
so they did not include a fresh API-authentication or reload phase.

## Warm editor cache with fresh API authentication

To isolate the cached editor assets from the saved login, a repeat used the
warm r397 profile after clearing Construct's stored `login-data` before the
authentication check. The provider then authenticated through Construct's
account API, injected the returned session, and reloaded the editor. It reached
**Next in 12.625 seconds**. The pre-run CPU pressure `some avg10` was 49.72%,
so this diagnostic is not a clean timing comparison and does not establish
whether cached assets plus fresh API authentication can meet the target. The
benchmark-only session-clear and persistent-profile hooks were removed, and
the temporary profile was deleted afterward.

A second cached-assets/fresh-auth repeat reached **Next in 12.476 seconds**.
It cleared `login-data` and completed a new code-based account-API login on the
task. Pre-run CPU pressure was lower at `some avg10` 19.50%, though the host was
still contended. This confirms that cached editor assets without a saved login
did not reach 10 seconds in the observed runs; a low-contention repeat would be
needed to isolate how much the host contributed.

| Phase | Duration |
| --- | ---: |
| Browser initialization | 544 ms |
| Initial document ready | 199 ms |
| Construct account API authentication | 1.448 s |
| Authentication setup, including injection and reload | 1.673 s |
| Project picker ready | 1.037 s |
| File chooser opened | 76 ms |
| File selection completed | 249 ms |
| Project loading dialog dismissed | 6.434 s |
| Project open, including picker and loading | 7.884 s |
| Export menu selection | 617 ms |
| Export platform selection | 747 ms |
| Standard export options selection | 442 ms |
| Web export options through **Next** | 1.816 s |
| Setup through **Next** | **12.625 s** |

| Second repeat phase | Duration |
| --- | ---: |
| Browser initialization | 1.131 s |
| Initial document ready | 489 ms |
| Construct account API authentication | 1.596 s |
| Authentication setup, including injection and reload | 1.212 s |
| Project picker ready | 1.095 s |
| File chooser opened | 84 ms |
| File selection completed | 321 ms |
| Project loading dialog dismissed | 5.853 s |
| Project open, including picker and loading | 7.430 s |
| Export menu selection | 620 ms |
| Export platform selection | 585 ms |
| Standard export options selection | 331 ms |
| Web export options through **Next** | 1.540 s |
| Setup through **Next** | **12.476 s** |

## Early Ctrl+O experiment (reverted)

An experiment sent Ctrl+O repeatedly while Construct's project picker was
initializing, to overlap picker startup with file selection. It caused
Construct's startup error screen on both attempts. One run recovered after a
reload and reached **Next in 10.175 seconds**; the repeat failed after the
existing retry and never reached **Next**. This is unreliable and did not meet
the target, so the early shortcut polling was reverted. The normal flow waits
for the Open control before sending Ctrl+O.

## Pipelab-managed profile

The Pipelab-managed persistent profile is now the default. A setup run on
2026-10-20 used full Chromium in headless mode with the matching `r397` editor
and reached **Next in 13.066 seconds** on its first run. It authenticated via
the Construct account API and the profile occupied **3,973,120 bytes** after
the run. A repeat reused the saved session and reached **Next in 8.118
seconds**; the profile then occupied **4,067,328 bytes** (about 4 MB). Both
measurements stopped at **Next**, before Construct's internal export
preparation and ZIP download. The first run did not meet the 10-second target;
the warm repeat did. These are local measurements, not a controlled comparison
with the earlier disposable-profile trials.

The managed directory lives under Pipelab's configured cache at
`pipelines/construct/profiles`. It keeps login state and browser/editor data
between runs. Before each export, Pipelab refreshes the managed profile from
the selected Chromium profile and keeps the managed browser cache in place. A
session updated in the selected profile is therefore available on the next run.
The benchmark above did not select a source profile, so its measured size and
timings do not include copying a user's Chromium profile.

## Latest-editor and profile-refresh trials

On 2026-10-20, the default latest Construct editor reached **Next in 29.482
seconds** on its first run and **17.227 seconds** on a repeat with the same
managed profile. Both runs excluded Construct's internal export preparation
and ZIP download. These runs did not select a source profile and do not
measure the profile-refresh path.

The source-profile refresh path was then exercised by using the existing
benchmark profile as a stand-in source. On a warm latest-editor repeat, profile
setup took **147 ms**, the profile occupied **8,699,904 bytes**, and setup
reached **Next in 16.715 seconds**. The pre-run CPU pressure was 6.59% over 10
seconds. Switching that managed profile to `r397` reached **Next in 12.508
seconds** on the first run and **15.162 seconds** on a repeat. The repeat was
followed by CPU pressure at 49.51% over 10 seconds, so it is not a controlled
comparison with the first run. The sync itself took 209–240 ms in the two
`r397` trials. The profile copy preserved the managed cache directories.

An earlier first run through this copied-profile path took **38.371 seconds**
while post-run CPU pressure was 59.61% over 10 seconds. It is retained as a
contended diagnostic and is not representative timing evidence. None of these
latest-editor or version-switch trials reached the 10-second target.

After both editor-version caches were present, three more warm `r397` runs
used the same source-profile refresh path. The first two reached **Next in
9.619 and 9.849 seconds** with CPU pressure at 13.19% and 11.20% over 10
seconds before each run. Profile refresh took 177 and 194 ms. A third repeat
took **18.239 seconds**; CPU pressure immediately afterward was 63.97% over 10
seconds. The managed profile was about **10 MB** after caching both versions.
The source was a previously managed benchmark profile, not a user's Chrome
profile, so the copy timing is representative of the sync code but not of a
large personal browser profile.

An action-level latest-editor diagnostic reached **Next in 28.093 seconds**.
It spent 12.872 seconds with the project-loading dialog open, then 2.690
seconds on the Construct menu button, 2.016 seconds selecting the Project menu,
and 4.023 seconds selecting Web. The platform and standard-options dialogs
became ready in under half a second. CPU pressure immediately afterward was
79.84% over 10 seconds; this run does not isolate Construct's normal UI cost.

A further warm latest-editor run using the per-run profile refresh reached
**Next in 19.743 seconds**. Profile refresh took 164 ms, project open took
11.402 seconds, and the export-options sequence took 5.042 seconds. The
profile occupied 10,117,120 bytes. CPU pressure before the run was
`/proc/pressure/cpu avg10=8.82`, `avg60=23.68`, and `avg300=31.83`; after the
run it was `avg10=42.75`. This measurement also missed the target and does not
show a stable latest-editor result under controlled load.

## Saved project release default

A warm comparison using the same project-scoped profile reached **Next in
16.937 seconds** with the latest editor, then **8.228 seconds** with the
fixture-matching `r397` editor. Profile refresh took 99 ms and 141 ms. The
latest-editor run began with CPU pressure `avg10=10.50`; the `r397` run began
after the latest run, with `avg10=25.21`. Despite higher pressure, the `r397`
run opened the project in 4.925 seconds and completed export-option selection
in 1.398 seconds. This comparison indicates the editor release is a major
factor, though the host was not controlled.

Pipelab now uses the `savedWithRelease` value in `project.c3proj` when the
Construct version input is blank. An explicit release still overrides it, and
`latest` selects the current editor. The fixture's `savedWithRelease: 39700`
resolves to `r397`. Construct archives can contain Windows-style backslashes
in other entry names, so metadata reading disables the ZIP library's entry
name validation while reading only the fixed root `project.c3proj` member; it
does not extract project files.

The first inference trials fell back to the latest editor because the ZIP
reader rejected those backslash entries. After fixing that lookup, the
provider log confirmed it selected `r397`. One default-path run reached **Next
in 15.235 seconds** with `/proc/pressure/cpu avg10=47.78` before the run; project
opening took 10.582 seconds. This run is a contended diagnostic and does not
verify the target. A lower-pressure repeat of the version-inferred default is
still needed.

A second default-path run also selected `r397` and reached **Next in 14.319
seconds**. Profile refresh took 55 ms, project open took 9.044 seconds, and
export options took 2.650 seconds. Pre-run CPU pressure was
`avg10=28.27`, `avg60=21.33`, and `avg300=25.00`; post-run pressure was
`avg10=23.51`, `avg60=30.83`, and `avg300=27.43`. This confirms inference on the
production task path, but the target remains unverified for the inferred
default under lower load.

After CPU pressure fell, two more warm runs exercised the blank-version
default. Both logs confirmed inference to `r397`. The first reached **Next in
10.027 seconds** with pre-run pressure `avg10=4.47`, `avg60=15.18`, and
`avg300=23.63`; the repeat reached **Next in 8.361 seconds** with pre-run
pressure `avg10=4.95`, `avg60=11.12`, and `avg300=20.94`. The 8.361-second
repeat opened the project in 4.951 seconds and completed export-option
selection in 1.414 seconds. The profile was 10,252,288 bytes afterward. This
meets the setup target on the normal blank-version path with the matching
editor assets warm.

The explicit `latest` override reached **Next in 16.421 seconds** using the
same persistent profile; profile refresh took 111 ms. Pre-run pressure was
`avg10=10.87`. Project open took 8.730 seconds and the export-options sequence
took 5.803 seconds. A user-selected `latest` release therefore remains slower
than the target; matching the project-saved release is what makes the default
path fast.

A second explicit-`latest` run at lower pre-run pressure
(`avg10=4.57`, `avg60=8.10`, `avg300=16.02`) reached **Next in 16.533
seconds**. Profile refresh took 134 ms; project open took 9.542 seconds and
the export-options sequence took 5.210 seconds. This confirms the slower
latest-editor path is not explained by the observed CPU pressure alone.

## Earlier full warm export (Node 26)

Three runs completed the Construct source task through ZIP artifact
registration, using the same warmed project-scoped profile, the matching
`r397` editor, Node v26.7.0, and full Chromium in headless mode. This earlier
series checked task completion and artifact registration; the later harness
also inspects the ZIP contents. Full duration is measured
from `runWorkflowTask` invocation through its successful return. It includes
setup through **Next**, Construct's export preparation and ZIP download, and
artifact registration; it excludes subsequent workflow steps such as archive
extraction.

| Run | Pre-run CPU pressure (`some avg10`) | Setup through **Next** | Full source task |
| --- | ---: | ---: | ---: |
| 1 | 4.43% | 10.374 s | 13.597 s |
| 2 | 34.27% | 10.258 s | 13.357 s |
| 3 | 41.88% | 10.574 s | 20.989 s |
| **Mean** | — | **10.402 s** | **15.981 s** |

The third run took longer after **Next** than the first two. The first run
started under lower CPU pressure; the later two started under elevated
pressure. These are local observations, not a controlled benchmark. The
full-export mean is specific to this small fixture and should not be treated
as a universal project export duration.


## Export shortcut investigation

A follow-up on 2026-10-20 replaced Menu → Project → Export with Construct's
F6 export shortcut. Profile refresh, project loading, Web (HTML5) selection,
export options and download verification remain part of every export. No
extra-tab or profile chmod optimization was included.

Two interleaved full runs per implementation used the existing warm profile,
same r397 fixture, Node 24.19.0, full Chromium headless, and the reproduction
command above. Every run verified a 389,254-byte ZIP containing a readable
root index.html. Host CPU pressure varied substantially.

| Invocation order | Opener | CPU pressure before → after | Setup | Full export | Opener dispatch |
| --- | --- | --- | ---: | ---: | ---: |
| 1 | Menu | 16.79 → 90.25 | 24.939 s | 36.398 s | 6.813 s |
| 2 | F6 | 56.40 → 69.18 | 13.288 s | 17.040 s | 0.009 s |
| 3 | Menu | 30.75 → 58.27 | 10.703 s | 14.009 s | 0.551 s |
| 4 | F6 | 69.02 → 84.86 | 23.058 s | 25.829 s | 0.028 s |

These full samples do not prove an overall speedup: the menu setup mean was
17.821 s and the F6 setup mean was 18.173 s. The full means were 25.204 s and
21.435 s respectively, but project loading, internal export preparation and
host contention also varied. Do not attribute that full-time difference to F6.

A separate same-session comparison isolated opening the export dialog after
one project load, including waiting for the platform dialog to become visible.
Each opener was followed by Cancel; order alternated between pairs. The
instrumented run's setup/full durations include these extra interactions and
are not ordinary-export measurements.

| Pair | Order | Menu opener | F6 opener | Saving |
| --- | --- | ---: | ---: | ---: |
| 1 | Menu, F6 | 844 ms | 44 ms | 800 ms |
| 2 | F6, Menu | 469 ms | 54 ms | 415 ms |
| 3 | Menu, F6 | 461 ms | 35 ms | 426 ms |
| 4 | F6, Menu | 551 ms | 55 ms | 496 ms |

Mean isolated saving was **534.25 ms**, with all four F6 samples below all
four menu samples. CPU pressure was 29.56 before and 53.67 after. F6 avoids
the menu path that took multiple seconds in the contended full sample, but
these results do **not** establish a consistent several-second saving or a
reliable sub-10-second setup.

A separate project-load diagnostic measured 5.713 s opening the project,
including 4.420 s with the loading dialog visible. Renderer TaskDuration grew
by 5.044 s; ScriptDuration grew by 0.747 s. The longest observed finished
script/image/font/stylesheet request during that phase took 445 ms. A CPU
profile showed 3.332 s under the generic `(program)` bucket and no individual
JavaScript function accounting for multiple seconds. These diagnostics do not
identify a safe project-loading optimization. Instrumentation was removed.
The diagnostic setup time of 9.833 s is not evidence of the shortcut's effect.

Safe raw logs from this investigation are at
`/tmp/construct-seconds-baseline.log`,
`/tmp/construct-seconds-baseline-02.log`,
`/tmp/construct-seconds-f6-01.log`, `/tmp/construct-seconds-f6-02.log`,
`/tmp/construct-seconds-openers-paired.log`,
`/tmp/construct-seconds-project-diagnostic.log`, and
`/tmp/construct-seconds-cpu-diagnostic.log` on the benchmark host.

## Export shortcut reliability follow-up (2026-10-21)

The F6 opener was removed from production after a real workflow on Construct
`r466-2` pressed F6 but remained on the project Properties panel; the Web
(HTML5) export chooser never appeared. Production again follows the documented
Menu → Project → Export route. The F6 timings above are historical and do not
describe the current opener.
