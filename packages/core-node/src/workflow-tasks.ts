import type {
  WorkflowTask,
  WorkflowTaskContext,
  WorkflowTaskRegistry,
} from "@pipelab/workflow-runtime";
import type { PipelabContext } from "./context";
import type { ActionRunner, ActionRunnerData } from "./types/runner";

export interface WorkflowTaskOptions {
  context: PipelabContext;
  paths: ActionRunnerData<any>["paths"];
  outputAliases?: Record<string, string>;
  artifacts?: Record<string, string>;
}

/**
 * Adapts a plugin action runner to the standalone workflow task contract.
 *
 * The adapter deliberately calls the runner directly. It does not construct a
 * graph node or invoke the legacy graph evaluator.
 */
export const createWorkflowActionTask = (
  runner: ActionRunner<any>,
  options: WorkflowTaskOptions,
): WorkflowTask => {
  return async (taskContext: WorkflowTaskContext) => {
    const outputs: Record<string, unknown> = {};
    const log: typeof console.log = (...args) => taskContext.log(...args);

    await runner({
      inputs: taskContext.inputs,
      log,
      setOutput: (key, value) => {
        outputs[key] = value;
      },
      setMeta: () => undefined,
      meta: { definition: "workflow" },
      cwd: taskContext.workspace.root,
      paths: options.paths,
      browserWindow: undefined as any,
      abortSignal: taskContext.signal,
      context: options.context,
      setArtifact: taskContext.setArtifact,
    });

    for (const [alias, output] of Object.entries(options.outputAliases ?? {})) {
      if (outputs[output] !== undefined) outputs[alias] = outputs[output];
    }
    for (const [name, output] of Object.entries(options.artifacts ?? {})) {
      const path = outputs[output];
      if (typeof path === "string") taskContext.setArtifact(name, path);
    }

    return outputs;
  };
};

export const createWorkflowTaskRegistry = (
  runners: Record<string, ActionRunner<any>>,
  options: WorkflowTaskOptions,
): WorkflowTaskRegistry =>
  Object.fromEntries(
    Object.entries(runners).map(([id, runner]) => [id, createWorkflowActionTask(runner, options)]),
  );

export const createPipelabWorkflowTasks = async (
  options: WorkflowTaskOptions,
): Promise<WorkflowTaskRegistry> => {
  // Load plugin modules after core-node has initialized. Importing them at the
  // top level would re-enter plugin-core through its core-node type boundary.
  const [
    { ExportActionRunner, ExportProjectActionRunner },
    { unzipRunner },
    { packageV2Runner },
    { uploadToSteamRunner },
    { uploadToItchRunner },
  ] = await Promise.all([
    import("@pipelab/plugin-construct"),
    import("@pipelab/plugin-filesystem"),
    import("@pipelab/plugin-electron"),
    import("@pipelab/plugin-steam"),
    import("@pipelab/plugin-itch"),
  ]);

  return {
    "construct:export": createWorkflowActionTask(ExportActionRunner, {
      ...options,
      outputAliases: { outputDirectory: "zipFile" },
      artifacts: { "source-export": "zipFile" },
    }),
    "construct:export-folder": createWorkflowActionTask(ExportProjectActionRunner, {
      ...options,
      outputAliases: { outputDirectory: "zipFile" },
      artifacts: { "source-export": "zipFile" },
    }),
    "source:extract": createWorkflowActionTask(unzipRunner, {
      ...options,
      outputAliases: { outputDirectory: "output" },
      artifacts: { "source-directory": "output" },
    }),
    "electron:bundle": createWorkflowActionTask(packageV2Runner, {
      ...options,
      outputAliases: { bundleDirectory: "output" },
      artifacts: { bundle: "output" },
    }),
    "steam:upload": createWorkflowActionTask(uploadToSteamRunner, options),
    "itch:upload": createWorkflowActionTask(uploadToItchRunner, options),
  };
};
