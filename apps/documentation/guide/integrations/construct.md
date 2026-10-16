# Construct 3

Pipelab can export a Construct project for use as a web application. The Release workflow source accepts a `.c3p` project file and produces a web directory artifact. It opens Construct in a local Chromium browser and extracts the exported archive.

## Release workflow source

Add **Construct project** as the source, then choose:

| Field           | Requirement          | Default / behavior                                                                          |
| --------------- | -------------------- | ------------------------------------------------------------------------------------------- |
| Project file    | Required `.c3p` file | Empty                                                                                       |
| Browser profile | Required             | Listed from local Chromium profile metadata and checked when the editor inspects the source |

The source compiles to an export action followed by an unzip action. Its final artifact is an application for **web**, stored as a **directory**. Use that artifact as input to a compatible producer or destination.

## Requirements and failures

Use a compatible local Chromium profile that can access the Construct editor and project. Reusing a profile can preserve Construct addons installed in that browser. Existing custom profile directories outside the usual browser locations remain selectable when they contain a Chromium `Preferences` file. The Release source requires both the `.c3p` path and profile path. Profile selection reads browser metadata without launching a browser or scanning profile storage. During export, Pipelab waits up to the configured timeout (120 seconds by default) for Construct to prepare the project download. If the download is not ready in time, the run error includes Construct's visible status and a screenshot path when it can capture one. Browser launch, sign-in, timeout, export, and archive extraction failures appear in the run logs. The provider does not declare a host-platform allowlist, so exact OS coverage is not guaranteed here.

Pipelab's currently registered Construct integration does not provide the
in-editor addon or Discord/Steam Rich Presence actions described by older
guides.
