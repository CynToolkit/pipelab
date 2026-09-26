# Construct 3

Pipelab can export a Construct project for use as a web application. The Release workflow source accepts a `.c3p` project file and produces a web directory artifact. It opens Construct in a local Chromium browser and extracts the exported archive.

## Release workflow source

Add **Construct project** as the source, then choose:

| Field | Requirement | Default / behavior |
|---|---|---|
| Project file | Required `.c3p` file | Empty |
| Browser profile | Required | Discovered from installed Chromium profiles when the editor inspects the source |

The source compiles to an export action followed by an unzip action. Its final artifact is an application for **web**, stored as a **directory**. Use that artifact as input to a compatible producer or destination.

The registered **Export .c3p** pipeline action accepts a required `.c3p` file and optional username, password, Construct version, headless flag (default `false`), timeout (default 120 seconds), and custom browser profile. The password is used by local browser automation; the action description says it is not sent to a server. The registered **Export folder** action takes a folder and the same shared export options, packages that folder as a temporary `.c3p`, then exports it. These pipeline actions report `zipFile` and `parentFolder` path outputs (the older `folder` output is deprecated).

## Requirements and failures

Use a compatible local Chromium profile that can access the Construct editor and project. Reusing a profile can preserve Construct addons installed in that browser. The Release source requires both the `.c3p` path and profile path. The standalone actions fail when their required input is missing or invalid; browser launch, sign-in, timeout, export, and archive extraction failures appear in the run logs. The plugin does not declare a host-platform allowlist, so exact OS coverage is not guaranteed here.

## Minimal action inputs

For the registered **Export .c3p** action, the smallest valid input is:

```text
file: /path/to/game.c3p
```

The pipeline action does not declare a default browser profile. Select one in the task editor if the browser automation needs an existing Construct session or installed addons.

Pipelab's currently registered Construct integration does not provide the in-editor addon or Discord/Steam Rich Presence actions described by older guides.
