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
The managed copy stays in Pipelab's local cache between runs and can include
site data from the selected Chromium profile beyond Construct. On POSIX systems,
the managed profile directories are restricted to the current user.
Cancellation stops a queued export or profile refresh before browser launch.
If required profile data cannot be refreshed, the export stops instead of
using stale session or addon data. The selected profile must contain a valid
Construct session when the task has no credentials to renew it.

Set both `CONSTRUCT_USERNAME` and `CONSTRUCT_PASSWORD` to renew a Construct
session from the account service. If neither is set, the selected profile's
saved session is used. Setting only one fails before export starts.

The export automation opens Construct's export dialog through Menu → Project →
Export, then selects Web (HTML5) and the standard export options.

Projects that reference the supported Pipelab Construct addon (`pipelabv2`
2.5.1, SDK v2) are checked in Construct's Addon Manager before the project is
opened. If it is missing from the project-scoped managed profile, Pipelab
downloads the official release asset, checks its pinned SHA-256 and embedded
addon metadata, installs it through Construct, reloads the editor, and verifies
the installed addon in Addon Manager. Other addon versions are left untouched
and require a matching addon in the selected profile.

See [PERF.md](./PERF.md) for the local setup and full-export measurements and
their conditions.
