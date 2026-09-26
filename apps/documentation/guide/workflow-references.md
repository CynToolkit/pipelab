# Workflow inputs, outputs, and dependencies

Release workflows compile into a versioned task workflow. Pipelab's Release
editor builds that task plan from your source, build profiles, and destinations.
This page explains how values and artifacts move between its steps. It does
not describe the legacy graph pipeline evaluator; see
[Edit and run a pipeline](/guide/pipelines) for that model.

## Pass values between steps

Workflow task inputs live in each step's `with` object. A value can reference a
run variable or a previous step's output:

```json
{
  "tag": "${{ variables.releaseTag }}",
  "summary": "Build ${{ steps.build.outputs.version }}"
}
```

An exact reference preserves the referenced value's type. References embedded
inside a string are converted to text. References can be nested inside arrays
and objects.

The supported references are:

- A path under the `variables` context reads a run variable. Nested paths can
  use dot notation.
- A path under `steps.<step-id>.outputs` reads an output returned by a step.

These are references, not a general expression language. The workflow format
does not define task-level `if` conditions, loops, or scheduled triggers.

## Declare execution dependencies

Without `needs`, a step depends on the immediately preceding step in the
workflow definition. You can set `needs` to name dependencies explicitly; this
replaces the default dependency. Steps with satisfied dependencies can run in
parallel.

An output reference by itself does not create an execution dependency. If a
step reads another step's output, include that producer in `needs` so the value
is available when the consumer starts:

For example, a publish step can depend on a build step and read its output:

```json
{
  "needs": ["build"],
  "with": {
    "version": "${{ steps.build.outputs.version }}"
  }
}
```

The step IDs and output names must exist in the compiled workflow. The runtime
rejects duplicate step IDs, unknown tasks, invalid dependencies, dependency
cycles, and undeclared artifact references.

## Pass build artifacts

Tasks declare output artifacts before execution. A later task can consume a
produced artifact through `artifactInputs`, or a delivery step can select an
artifact from a build step. Artifact references add the needed execution
dependency automatically. The artifact path is resolved on the host that runs
the workflow; it is not a portable URL.

The Release planner checks artifact descriptors such as kind, platform,
container, and capabilities against the selected producer and destination. It
may add a declared transform when needed. If no compatible path exists, review
the provider's issue details in the editor.

## Handle failures

By default, `continueOnError` is `false`. When a ready batch contains a failure,
the runtime waits for that batch, stops scheduling new work, and skips steps
that can no longer run. With `continueOnError: true`, independent branches may
continue; the final workflow can finish with errors. A dependent step is
skipped when a required step fails.

The CLI dry-run validates and compiles a Release workflow without executing its
tasks:

```sh
pipelab workflow run release-id --dry-run
```

The [Release workflow guide](/guide/release-workflows) covers the editor flow;
the [workflow format reference](/reference/workflow-runtime) describes the
versioned task object for advanced users and contributors.
