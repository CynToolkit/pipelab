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
5. Check the **Recap** for the workflow name, description, source and path, and
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
`steam-production`. The workflow stores the alias; Desktop remembers which
saved Connection fulfills it for that workflow. The same alias can resolve to
a different saved Connection in another workflow. Changing a saved Connection's
display name does not change the workflow alias. Renaming an alias updates its
workflow references and shows a reminder to update any CLI or CI mappings that
use the old name.

When a workflow has two destinations for the same provider, give each a
destination name such as **Studio** or **Personal**. The editor shows that name
beside the provider (for example, **Itch.io — Studio**) and keeps it separate
from the Connection alias. Before shipping, Pipelab previews the selected saved
account for each destination and warns if multiple destinations use the same
Connection; using one account more than once is allowed when that is intended.

Ordinary provider properties are literal values by default. To save an
environment binding instead, open **Advanced · Value source** and choose **Use
environment variable**. Pipelab reads that variable from the environment of
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

The workflow editor has four sections: **Configuration**, **Builds**,
**Artifacts**, and **Runs**. Configuration is the main view for the source and
destinations. Its settings save automatically as you edit; there is no Save
button. Opening a workflow does not change its saved build or routing choices.
Choose **Add destination** to open the provider picker. Provider-specific
settings remain in each destination's edit view. The picker stays available
for providers already in the workflow, so you can add the same provider more
than once. Use separate destinations when publishing to different provider
accounts or projects; use deployment slots under one destination for variants
of the same account or project, such as Windows and Linux channels.

Use **Builds** when you want to customize producers or targets. Adding a build
is an explicit choice: select its type, engine, and target. Changing an engine
clears incompatible targets until you select a replacement. The catalog shows
when a target is unavailable on the current host and why. Configure a build to
edit its settings or remove it; references to its outputs are never rerouted
automatically. Build settings take effect when you apply them. If you leave
Builds with unapplied edits, Pipelab asks whether to keep editing or discard
those edits. Pending workflow changes save automatically before navigation;
the browser also warns if you reload or close while a save is pending or has
failed, or while Build settings remain unapplied.

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
the release details confirmation. Dashboard shipping opens the same
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
