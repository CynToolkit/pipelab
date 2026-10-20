# Construct provider

Pipelab provider for automating Construct 3 project exports.

Import the named `constructProvider` export from `@pipelab/providers` to consume its
identity, integrations, Release source, and native Workflow task factories.

Construct exports use Playwright's full Chromium build. Headless exports use
Chromium's modern headless mode and do not require Xvfb. Headless mode is the
default; disable **Start headless** when you need to watch the browser.

When **Construct version** is blank, Pipelab uses the release saved with the
`.c3p` project when available. Enter `latest` or a specific release to override
it.

Construct exports keep a managed Chromium profile in Pipelab's cache, scoped
to the Pipelab project and selected browser profile. Pipelab refreshes browser
state from the selected profile on every run while keeping its cached Construct
assets. Login state and editor cache persist across runs and Construct versions.
Same-profile exports are serialized.

See [PERF.md](./PERF.md) for the measured local setup-time baseline and its
conditions.
