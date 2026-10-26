# Construct 3

Pipelab can export a Construct project for use as a web application. The Release workflow source accepts a `.c3p` project file and produces a web directory artifact. It opens Construct in a local Chromium browser and extracts the exported archive.

## Release workflow source

Add **Construct project** as the source, then choose:

| Field             | Requirement          | Default / behavior                                                                                |
| ----------------- | -------------------- | ------------------------------------------------------------------------------------------------- |
| Project file      | Required `.c3p` file | Empty                                                                                             |
| Browser profile   | Required             | A local Chromium profile used to seed Pipelab's managed profile                                   |
| Construct account | Optional             | A workflow alias for a Construct Account Connection with username and password fields             |
| Construct version | Optional             | Blank uses the saved release when present; enter `latest` or a release such as `r397` to override |

The source compiles to an export action followed by an unzip action. Its final artifact is an application for **web**, stored as a **directory**. Use that artifact as input to a compatible producer or destination.

Exports run in Chromium's full headless mode by default and do not require
Xvfb. Native Workflow tasks can set `headless: false` for visual debugging.

Before Construct's editor code loads, Pipelab seeds the automation-owned
Chromium profile to dismiss the welcome tour, disable **Enable UI animations**
and **Enable UI effects**, and turn off **Show the Start Page on startup**.
It also disables **Check for updates for installed addons** in Construct
releases that support that setting (r422 and later). Other saved Construct
settings are preserved, and the selected Chromium profile stays unchanged.

## Requirements and failures

Choose a compatible local Chromium profile that can access the Construct editor and project. Pipelab refreshes its managed profile from the selected profile before each run, while keeping the managed browser and Construct cache in place. This picks up current login state and installed Construct addons without requiring a profile reset. With no Construct Account Connection, the managed profile is scoped to the Pipelab project and selected browser profile and uses that profile's saved login. With a Connection, the profile is also scoped to the account username; Pipelab keeps a separate account session and does not import the selected profile's Construct login data. Changing Construct versions reuses that account-scoped profile while keeping stable and beta account sessions separate. Pipelab does not modify the selected browser profile. Same-profile exports run one at a time.

The managed profile remains in Pipelab's local cache between runs and can
include site data from the selected Chromium profile beyond Construct. Pipelab
does not automatically expire or remove this managed copy. On POSIX systems,
its managed profile directories are restricted to the current user.

When **Construct version** is blank, Pipelab reads `savedWithRelease` from
`project.c3proj` inside the selected `.c3p` file and opens that Construct
release. If the project has no saved release metadata, Pipelab uses the current
editor. Enter `latest` to use the current editor or provide a release such as
`r397` or the patch release `r432-2` to override the project version for that
run. Saved patch releases are preserved when the version is blank.

If required profile data cannot be refreshed, Pipelab stops the export rather
than using an older copy. Cancelling a queued export or an export refreshing
its profile stops it before browser launch.

If the selected browser profile is signed out of Construct or its session has
expired, a profile-only export requires a valid login session. Pipelab does not
modify the selected browser profile.

Desktop remembers the local Construct Connection selected for the workflow
alias. CLI runs do not need a saved Connection registry; provide the alias's
username and password from the environment that starts the run. When a
Construct Account Connection is selected, Pipelab keeps its session in a
username-scoped managed profile without importing the selected browser
profile's Construct login data. It authenticates through Construct's account
service on first use or when the cached session is rejected, then reuses a
confirmed session for that account. Leave the account alias empty to use the
selected profile's saved session.

For CLI runs, keep the credentials in a secret manager such as Doppler and pass
only environment variable names to `--connection`:

```sh
doppler run --project pipelab --config dev_personal -- pipelab workflow run <workflow-id> \
  --connection construct-production.username=env:CONSTRUCT_USERNAME \
  --connection construct-production.password=env:CONSTRUCT_PASSWORD
```

Replace `construct-production` with the alias saved in the workflow. Pipelab
checks that both required fields are present before starting export. Connection
values are redacted from run logs, errors, and saved results. Literal CLI
values are accepted, but may appear in shell history and process listings.
If Construct reports that the project exceeds Free edition limits, Pipelab
shows a plan-specific error after account authentication and project loading.

Existing custom profile directories outside the usual browser locations remain selectable when they contain a Chromium `Preferences` file. Profile selection reads browser metadata without launching a browser or scanning profile storage. Project loading and download preparation have bounded waits (120 seconds by default). If the download is not ready in time, the run error includes Construct's visible status and a screenshot path when it can capture one. Browser launch, sign-in, timeout, export, and archive extraction failures appear in the run logs. The provider does not declare a host-platform allowlist, so exact OS coverage is not guaranteed here.

Pipelab's currently registered Construct integration does not provide the
in-editor addon or Discord/Steam Rich Presence actions described by older
guides.
