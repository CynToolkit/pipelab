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
    const stableOutputId = taskContext.step.with?.outputId;

    const setArtifact = (outputId: string, path: string, metadata?: { checksum?: string; size?: number; name?: string }) => {
      const stableId = typeof stableOutputId === "string" ? stableOutputId : outputId;
      if (metadata === undefined) taskContext.setArtifact(stableId, path);
      else taskContext.setArtifact(stableId, path, metadata);
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
        const outputId = typeof taskContext.step.with?.outputId === "string" ? taskContext.step.with.outputId : name;
        taskContext.setArtifact(outputId, path);
      }
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
  const copy = findRunner("@pipelab/plugin-filesystem", "fs:copy", registeredPlugins);
  const electronBundle = findRunner(
    "@pipelab/plugin-electron",
    "electron:package:v2",
    registeredPlugins,
  );
  const tauriBundle = registeredPlugins.some((plugin) => plugin.id === "@pipelab/plugin-tauri")
    ? findRunner("@pipelab/plugin-tauri", "tauri:package:v2", registeredPlugins)
    : undefined;
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
    "filesystem:copy": createWorkflowActionTask(copy, options),
    "electron:bundle": createWorkflowActionTask(electronBundle, {
      ...options,
      outputAliases: { bundleDirectory: "output" },
      artifacts: { bundle: "output" },
    }),
    ...(tauriBundle ? { "tauri:bundle": createWorkflowActionTask(tauriBundle, {
      ...options,
      outputAliases: { bundleDirectory: "output" },
      artifacts: { bundle: "output" },
    }) } : {}),
    "web:bundle": async (taskContext) => {
      const path = taskContext.inputs["input-folder"];
      if (typeof path !== "string") throw new Error("Web packager requires an input folder");
      taskContext.setArtifact(String(taskContext.step.with?.outputId || "web.html5"), path);
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
    "steam:upload": createWorkflowActionTask(steamUpload, options),
    "itch:upload": createWorkflowActionTask(itchUpload, options),
  };
};
