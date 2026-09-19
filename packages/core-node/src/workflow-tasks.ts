import type {
  WorkflowTask,
  WorkflowTaskContext,
  WorkflowTaskRegistry,
} from "@pipelab/workflow-runtime";
import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { usePlugins } from "@pipelab/shared";
import type { PipelabContext } from "./context";
import type { ActionRunner, ActionRunnerData } from "./types/runner";
import { zipFolder } from "./utils/fs-extras";
import { createPipelabCloudUploadTask } from "./pipelab-cloud";

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
    const setArtifact = (outputId: string, path: string, metadata?: { checksum?: string; size?: number; name?: string }) => {
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

export const createPipelabWorkflowTasks = (
  options: WorkflowTaskOptions,
  // The shared registry intentionally exposes renderer-safe plugin types. At
  // runtime the main process registry retains each node's action runner.
  registeredPlugins = usePlugins().plugins.value as unknown as RegisteredPlugin[],
): WorkflowTaskRegistry => {
  const pluginTasks = Object.fromEntries(
    registeredPlugins.flatMap((plugin) => plugin.nodes.map((node) => [
      `${plugin.id}/${node.node.id}`,
      createWorkflowActionTask(node.runner, options),
    ] as const)),
  );

  return {
    ...pluginTasks,
    "@pipelab/core/passthrough": async (taskContext) => {
      const path = taskContext.inputs.path;
      if (typeof path !== "string" || !path) throw new Error("Passthrough source requires a path");
      taskContext.setArtifact("project", path);
      return { output: path };
    },
    "filesystem:zip": async (taskContext) => {
      const from = taskContext.inputs.from;
      const to = taskContext.inputs.to;
      if (typeof from !== "string" || typeof to !== "string" || !to.trim()) throw new Error("ZIP destination requires a source folder and output path");
      await mkdir(dirname(to), { recursive: true });
      const output = await zipFolder(from, to, taskContext.log, taskContext.signal);
      return { output, path: output };
    },
    "pipelab-cloud:upload": createPipelabCloudUploadTask(options.context),
  };
};
