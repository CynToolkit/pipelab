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
previous step's outputs with `${{ steps.step-id.outputs.name }}`. The initial
runtime executes steps sequentially and exposes `fs:run` as the first migrated
Pipelab task.
