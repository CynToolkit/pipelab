# Workflow runtime reference

This page describes the version 1 task workflow object used by Pipelab's workflow runtime. It is a low-level implementation reference, not a promise of a stable third-party SDK. Pipelab's saved **Release workflows** are validated and compiled into this runtime shape. For the user workflow authoring path, see [Workflow references](/guide/workflow-references); to run a saved workflow, see the [CLI reference](/cli/reference).

## Workflow object

The runtime accepts a workflow with `version`, `steps`, and optional `continueOnError`:

```ts
{
  version: 1,
  steps: [
    {
      id: "build",
      uses: "test:build",
      artifacts: {
        output: {
          descriptor: { kind: "application", platform: "windows", container: "directory" },
        },
      },
    },
    {
      id: "deliver",
      uses: "test:deliver",
      needs: ["build"],
      delivery: {
        destinationId: "folder",
        slotId: "windows",
        artifact: { stepId: "build", artifact: "output" },
      },
    },
  ],
}
```

This shape comes from the runtime artifact/delivery test. Each step has a unique non-empty `id` and non-empty task identifier in `uses`. Optional fields are:

| Field            | Meaning                                                                                                                                                                                                   |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `needs`          | Step IDs that must finish first. If omitted, a step depends on the immediately preceding step; the first step has no default dependency. Explicit dependencies can make independent steps ready together. |
| `with`           | Object of task inputs. Values may contain runtime references.                                                                                                                                             |
| `artifacts`      | Named artifact declarations, each with a descriptor.                                                                                                                                                      |
| `artifactInputs` | Maps task input names to `{ stepId, artifact }` references. The runtime supplies the produced artifact path as that input.                                                                                |
| `delivery`       | `{ destinationId, slotId, artifact: { stepId, artifact } }` context for a destination task.                                                                                                               |
| `phases`         | Ordered `{ id, title }` progress items reported by the provider task. Phase IDs are scoped to their step.                                                                                                 |

The runtime checks version `1`, step IDs, dependency IDs, input object shape, and artifact references before execution. Cyclic dependency graphs cannot make progress and are rejected as workflow failures.

Each task context also has `connectionValues`, a read-only map of resolved
provider fields keyed by stable workflow alias. Release workflows store those
aliases in connection fields. A host can keep its local alias-to-Connection
choices outside the shared workflow, then pass the selected provider fields in
`WorkflowRunContext.connectionValues`; the same alias can resolve to a different
local instance in another workflow. Per-run values can be provided in
`connectionOverrides`:

```ts
connectionOverrides: [
  { alias: "steam-release", field: "username", value: { kind: "literal", value: "builder" } },
  {
    alias: "steam-release",
    field: "password",
    value: { kind: "environment", name: "STEAM_PASSWORD" },
  },
];
```

Override environment values come from the run's environment snapshot. The
runtime resolves them before emitting events or starting tasks, and rejects a
missing variable before side effects. Literal and resolved connection values
are redacted from logs, errors, events, and result values. Provider field
schemas and authentication/session behavior remain owned by each provider.
Hosts pass provider-derived `connectionRequirements` with the declared aliases
and fields. When present, preflight rejects undeclared aliases or fields,
missing required aliases or fields, and empty required field values before any
task starts.

## Task IDs, inputs, and outputs

`uses` selects a task in the registry supplied by the host. The standalone runtime includes `fs:run`; Pipelab's host registers additional core and provider tasks. A task receives resolved `inputs` and returns an object of outputs or `void`. The runtime stores outputs under that step ID in the final result.

Inputs can reference variables supplied separately in the run context or outputs from an earlier step:

```ts
with: {
  source: "${{ variables.sourcePath }}",
  builtPath: "${{ steps.build.outputs.path }}",
}
```

The run context can also provide a read-only environment map for one run. Use an
`env.NAME` reference to read one named value in step inputs. Before emitting
workflow events or starting tasks, the runtime checks every environment reference in step inputs and connection overrides.
A missing or invalid reference rejects the workflow before any task can have
side effects, and the error includes the variable name without its value. The
runtime redacts referenced environment values from task logs, failures, emitted
events, and returned result values. Local returned results keep artifact paths
intact for hosts that need to deliver or reopen files. Hosts should call
`createRunScopedWorkflowValueResolver(workflow, variables, env)` and use its
`redactObject` method before saving or sending results; it also redacts
environment values embedded in artifact paths.

Hosts that allocate resources before calling `runWorkflow` can call
`preflightWorkflow(workflow, env, options)` first. `options` can include
`connectionValues`, `connectionOverrides`, provider-derived
`connectionRequirements`, and `requiredEnvironmentVariables`. Required
environment bindings must be present and non-empty; ordinary optional
environment references still need to exist when referenced. `runWorkflow`
performs the same checks automatically. The resolver captures read-only
environment and connection snapshots for one run.

An exact reference retains its value type. A reference embedded in surrounding text is substituted as a string. Missing values and malformed references fail the step. Reading a previous step's output does not create a scheduling dependency by itself; put that step ID in `needs` so its output is available before the consumer starts.

`fs:run` accepts `command` (required non-empty string), optional `parameters` (string array), optional `workingDirectory`, and `stopOnError`. A relative working directory resolves under the host workspace. It returns `stdout`, `stderr`, `exitCode`, and `duration`. With `stopOnError: true`, a nonzero result fails the step; otherwise the command task captures execution errors in its returned fields.

## Artifacts and delivery

Artifact descriptors have `kind` (`project`, `application`, or `files`) and `container` (`file`, `directory`, or `archive`), with optional `technology`, `platform`, `architecture`, `format`, and `capabilities` fields. A task calls `setArtifact(outputId, path, metadata?)` to register a produced artifact. The runtime associates it with the producing step and declared artifact name.

`artifactInputs` passes a referenced artifact's filesystem path to the consumer task. `delivery` instead makes destination ID, slot ID, and artifact instance available in the task's `delivery` context. Results include artifacts and delivery records; this low-level context does not itself define a provider's compatibility or publishing behavior.

## Provider phases

Providers can expose a fixed phase catalog on a workflow step and bind that
catalog in the task with `context.withPhases(catalog)`. Use
`definePhases([... ] as const)` so TypeScript infers valid phase IDs; the
returned `phase` function rejects unknown IDs during typechecking. Each phase
callback can return `success(message)`, `skip(reason)`, or throw / call
`fail(error)`. `warn(message)` records a warning while the callback continues.
The runtime marks callbacks completed automatically, records thrown errors as
failed phases, and marks phases left over after success as not reported. Phases
on blocked work are not reached. Phase helpers report task progress and do not
schedule workflow steps.

Phase lifecycle events include `phase.started`, `phase.completed`,
`phase.skipped`, `phase.failed`, `phase.warning`, `phase.not-reached`, and
`phase.not-reported`. Phase results and warnings are included in each step's
result. Hosts may persist those snapshots for run history. Mismatched catalogs,
duplicate calls, and missing reports produce diagnostics so a provider's
progress tree can be compared with its execution.

## Host and task contracts

`runWorkflow(workflow, context)` receives a host with:

- `workspace.root`;
- `filesystem.ensureDirectory(path)`;
- `processes.execute(command, args, { cwd, env?, signal, onStdout?, onStderr? })`;
- a logger with `info`, `warn`, and `error` methods.

The run context can also provide `variables`, `env`, additional `tasks`, a `version`, `buildId`, an `AbortSignal`, and an `onEvent` callback. `createLocalHost(workspaceRoot)` supplies Node filesystem and process implementations. The process host merges the current process environment with any supplied environment and kills its child process when aborted.

## Scheduling, failure, and cancellation

Ready steps can execute concurrently. A failed prerequisite causes dependent steps to be skipped. With `continueOnError` false or omitted, the runtime stops scheduling new work after a failed ready batch; already-running peers finish first, and later work is skipped. With `continueOnError: true`, independent branches continue.

An aborted signal prevents queued work from starting and is passed to running tasks. The runtime emits lifecycle and log events such as `workflow.started`, `step.started`, `step.log`, `step.completed`, `step.failed`, `step.skipped`, and `workflow.completed`. Event records include timestamps. The returned result carries overall status (`completed` or `completed-with-errors`), per-step status and outputs, artifacts, deliveries, timing, and serialized errors. Invalid workflow structure or unsupported versions can reject before a result is returned.

These semantics are exercised by `packages/workflow-runtime/src/runtime.test.ts`; Pipelab's release workflow CLI behavior is covered in `apps/cli/tests/e2e/tests/workflows.spec.ts`.
