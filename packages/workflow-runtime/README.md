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

Step inputs can reference run variables with `${{ variables.name }}` or a
previous step's outputs with `${{ steps.step-id.outputs.name }}`. Steps run in
definition order by default; add `needs` to declare dependencies explicitly
and allow independent steps to run concurrently. The runtime also exposes
`fs:run` as a built-in task. Set `continueOnError` to keep independent
branches running after a failure; dependent steps are reported as skipped.
When `continueOnError` is false or omitted, the runtime stops scheduling new
work after a failed ready batch and marks remaining steps as skipped. Steps
already running in that batch finish first, so independent branches remain
parallel; this policy stops later work without serializing ready steps.

`CORE_WORKFLOW_TASKS` exports the stable IDs used by Pipelab hosts when
registering generic filesystem, archive, and passthrough workflow tasks.
