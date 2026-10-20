# Construct 3

Pipelab can export a Construct project for use as a web application. The Release workflow source accepts a `.c3p` project file and produces a web directory artifact. It opens Construct in a local Chromium browser and extracts the exported archive.

## Release workflow source

Add **Construct project** as the source, then choose:

| Field             | Requirement          | Default / behavior                                                                                 |
| ----------------- | -------------------- | -------------------------------------------------------------------------------------------------- |
| Project file      | Required `.c3p` file | Empty                                                                                              |
| Browser profile   | Required             | A local Chromium profile used to seed Pipelab's managed profile                                   |
| Construct version | Optional             | Blank uses the saved release when present; enter `latest` or a release such as `r397` to override |

The source compiles to an export action followed by an unzip action. Its final artifact is an application for **web**, stored as a **directory**. Use that artifact as input to a compatible producer or destination.

## Requirements and failures

Choose a compatible local Chromium profile that can access the Construct editor and project. Pipelab refreshes its managed profile from the selected profile before each run, while keeping the managed browser and Construct cache in place. This picks up current login state and installed Construct addons without requiring a profile reset. The managed profile is scoped to the Pipelab project and selected browser profile; changing Construct versions for that project reuses the same profile. Pipelab does not modify the selected browser profile. Same-profile exports run one at a time.

When **Construct version** is blank, Pipelab reads `savedWithRelease` from
`project.c3proj` inside the selected `.c3p` file and opens that Construct
release. If the project has no saved release metadata, Pipelab uses the current
editor. Enter `latest` to use the current editor or provide a release such as
`r397` to override the project version for that run.

If the selected browser profile itself is signed out of Construct, Pipelab cannot create a valid session from that profile. Sign in there once; the refreshed session is copied automatically on the next run. Existing custom profile directories outside the usual browser locations remain selectable when they contain a Chromium `Preferences` file. Profile selection reads browser metadata without launching a browser or scanning profile storage. During export, Pipelab waits up to the configured timeout (120 seconds by default) for Construct to prepare the project download. If the download is not ready in time, the run error includes Construct's visible status and a screenshot path when it can capture one. Browser launch, sign-in, timeout, export, and archive extraction failures appear in the run logs. The provider does not declare a host-platform allowlist, so exact OS coverage is not guaranteed here.

Pipelab's currently registered Construct integration does not provide the
in-editor addon or Discord/Steam Rich Presence actions described by older
guides.
