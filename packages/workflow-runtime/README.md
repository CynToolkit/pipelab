# @pipelab/workflow-runtime

The standalone execution foundation for Pipelab workflows. It contains no
Electron, Vue, or legacy graph-engine dependencies.

```ts
import { createLocalHost, runWorkflow } from "@pipelab/workflow-runtime";

const result = await runWorkflow(
  {
    version: 1,
    steps: [
      {
        id: "build",
        uses: "fs:run",
        with: {
          command: "node",
          parameters: ["scripts/build.mjs"],
          stopOnError: true,
        },
      },
    ],
  },
  {
    host: createLocalHost(process.cwd()),
    onEvent: (event) => console.log(event.type, event),
  },
);
```

The native plugin task contract is `WorkflowTask`. A task receives resolved `inputs`,
outputs and artifacts already produced by earlier steps, a cancellation `signal`,
logging helpers, and the host-injected `services` object. Return an object for
step outputs and call `setArtifact` for declared artifacts. Pipelab hosts can
provide their service bundle through `runWorkflow`'s `services` option; the
standalone runtime does not import Pipelab-specific services. Pipelab plugin
registries resolve directly to native tasks that implement this contract.
Tasks also receive `connectionValues`, a read-only snapshot keyed by stable
workflow alias and provider field. Hosts can pass locally bound values through
`connectionValues`; `connectionOverrides` can replace individual alias fields
with literal values or references to the run environment. Provider-specific
field definitions and authentication remain provider-owned.

Step inputs can reference run variables with `${{ variables.name }}`, process
environment values supplied in the run context with `${{ env.NAME }}`, or a
previous step's outputs with `${{ steps.step-id.outputs.name }}`. Environment
references are checked before workflow events or tasks begin, so a missing
variable fails before any step can have side effects. Connection overrides use
the same run environment for `{ kind: "environment", name: "VARIABLE" }`
references; missing or invalid names fail during preflight. Literal override
values are preserved verbatim. Resolved connection values and environment
values are redacted from logs, errors, events, and returned result values. The
local `WorkflowResult` keeps artifact paths intact so a host can reopen or
deliver files. Use `createRunScopedWorkflowValueResolver` and its
`redactObject` method before persisting or sending a result; that also redacts
environment and connection values embedded in artifact paths. Hosts may call
`preflightWorkflow(workflow, env, { connectionValues, connectionOverrides })`
before allocating execution resources.
Steps run in definition order by default; add `needs` to
declare dependencies explicitly and allow independent steps to run
concurrently. The runtime also exposes
`fs:run` as a built-in task. Set `continueOnError` to keep independent
branches running after a failure; dependent steps are reported as skipped.
When `continueOnError` is false or omitted, the runtime stops scheduling new
work after a failed ready batch and marks remaining steps as skipped. Steps
already running in that batch finish first, so independent branches remain
parallel; this policy stops later work without serializing ready steps.

`CORE_WORKFLOW_TASKS` exports the stable IDs used by Pipelab hosts when
registering generic filesystem, archive, and passthrough workflow tasks. Import
them from `@pipelab/workflow-runtime/task-ids`; this entry is browser-safe and
does not load the Node.js process host.
