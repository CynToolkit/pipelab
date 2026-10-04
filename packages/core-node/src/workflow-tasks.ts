import type {
  WorkflowTask,
  WorkflowTaskContext,
  WorkflowTaskRegistry,
} from "@pipelab/workflow-runtime";
import type { PipelabContext } from "./context";
import type { ActionRunner, ActionRunnerData } from "./types/runner";
import { createPipelabCloudUploadTask } from "./pipelab-cloud";
import { createCoreFilesystemWorkflowTasks } from "./workflow-tasks/filesystem";

export interface PipelabPluginServices {
  context: PipelabContext;
  /** Node and pnpm executables ensured for this workflow run. */
  executables: { node: string; pnpm: string };
  /** Per-run build cache directory. Other managed directories come from context. */
  workflowCachePath: string;
}

export interface LegacyWorkflowTaskOptions {
  context: PipelabContext;
  paths: ActionRunnerData<any>["paths"];
  outputAliases?: Record<string, string>;
  artifacts?: Record<string, string>;
}

export type WorkflowTaskFactory<TServices = PipelabPluginServices> = (
  services: TServices,
) => WorkflowTask<TServices>;
export type WorkflowTaskFactoryRegistry<TServices = PipelabPluginServices> = Record<
  string,
  WorkflowTaskFactory<TServices>
>;

/**
 * Adapts a plugin action runner to the standalone workflow task contract.
 *
 * The adapter deliberately calls the runner directly. It does not construct a
 * graph node or invoke the legacy graph evaluator.
 */
export const createWorkflowActionTask = (
  runner: ActionRunner<any>,
  options: LegacyWorkflowTaskOptions,
): WorkflowTask => {
  return async (taskContext: WorkflowTaskContext) => {
    const outputs: Record<string, unknown> = {};
    const log: typeof console.log = (...args) => taskContext.log(...args);
    const setArtifact = (
      outputId: string,
      path: string,
      metadata?: { checksum?: string; size?: number; name?: string },
    ) => {
      if (metadata === undefined) taskContext.setArtifact(outputId, path);
      else taskContext.setArtifact(outputId, path, metadata);
    };

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
      setArtifact,
    });

    for (const [alias, output] of Object.entries(options.outputAliases ?? {})) {
      if (outputs[output] !== undefined) outputs[alias] = outputs[output];
    }
    for (const [name, output] of Object.entries(options.artifacts ?? {})) {
      const path = outputs[output];
      if (typeof path === "string") {
        taskContext.setArtifact(name, path);
      }
    }
    for (const name of Object.keys(taskContext.step.artifacts ?? {})) {
      const path = outputs[name];
      if (typeof path === "string") taskContext.setArtifact(name, path);
    }

    return outputs;
  };
};

export const createWorkflowTaskRegistry = <TServices>(
  factories: WorkflowTaskFactoryRegistry<TServices>,
  services: TServices,
): WorkflowTaskRegistry<TServices> =>
  Object.fromEntries(
    Object.entries(factories).map(([id, createTask]) => [id, createTask(services)]),
  );

export const createPipelabWorkflowTasks = <TServices = unknown>(
  services: PipelabPluginServices,
  registeredTasks: WorkflowTaskRegistry<TServices>,
): WorkflowTaskRegistry<TServices> => {
  return {
    ...registeredTasks,
    ...createCoreFilesystemWorkflowTasks(),
    "pipelab-cloud:upload": createPipelabCloudUploadTask(services.context),
  };
};
