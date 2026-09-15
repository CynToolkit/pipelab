import type {
  WorkflowTask,
  WorkflowTaskContext,
  WorkflowTaskRegistry,
} from "@pipelab/workflow-runtime";
import { usePlugins } from "@pipelab/shared";
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
        outputs[String(key)] = value;
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

type RegisteredPlugin = {
  id: string;
  nodes: Array<{ node: { id: string }; runner: ActionRunner<any> }>;
};

const findRunner = (
  pluginId: string,
  nodeId: string,
  registeredPlugins: RegisteredPlugin[],
): ActionRunner<any> => {
  const plugin = registeredPlugins.find((candidate) => candidate.id === pluginId);
  const runner = plugin?.nodes.find((candidate) => candidate.node.id === nodeId)?.runner;
  if (!runner) throw new Error(`Workflow plugin task not loaded: ${pluginId}/${nodeId}`);
  return runner;
};

export const createPipelabWorkflowTasks = (
  options: WorkflowTaskOptions,
  // The shared registry intentionally exposes renderer-safe plugin types. At
  // runtime the main process registry retains each node's action runner.
  registeredPlugins = usePlugins().plugins.value as unknown as RegisteredPlugin[],
): WorkflowTaskRegistry => {
  const constructExport = findRunner(
    "@pipelab/plugin-construct",
    "export-construct-project",
    registeredPlugins,
  );
  const constructExportFolder = findRunner(
    "@pipelab/plugin-construct",
    "export-construct-project-folder",
    registeredPlugins,
  );
  const sourceExtract = findRunner(
    "@pipelab/plugin-filesystem",
    "unzip-file-node",
    registeredPlugins,
  );
  const electronBundle = findRunner(
    "@pipelab/plugin-electron",
    "electron:package:v2",
    registeredPlugins,
  );
  const steamUpload = findRunner("@pipelab/plugin-steam", "steam-upload", registeredPlugins);
  const itchUpload = findRunner("@pipelab/plugin-itch", "itch-upload", registeredPlugins);

  return {
    "construct:export": createWorkflowActionTask(constructExport, {
      ...options,
      outputAliases: { outputDirectory: "zipFile" },
      artifacts: { "source-export": "zipFile" },
    }),
    "construct:export-folder": createWorkflowActionTask(constructExportFolder, {
      ...options,
      outputAliases: { outputDirectory: "zipFile" },
      artifacts: { "source-export": "zipFile" },
    }),
    "source:extract": createWorkflowActionTask(sourceExtract, {
      ...options,
      outputAliases: { outputDirectory: "output" },
      artifacts: { "source-directory": "output" },
    }),
    "electron:bundle": createWorkflowActionTask(electronBundle, {
      ...options,
      outputAliases: { bundleDirectory: "output" },
      artifacts: { bundle: "output" },
    }),
    "steam:upload": createWorkflowActionTask(steamUpload, options),
    "itch:upload": createWorkflowActionTask(itchUpload, options),
  };
};
