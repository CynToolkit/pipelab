# Build and ship with a Release workflow

A Release workflow prepares an artifact and routes it to one or more
destinations.

## Configure a workflow

1. From the dashboard, choose **New workflow** in a project.
2. In **Name & description**, enter the workflow name and description.
3. In **Source & project path**, choose a source and provide its required
   project file or folder. Source-specific file rules apply, such as `.c3p` for
   Construct projects or `.zip` for ZIP sources.
4. In **Destinations**, choose one or more places to publish the release.
5. Check **Review** for the workflow name, description, source and path, and
   destinations, then choose **Create workflow**. Pipelab applies any existing
   build and output defaults that can be resolved. It opens the workflow's
   **Configuration** section after creation.

If setup still needs information, an **Action required** card explains the
current blocker and offers one relevant action. Use its previous and next
controls to move between blockers. The action opens the source, destination,
or build editor in Configuration, or takes you to Connections. For a missing
provider account, **Add** opens a new connection form; **Select** opens the
existing destination field so you can choose a saved account. Unresolved
defaults remain visible there for you to complete.

Provider cards are populated from the providers available in the application.
Compatibility depends on the artifact type, destination, selected target, and
host. The [provider catalog](/guide/integrations/) links to the exact inputs,
credentials, tools, and target limitations for each provider.

### Connections and values

Connection fields use workflow aliases such as `itch-studio` or
`steam-production`. Pipelab names the alias for you when you pick an account;
it appears under the account field, where the pencil icon renames it. The
workflow stores the alias; Desktop remembers which
saved Connection fulfills it for that workflow. The same alias can resolve to
a different saved Connection in another workflow. Changing a saved Connection's
display name does not change the workflow alias. Renaming an alias updates its
workflow references and shows a reminder to update any CLI or CI mappings that
use the old name.

A destination is labelled with its provider name, such as **Steam**. When a
workflow has two destinations for the same provider they are numbered (**Steam
1**, **Steam 2**); give each a destination name such as **Studio** or
**Personal** to tell them apart. The editor shows that name beside the provider
(for example, **Itch.io — Studio**) and keeps it separate from the Connection
alias. Before shipping, Pipelab previews the selected saved
account for each destination and warns if multiple destinations use the same
Connection; using one account more than once is allowed when that is intended.

The creation wizard stays focused on the essentials and does not show these
advanced controls; set up accounts, aliases, and value sources in
Configuration after creating the workflow.

Ordinary provider properties are literal values by default. To save an
environment binding instead, turn on **Use environment variable** beside the
field's label in Configuration and enter the variable name. Pipelab reads that variable from the environment of
the client that starts the run and checks required bindings before starting any
workflow steps. Connection fields are managed through aliases and do not use
this ordinary-property control.

### Run a portable workflow from CLI or CI

A portable Release Workflow JSON file can run without a saved workflow index or a local Connection registry. Keep the workflow file and its referenced source files available in the runner workspace; relative provider file and directory settings resolve from the workflow file's folder.

Pass provider Connection fields for the current run with repeatable `--connection alias.field=VALUE` options. Use `env:NAME` for secrets from the CLI process environment. Doppler can provide that environment directly:

```sh
doppler run --project pipelab --config dev_personal -- \
  pipelab workflow run ./release.json \
  --connection itch-production.apiKey=env:WORK_ITCH_KEY
```

For GitHub Actions, map a repository secret into the runner environment and reference it in the command. This assumes Pipelab CLI is installed on the runner:

```yaml
steps:
  - uses: actions/checkout@v4
  - name: Publish release
    env:
      WORK_ITCH_KEY: ${{ secrets.WORK_ITCH_KEY }}
    run: >-
      pipelab workflow run ./release.json
      --connection itch-production.apiKey=env:WORK_ITCH_KEY
```

Unprefixed values are literals. When a provider declares a path-valued Connection field, a non-secret SDK path such as `/opt/steamworks` is passed verbatim; Pipelab validates the alias and field against that provider schema. Literal values can appear in shell history and process listings, so use environment references for secrets. The Steam Connection field is its account username; SteamCMD uses its saved login cache and may require an interactive password or Steam Guard prompt when the cache is absent or rejected. See [Authenticate SteamCMD](/guide/publishing/steam#authenticate-steamcmd) and the [CLI reference](/cli/reference#run-a-release-workflow) for details.

The browser package includes the built-in provider fields and safe defaults, so
an open workflow draft can still show and edit them while the agent is
disconnected. Fields that need host inspection and build targets whose
availability cannot be checked are marked as requiring the agent. Static
required-field hints do not resolve defaults, plan the workflow, or establish
that it is ready to ship; those checks and creating or saving a workflow still
require the agent.

## Workflow sections

The workflow editor has these sections: **Configuration**, **Builds**,
**Plan**, **Runs** (with its **Artifacts** view) and **Settings**, the gear at
the right of the tab bar. The header and tab bar stay in place while you switch
sections, and each section keeps its open rows and scroll position; the tab bar sticks to the top as you scroll. Builds shows how many are
enabled, and a badge next to the title counts planner errors and opens the Plan.
The arrow next to **Ship** offers *Ship without checking destinations* (the CLI's
`--skip-preflight`, for one run) and *View plan*. Configuration is the main view for the source and
destinations. Its settings save automatically as you edit; there is no Save
button. Opening a workflow does not change its saved build or routing choices.
Choose **Add destination** to open the provider picker. Provider-specific
settings remain in each destination's edit view. The picker stays available
for providers already in the workflow, so you can add the same provider more
than once. Use separate destinations when publishing to different provider
accounts or projects; use deployment slots under one destination for variants
of the same account or project, such as Windows and Linux channels.

**Plan** draws what a run would do as a graph, from the source through builds to each destination slot. It shows the steps Pipelab adds automatically, and lists any planner errors or warnings. Builds and slots that cannot run on this host are left out. Drag to pan and scroll to zoom; the fit button reframes the whole graph. It never runs anything.

Use **Builds** when you want to customize producers or targets. Adding a build
is an explicit choice: select its type and engine. A build's engine cannot be changed afterwards; add a new build for another engine. A new build is unused until a deployment reads one of its targets. The catalog shows
when a target is unavailable on the current host and why. Configure a build to
edit its settings or remove it; references to its outputs are never rerouted
automatically. Use **Duplicate** on a build to copy it, with its settings, targets and hooks, right below the original under the name "… copy"; deployments that read the original keep reading it. Build settings take effect when you apply them. If you leave
Builds with unapplied edits, Pipelab asks whether to keep editing or discard
those edits. Pending workflow changes save automatically before navigation;
the browser also warns if you reload or close while a save is pending or has
failed, or while Build settings remain unapplied.

A Construct source uses the **Construct** engine for its web export, and Electron, Tauri or Poki take that build as input. Pipelab adds the web build for you when a destination needs it. Construct's own desktop exports are declared but not available yet; see [Construct](./integrations/construct.md#desktop-exports).

A build **exposes** every target its engine offers on this host as an output, but Pipelab only **builds** the targets something uses: a destination slot, a Bundle input, or another build. An Electron build can expose Windows, Linux and macOS while two Steam slots read only the Windows and Linux outputs; macOS is not built. A build that nothing uses does not run, so a build has no on/off switch of its own. Each target runs separately, so one run builds one operating system. Targets are not switched on or off. Every target an engine offers is always there, with its own settings; a target is **used** when an enabled deployment slot, a Bundle input or another build reads it, and unused otherwise. Pick any target of an existing build in a deployment's output list; you do not need one build per operating system. Pointing a slot elsewhere makes the previous target unused but keeps its settings.

When you create a workflow, Pipelab fills the empty deployment slots once, and the builds it adds always target the operating system Pipelab runs on. It never fills a slot later: a slot you add afterwards, or leave empty, stays empty until you choose an output, and a run or dry-run reports "Choose an output for this destination." until you do. At creation, a Construct source with an empty Folder or Steam slot gets a Construct web build and an Electron build for the current OS; a Godot source gets Godot's native desktop export for the current OS instead. If the engine has no target for the current OS, nothing is added. Slots are not tied to an operating system: choose any output for any slot.

A **Bundle** build puts the outputs of several other builds into one ZIP. Add it from the Builds tab, then choose its **Inputs**: any build output it can read, such as the Windows, Linux and macOS builds. The ZIP holds one top-level folder per input, named after its build and target. A bundle never picks its inputs automatically, cannot include itself, and can itself be an input to another bundle. Its output is a ZIP archive, which the ZIP and itch.io destinations accept; Steam and Poki do not. Bundle builds are never added automatically and do not support Before build hooks.

Electron Build Profiles also support **Before build hooks**. Add, enable,
disable, reorder, or remove hooks in the profile settings. Hooks run in order on
that profile's own copy of the input, once before Electron packages its targets.
Enter one shell command, such as `node ./setSDKEnabled.js 0`. It runs with the
staged input as its working directory, so a script beside `data.json` can use
`__dirname` to read or write that file. Managed Node.js and pnpm are available
on `PATH`. A nonzero exit stops that profile's build.

Each hook process receives these run-scoped environment variables:
`PIPELAB_RUN_ID`, `PIPELAB_WORKFLOW_ID`, `PIPELAB_PROJECT_ID`,
`PIPELAB_BUILD_PROFILE_ID`, `PIPELAB_ARTIFACT_DIR`, and
`PIPELAB_RELEASE_VERSION`. They describe the current run and staged copy; they
are supplied at execution time and are not saved in workflow configuration.

Use **Artifacts** to find outputs across runs of this workflow. Artifact
metadata is shown only when the run provides it. Local artifacts can be opened
and cloud artifacts downloaded when those actions are available. Each artifact
links back to its originating run. The **Runs** section remains available for
run status, logs, and delivery details.

## Sources, builds, and destinations

- A **source** provides the project or files that enter the workflow.
- A **build** chooses a producer and one or more build targets. Pipelab can
  recommend and validate a build during workflow creation. Later changes are
  made explicitly in the Builds section. A producer may inspect the project
  and report missing prerequisites before running.
- A **destination** receives a source or build artifact. Each **deployment
  slot** chooses the artifact it will receive and stores provider-specific
  settings.

The planner checks provider compatibility and can insert a provider-declared
transform, such as extracting an archive when a producer requires a folder. A
workflow can use one build output in more than one destination. Provider
requirements are documented on their own pages, for example
[Pipelab Cloud](/guide/cloud-artifacts), [Steam](/guide/publishing/steam),
[itch.io](/guide/publishing/itch), and [Poki](/guide/publishing/poki).

## Inspect a workflow without running it

The CLI can plan and compile a saved Release workflow without running its
tasks:

```sh
pipelab workflow run release-id --dry-run --output ./release-plan.json
```

Replace `release-id` with a saved workflow ID or a unique workflow name. A
dry-run validates providers and references, then writes the plan if `--output`
is provided. It does not execute deployment tasks. See the
[workflow reference guide](/guide/workflow-references) and
[CLI reference](/cli/reference#run-a-release-workflow).

## Follow the run

Choose **Ship** in the editor, or use **Ship** beside a saved workflow on the
project dashboard, to save the workflow, validate its configuration, and open
the release details confirmation. Enter the release **Version** and
**Description** (release notes) there; destinations that need them use these
values, so there is nothing to retype per destination: Poki uploads them as its
version name and notes, Steam uses the description as the build description,
and Itch.io passes the version to Butler as `--userversion`. When the
description is empty, Poki and Steam use the version instead. Dashboard shipping opens the same
preflight as editor shipping while keeping the dashboard in view. Pipelab only
starts the run after you confirm the release details and the planner reports a
valid plan. If a workflow needs attention, the dashboard offers its blockers
and a path to Configuration for repair. If workflow data cannot be loaded,
retry the load or return to the dashboard; a cancelled Ship request does not
resume automatically. After shipping, Pipelab opens the live run detail; use
**Runs** to return to its status, step logs, and delivery results, or
**Artifacts** to discover outputs across runs. The
[Runs and history guide](/guide/runs-and-history) covers the run list,
artifacts, and detail view.

Build targets are limited by the machine that runs the workflow: Electron macOS builds need a macOS host, and Tauri builds need a host of the same platform as the target. A target the host cannot build, and every deployment that takes its output, is shown as unavailable in the editor and skipped when the workflow runs, so a workflow saved on another machine still runs here with what this host can build.

Before the first step starts, Pipelab checks each destination's account, and the Construct source's login, without uploading anything. If a check is definitive — the Construct account rejects its username and password, the Construct browser profile is signed out, a Poki login is missing, the Itch API key is rejected or the account has no game with the configured project name, Poki denies the login access to the configured game, Steam shows the login no such App ID or Depot, or SteamCMD is not logged in as the configured account — the run fails at once, nothing is built or uploaded, and the run view names the destination and the cause. A check that cannot get a clear answer (for example you are offline) does not block the run. Construct is checked with the account Connection's credentials, or with the browser profile's session when no account is set. Steam App and Depot IDs must be digits; Pipelab refuses to start a run otherwise. Steam is checked with SteamCMD's saved login: the account must be logged in, and Steam must list the configured App ID with that Depot ID for it. Pipelab never prompts or asks for a password during the check, and Poki's saved login file is never rewritten. Run the CLI with `--skip-preflight` to bypass the checks; the run records that they were skipped. `--dry-run` stays offline and does not run them.

By default a failed step does not stop the others: a destination that already shipped cannot be rolled back, so the remaining independent steps still run, the run finishes with errors, and each step that could not run names the step it was waiting on. Turn on **Stop on first failure** in the workflow's **Settings** tab to stop starting new steps after the first failure. In the run view, destination steps use the same name and icon as their destination in the editor. A failed step is shown in red with its reason. When Pipelab can tell where the problem is, the failure also has a **Fix** button that opens the right place: **Connections**, opened on the account the failing destination uses, for a rejected or expired account, the deployment's settings for a missing or wrong provider setting or an empty output, or **Builds** for a failing build step. A failed preflight check is reported on the destination that failed, and nothing is run.

## Workflow settings

The **Settings** tab of a workflow holds options that apply to every run of that workflow. They save automatically.

- **General:**
  - **Stop on first failure** is off by default.
  - **Check destinations before running** is on by default. Turn it off to run without the account checks; the run records that they were skipped.
  - **Keep artifacts of failed runs** is on by default. Turn it off to discard what a failed run's completed steps produced.
- **Retention:** rules for this workflow's finished runs. A rule you leave unticked is not applied, and with no rule ticked nothing is deleted. The policy is applied when a run of the workflow finishes, once in the background each time Pipelab starts (so age rules also move for workflows you do not run), and when you press **Apply now** in the preview. Editing the rules deletes nothing by itself.
  - **Run history:** keep only the last N runs, and/or delete runs older than N days. A pruned run is removed together with its artifacts.
  - **Artifact files:** keep the files of only the last N runs, and/or delete files older than N days. The run stays in history without its files, so you can keep a long history and a short artifact window.
  - **Failed runs:** delete failed runs (and runs completed with errors) older than N days, independently of the history rules.
  - **Always keep the latest successful run** (on by default) protects the newest successful run from every rule above. The run that just finished and runs in progress are never pruned. Run counts include the run that just finished.
  - A **Preview** below the rules updates as you edit them, and its **Apply now** button (with a confirmation) applies the saved policy immediately. It lists the runs that would be deleted, the runs that would only lose their files, any run kept by the latest-successful protection, and the space that would be freed, measured against the workflow's current history.
- **Notifications:** a desktop notification when a run succeeds and when it fails, both on by default. A run that completes with errors counts as a failure. Notifications only fire for runs started from the app while it is open; the CLI does not send them. Pipelab asks for notification permission the first time you ship.

Release workflows are not scheduled by Pipelab's current workflow format. The
workflow runs when you choose **Ship** in the editor or on the dashboard, or
invoke it through the CLI.

In hosted mode, the new-workflow wizard also lets you inspect and edit packaged
source, build, and destination fields in a browser-only draft. File paths and
dynamic provider options are not validated there; connect a Pipelab agent for
inspection, runtime readiness, saving, and execution. If an agent attaches while
the wizard is open, the draft stays in place while native path controls and
live target availability become available. Hosted mode controls startup
connection policy; it does not keep the browser in a permanent offline mode.
