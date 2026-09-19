import type {
  WorkflowTask,
  WorkflowTaskContext,
  WorkflowTaskRegistry,
} from "@pipelab/workflow-runtime";
import { mkdir } from "node:fs/promises";
import { readFile, readdir, rm, stat } from "node:fs/promises";
import { createHash } from "node:crypto";
import { dirname, join, resolve } from "node:path";
import AdmZip from "adm-zip";
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
  const pokiUpload = registeredPlugins.some((plugin) => plugin.id === "@pipelab/plugin-poki")
    ? findRunner("@pipelab/plugin-poki", "poki-upload", registeredPlugins)
    : undefined;

  const godotExport: WorkflowTask = async (taskContext) => {
    const project = String(taskContext.inputs.project || "");
    const preset = String(taskContext.inputs.preset || "").trim();
    const outputId = String(taskContext.inputs.outputId || "");
    if (!project) throw new Error("Godot export requires a project folder");
    if (!preset) throw new Error("Choose an available Godot export preset for this build output");
    const executable = String(taskContext.inputs.godotExecutable || "godot");
    const outputDirectory = resolve(taskContext.workspace.root, ".pipelab-godot", String(taskContext.inputs.packagerId || "build"), outputId);
    await rm(outputDirectory, { recursive: true, force: true });
    await taskContext.filesystem.ensureDirectory(outputDirectory);
    const platform = String(taskContext.inputs.platform || "");
    const projectName = String(taskContext.inputs.projectName || "game").replace(/[^a-zA-Z0-9_-]/g, "-");
    const filename = platform === "windows" ? `${projectName}.exe` : platform === "linux" ? `${projectName}.x86_64` : platform === "macos" ? `${projectName}.app` : platform === "web" ? `${projectName}.zip` : `${projectName}.bin`;
    const output = join(outputDirectory, filename);
    let result;
    try {
      result = await taskContext.processes.execute(executable, [
      "--headless", "--path", project, "--export-release", preset, output,
      ], {
        cwd: project,
        signal: taskContext.signal,
        onStdout: (chunk) => taskContext.logStream("stdout", chunk),
        onStderr: (chunk) => taskContext.logStream("stderr", chunk),
      });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") throw new Error(`Godot executable not found: ${executable}. Install Godot or configure its executable path.`);
      throw error;
    }
    if (result.exitCode !== 0) {
      const logs = `${result.stderr}\n${result.stdout}`;
      if (/export template/i.test(logs)) throw new Error(`Godot export templates are missing for preset "${preset}". Install the matching templates in Godot Editor > Manage Export Templates.`);
      throw new Error(`Godot export failed for preset "${preset}" (exit code ${String(result.exitCode)}). ${logs.trim() || "See the workflow log for details."}`);
    }
    if (platform === "web") {
      try {
        const archive = new AdmZip(output);
        const root = resolve(outputDirectory);
        for (const entry of archive.getEntries()) {
          const target = resolve(root, entry.entryName);
          if (target !== root && !target.startsWith(`${root}${process.platform === "win32" ? "\\" : "/"}`)) {
            throw new Error(`Unsafe path in export archive: ${entry.entryName}`);
          }
        }
        archive.extractAllTo(outputDirectory, true);
        await rm(output, { force: true });
      } catch (error) {
        throw new Error(`Godot web export did not produce a valid ZIP archive: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    let size = 0;
    const hash = createHash("sha256");
    const visit = async (directory: string): Promise<void> => {
      for (const entry of await readdir(directory, { withFileTypes: true })) {
        const path = join(directory, entry.name);
        if (entry.isDirectory()) await visit(path);
        else if (entry.isFile()) {
          const file = await stat(path);
          size += file.size;
          hash.update(await readFile(path));
        }
      }
    };
    await visit(outputDirectory);
    if (!size) throw new Error(`Godot reported a successful export but produced no files for preset "${preset}".`);
    taskContext.setArtifact(outputId, outputDirectory, { size, checksum: hash.digest("hex"), name: `${projectName} ${platform}` });
    return { output: outputDirectory, outputDirectory, bundleDirectory: outputDirectory };
  };

  return {
    "godot:export": godotExport,
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
    ...(pokiUpload ? { "poki:upload": createWorkflowActionTask(pokiUpload, options) } : {}),
    "pipelab-cloud:upload": createPipelabCloudUploadTask(options.context),
  };
};
