import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import {
  copyPath,
  removePath,
  CORE_WORKFLOW_TASKS,
  type WorkflowTaskRegistry,
} from "@pipelab/workflow-runtime";
import { extractZip, zipFolder } from "../utils/fs-extras";

const requiredPath = (value: unknown, description: string): string => {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${description} requires a path`);
  return value;
};

export const createCoreFilesystemWorkflowTasks = (): WorkflowTaskRegistry => ({
  [CORE_WORKFLOW_TASKS.copy]: async (context) => {
    const result = await copyPath({
      from: requiredPath(context.inputs.from, "Filesystem copy source"),
      to: requiredPath(context.inputs.to, "Filesystem copy destination"),
      recursive: context.inputs.recursive !== false,
      overwrite: context.inputs.overwrite !== false,
      cleanup: context.inputs.cleanup === true,
      log: context.log,
    });
    if (context.step.artifacts?.output) context.setArtifact("output", result.output);
    return {
      output: result.output,
      input: result.input,
      parentDirectory: result.parentDirectory,
    };
  },
  [CORE_WORKFLOW_TASKS.remove]: async (context) => {
    await removePath(requiredPath(context.inputs.from, "Filesystem remove"), {
      recursive: context.inputs.recursive !== false,
      log: context.log,
    });
  },
  [CORE_WORKFLOW_TASKS.zip]: async (context) => {
    const from = requiredPath(context.inputs.from, "Filesystem ZIP source");
    const to = requiredPath(context.inputs.to, "Filesystem ZIP destination");
    await mkdir(dirname(to), { recursive: true });
    const output = await zipFolder(from, to, context.log, context.signal);
    if (context.step.artifacts?.output) context.setArtifact("output", output);
    return { output, path: output };
  },
  [CORE_WORKFLOW_TASKS.unzip]: async (context) => {
    const file = requiredPath(context.inputs.file, "Filesystem unzip source");
    const output =
      typeof context.inputs.to === "string" && context.inputs.to.trim()
        ? context.inputs.to
        : context.workspace.root;
    await extractZip(file, output, context.signal);
    if (context.step.artifacts?.output) context.setArtifact("output", output);
    return { output, path: output };
  },
  [CORE_WORKFLOW_TASKS.passthrough]: async (context) => {
    const path = requiredPath(context.inputs.path, "Passthrough source");
    if (context.step.artifacts?.output) context.setArtifact("output", path);
    return { output: path };
  },
});
