# Construct provider

Pipelab provider for automating Construct 3 project exports.

Import the named `constructProvider` export from `@pipelab/providers` to consume its
identity, integrations, Release source, and native Workflow task factories.

Construct exports use Playwright's full Chromium build. Headless exports use
Chromium's modern headless mode and do not require Xvfb. Headless mode is the
default. For a native Workflow task, set `headless: false` when you need to
watch the browser while debugging.

When **Construct version** is blank, Pipelab uses the release saved with the
`.c3p` project when available, including its patch release. The Release source's
optional version field accepts `latest` or a specific release such as `r397`
or `r432-2`.

Construct exports keep a managed Chromium profile in Pipelab's cache, scoped
to the Pipelab project and selected browser profile. Pipelab refreshes browser
state from the selected profile on every run while keeping its cached Construct
assets. Login state and editor cache persist across runs and Construct versions.
Same-profile exports are serialized.
Cancellation stops a queued export or profile refresh before browser launch.
If required profile data cannot be refreshed, the export stops instead of
using stale session or addon data. The selected profile must contain a valid
Construct session when the task has no credentials to renew it.

See [PERF.md](./PERF.md) for the measured local setup-time baseline and its
conditions.
