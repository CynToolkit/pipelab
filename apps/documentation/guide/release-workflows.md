# Build and ship with a Release workflow

A Release workflow prepares an artifact and routes it to one or more
destinations. It uses a different editor and runtime from the graph-based
[pipeline](/guide/pipelines).

## Configure a workflow

1. From the dashboard, choose **New workflow** in a project.
2. Select and configure a **source** for the project or input files.
3. Add a **build profile**, choose a registered producer, and enable the
   targets you need.
4. Add a **destination** and choose which source or build output each
   deployment slot should receive.
5. Review any **Needs attention** items. These list missing settings,
   incompatible inputs, unavailable targets, or other planning issues.
6. Save the workflow, then choose **Ship** to plan and run it.

![Release setup source step showing Folder, ZIP, Construct project, and Godot project options](../assets/current/workflow-source.png)

Provider cards are populated from the providers available in the application.
Compatibility depends on the artifact type, destination, selected target, and
host. The [provider catalog](/guide/integrations/) links to the exact inputs,
credentials, tools, and target limitations for each provider.

## Sources, builds, and destinations

- A **source** provides the project or files that enter the workflow.
- A **build profile** chooses a producer and one or more build targets. A
  producer may inspect the project and report missing prerequisites before
  running.
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

After shipping, open the workflow's **Runs** tab to inspect status, step logs,
artifacts, and delivery results. The [Runs and history guide](/guide/runs-and-history)
covers the run list and detail view.

Release workflows are not scheduled by Pipelab's current workflow format. The
workflow runs when you choose **Ship** in the editor or invoke it through the
CLI.
