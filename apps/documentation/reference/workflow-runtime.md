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

| Field | Meaning |
| --- | --- |
| `needs` | Step IDs that must finish first. If omitted, a step depends on the immediately preceding step; the first step has no default dependency. Explicit dependencies can make independent steps ready together. |
| `with` | Object of task inputs. Values may contain runtime references. |
| `artifacts` | Named artifact declarations, each with a descriptor. |
| `artifactInputs` | Maps task input names to `{ stepId, artifact }` references. The runtime supplies the produced artifact path as that input. |
| `delivery` | `{ destinationId, slotId, artifact: { stepId, artifact } }` context for a destination task. |

The runtime checks version `1`, step IDs, dependency IDs, input object shape, and artifact references before execution. Cyclic dependency graphs cannot make progress and are rejected as workflow failures.

## Task IDs, inputs, and outputs

`uses` selects a task in the registry supplied by the host. The standalone runtime includes `fs:run`; Pipelab's host registers additional core and provider tasks. A task receives resolved `inputs` and returns an object of outputs or `void`. The runtime stores outputs under that step ID in the final result.

Inputs can reference variables supplied separately in the run context or outputs from an earlier step:

```ts
with: {
  source: "${{ variables.sourcePath }}",
  builtPath: "${{ steps.build.outputs.path }}",
}
```

An exact reference retains its value type. A reference embedded in surrounding text is substituted as a string. Missing values and malformed references fail the step. Reading a previous step's output does not create a scheduling dependency by itself; put that step ID in `needs` so its output is available before the consumer starts.

`fs:run` accepts `command` (required non-empty string), optional `parameters` (string array), optional `workingDirectory`, and `stopOnError`. A relative working directory resolves under the host workspace. It returns `stdout`, `stderr`, `exitCode`, and `duration`. With `stopOnError: true`, a nonzero result fails the step; otherwise the command task captures execution errors in its returned fields.

## Artifacts and delivery

Artifact descriptors have `kind` (`project`, `application`, or `files`) and `container` (`file`, `directory`, or `archive`), with optional `technology`, `platform`, `architecture`, `format`, and `capabilities` fields. A task calls `setArtifact(outputId, path, metadata?)` to register a produced artifact. The runtime associates it with the producing step and declared artifact name.

`artifactInputs` passes a referenced artifact's filesystem path to the consumer task. `delivery` instead makes destination ID, slot ID, and artifact instance available in the task's `delivery` context. Results include artifacts and delivery records; this low-level context does not itself define a provider's compatibility or publishing behavior.

## Host and task contracts

`runWorkflow(workflow, context)` receives a host with:

- `workspace.root`;
- `filesystem.ensureDirectory(path)`;
- `processes.execute(command, args, { cwd, env?, signal, onStdout?, onStderr? })`;
- a logger with `info`, `warn`, and `error` methods.

The run context can also provide `variables`, additional `tasks`, a `version`, `buildId`, an `AbortSignal`, and an `onEvent` callback. `createLocalHost(workspaceRoot)` supplies Node filesystem and process implementations. The process host merges the current process environment with any supplied environment and kills its child process when aborted.

## Scheduling, failure, and cancellation

Ready steps can execute concurrently. A failed prerequisite causes dependent steps to be skipped. With `continueOnError` false or omitted, the runtime stops scheduling new work after a failed ready batch; already-running peers finish first, and later work is skipped. With `continueOnError: true`, independent branches continue.

An aborted signal prevents queued work from starting and is passed to running tasks. The runtime emits lifecycle and log events such as `workflow.started`, `step.started`, `step.log`, `step.completed`, `step.failed`, `step.skipped`, and `workflow.completed`. Event records include timestamps. The returned result carries overall status (`completed` or `completed-with-errors`), per-step status and outputs, artifacts, deliveries, timing, and serialized errors. Invalid workflow structure or unsupported versions can reject before a result is returned.

These semantics are exercised by `packages/workflow-runtime/src/runtime.test.ts`; Pipelab's release workflow CLI behavior is covered in `apps/cli/tests/e2e/tests/releases.spec.ts`.
