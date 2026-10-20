# Construct setup baseline

The baseline for Pipelab's Construct setup is **28.6 seconds median**. The
target is under 10 seconds. Setup ends when Pipelab clicks Construct's **Next**
button; Construct's internal export preparation and download happen after that
point and are excluded from this metric.

With the warmed project-matched editor as the default, two low-pressure runs
reached **Next in 10.027 and 8.361 seconds** (9.194-second median). The target
is met on the repeat; selecting the explicit `latest` editor remains slower at
16.533 seconds, including under low pre-run CPU pressure.

Three full warm exports completed in a mean of **15.981 seconds** from workflow
task entry through successful ZIP artifact registration. They included
Construct's internal export preparation and download; see the full-export
measurements below.

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
64.739 s, 42.912 s, and 27.841 s (35.4 s median). These include work after the
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

## Full warm export

Three runs completed the Construct source task through ZIP artifact
registration, using the same warmed project-scoped profile, the matching
`r397` editor, and full Chromium in headless mode. Full duration is measured
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
