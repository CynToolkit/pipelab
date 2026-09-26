# Edit and run a pipeline

A Pipelab pipeline is a saved graph of plugin tasks and event triggers. The
desktop editor is the main place to create and run one. In the command line,
`pipelab run` runs a pipeline JSON file; it is different from
[`pipelab workflow run`](/cli/reference#run-a-saved-release-workflow), which runs a
saved Release workflow.

## Build the graph

Open a pipeline from a project, then add tasks from the task picker. The picker
shows plugin tasks already available in the bundled build; it does not install
or activate plugins. Add a trigger when the pipeline needs an event to start
it; the available trigger nodes come from the loaded plugins. The built-in
**Manual** event is one registered option.

Each task defines its own parameters, required fields, outputs, and possible
platform constraints. Configure those fields in the task editor, save, then
review any validation issues before running.

## Variables and previous outputs

Pipeline variables have a name, description, and string value. The legacy
pipeline evaluator resolves those values and task parameters when each action
runs. Static JSON parameter values are read as JSON; other values are evaluated
as JavaScript with `variables`, `steps`, and `context` available. A parameter
evaluation error is logged and that parameter becomes an empty string, so check
the task log if an advanced value is not behaving as expected.

This evaluator belongs to graph pipelines. Release workflows use separate
run-variable and step-output references, described in
[Workflow inputs, outputs, and dependencies](/guide/workflow-references).

## Execution and results

The graph executor walks action blocks in their saved array order. Disabled
actions are skipped. Each successful action's output is stored under its block
ID and may be used by later parameter evaluation. A task error stops the
remaining graph; the editor shows task status, logs, and artifact paths. Use
**Cancel** to abort a running graph.

Pipeline runs are recorded locally by default and artifacts are kept in the
configured user-data area. The legacy **Build History** dialog requires an
account with the Build History benefit. The separate Release workflow run
list and details are covered in [Runs and history](/guide/runs-and-history).

## Run a pipeline from the CLI

The CLI accepts a JSON pipeline file and can write the execution result to a
file:

```sh
pipelab run ./pipeline.json --output ./result.json
```

The file must contain a `graph` or `canvas.blocks` list, and referenced plugin
IDs must be available to the CLI. `--variables` accepts a JSON string that
replaces the pipeline's saved variable list. There is no `--dry-run` option for
`pipelab run`; use `pipelab workflow run <id-or-name> --dry-run` to inspect a
Release workflow plan without executing its tasks.

See the [CLI command reference](/cli/reference) for the full command syntax.
