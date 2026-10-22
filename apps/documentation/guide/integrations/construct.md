# Construct 3

Pipelab can export a Construct project for use as a web application. The Release workflow source accepts a `.c3p` project file and produces a web directory artifact. It opens Construct in a local Chromium browser and extracts the exported archive.

## Release workflow source

Add **Construct project** as the source, then choose:

| Field             | Requirement          | Default / behavior                                                                                |
| ----------------- | -------------------- | ------------------------------------------------------------------------------------------------- |
| Project file      | Required `.c3p` file | Empty                                                                                             |
| Browser profile   | Required             | A local Chromium profile used to seed Pipelab's managed profile                                   |
| Construct version | Optional             | Blank uses the saved release when present; enter `latest` or a release such as `r397` to override |

The source compiles to an export action followed by an unzip action. Its final artifact is an application for **web**, stored as a **directory**. Use that artifact as input to a compatible producer or destination.

Exports run in Chromium's full headless mode by default and do not require
Xvfb. Native Workflow tasks can set `headless: false` for visual debugging.

## Requirements and failures

Choose a compatible local Chromium profile that can access the Construct editor and project. Pipelab refreshes its managed profile from the selected profile before each run, while keeping the managed browser and Construct cache in place. This picks up current login state and installed Construct addons without requiring a profile reset. The managed profile is scoped to the Pipelab project and selected browser profile; changing Construct versions for that project reuses the same profile. Pipelab does not modify the selected browser profile. Same-profile exports run one at a time.

The managed profile remains in Pipelab's local cache between runs and can
include site data from the selected Chromium profile beyond Construct. On POSIX
systems, its managed profile directories are restricted to the current user.

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

For CLI runs, set both `CONSTRUCT_USERNAME` and `CONSTRUCT_PASSWORD` in the
process environment to provide Construct task inputs. Keep the values in a
secret manager such as Doppler; the workflow stores only runtime references.
When both are configured, Pipelab requests a fresh session from Construct's
account service and injects it into the managed profile, including when a
selected profile has a stale login record. When neither variable is set,
exports use the selected profile's saved session. Setting only one variable
fails before export starts, instead of falling back to the saved session. A
missing referenced variable is reported by name, with its value redacted from
run logs and result values; artifact paths remain intact for reopening output.
If Construct reports that the project exceeds the Free edition limits, the
export stops with a plan-specific error before waiting for standard export
options.

```sh
doppler run --project pipelab --config dev_personal -- pipelab workflow run <workflow-id>
```

Existing custom profile directories outside the usual browser locations remain selectable when they contain a Chromium `Preferences` file. Profile selection reads browser metadata without launching a browser or scanning profile storage. Project loading and download preparation have bounded waits (120 seconds by default). If the download is not ready in time, the run error includes Construct's visible status and a screenshot path when it can capture one. Browser launch, sign-in, timeout, export, and archive extraction failures appear in the run logs. The provider does not declare a host-platform allowlist, so exact OS coverage is not guaranteed here.

Pipelab's currently registered Construct integration does not provide the
in-editor addon or Discord/Steam Rich Presence actions described by older
guides.
