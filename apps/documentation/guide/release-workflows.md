# Build and ship with a Release workflow

A Release workflow prepares an artifact and routes it to one or more
destinations.

## Configure a workflow

1. From the dashboard, choose **New workflow** in a project.
2. In **Name + source**, choose a source and enter a workflow name. The wizard
   leaves local paths for Configuration, where you can choose the project file
   or folder after creation. Source-specific file rules apply there, such as
   the `.c3p` extension for a Construct project or `.zip` for a ZIP source.
3. In **Destinations**, choose one or more places to publish the release.
4. Check the **Recap** for the workflow name, source type, and destinations,
   then choose **Create workflow**. Pipelab applies any existing build and
   output defaults that can be resolved. It opens the workflow's
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

## Workflow sections

The workflow editor has four sections: **Configuration**, **Builds**,
**Artifacts**, and **Runs**. Configuration is the main view for the source and
destinations. Its settings save automatically as you edit; there is no Save
button. Opening a workflow does not change its saved build or routing choices.
Choose **Add destination** to open the provider picker. Provider-specific
settings remain in each destination's edit view.

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
[Steam](/guide/publishing/steam), [itch.io](/guide/publishing/itch), and
[Poki](/guide/publishing/poki).

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
[CLI reference](/cli/reference#run-a-saved-release-workflow).

## Follow the run

Choose **Ship** to save the current workflow, validate the saved configuration,
and start execution. Pipelab only starts the run after the current edits have
saved and the planner reports a valid plan. After shipping, use **Runs** to
inspect status, step logs, and delivery results, or **Artifacts** to discover
outputs across runs. The [Runs and history guide](/guide/runs-and-history)
covers the run list, artifacts, and detail view.

Release workflows are not scheduled by Pipelab's current workflow format. The
workflow runs when you choose **Ship** in the editor or invoke it through the
CLI.
