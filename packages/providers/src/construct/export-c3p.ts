import { fileExists } from "@pipelab/plugin-core";
import type { WorkflowTask } from "@pipelab/workflow-runtime";
import StreamZip from "node-stream-zip";
import { exportc3p, type ConstructExportExecutionContext } from "./export-shared.js";

export const formatSavedConstructVersion = (savedWithRelease: unknown): string | undefined => {
  if (typeof savedWithRelease !== "number" || !Number.isSafeInteger(savedWithRelease)) {
    return undefined;
  }

  const release = Math.floor(savedWithRelease / 100);
  if (release <= 0) return undefined;

  const patch = savedWithRelease % 100;
  return `r${release}${patch > 0 ? `-${patch}` : ""}`;
};

const getSavedConstructVersion = async (file: string): Promise<string | undefined> => {
  // Construct archives created on Windows can contain backslashes in entry
  // names; we only read the fixed root project.c3proj entry and never extract.
  const archive = new StreamZip.async({ file, skipEntryNameValidation: true });
  try {
    const projectEntry = await archive.entry("project.c3proj");
    if (!projectEntry || projectEntry.isDirectory) return undefined;

    const project: unknown = JSON.parse((await archive.entryData(projectEntry)).toString("utf8"));
    if (!project || typeof project !== "object" || !("savedWithRelease" in project)) {
      return undefined;
    }

    return formatSavedConstructVersion(project.savedWithRelease);
  } catch {
    return undefined;
  } finally {
    await archive.close().catch(() => {});
  }
};

export interface ConstructWorkflowTaskServices {
  context: ConstructExportExecutionContext["context"] & {
    getThirdPartyPath(...subpaths: string[]): string;
  };
  executables: { node: string; pnpm: string };
  run: { projectId: string };
}

export const constructExportWorkflowTaskFactory =
  (services: ConstructWorkflowTaskServices): WorkflowTask<ConstructWorkflowTaskServices> =>
  async (task) => {
    const setupStartedAt = Date.now();
    const log = (...args: unknown[]) => {
      if (args[0] === '"Next" clicked') {
        task.log("Construct setup elapsed", `${Date.now() - setupStartedAt} ms`);
      }
      task.log(...args);
    };
    const file = task.inputs.file;
    if (typeof file !== "string" || file.length === 0) {
      throw new Error("You must specify a .c3p file");
    }
    if (!(await fileExists(file))) {
      throw new Error("You must specify a valid .c3p file");
    }

    let inputs = task.inputs;
    const requestedVersion =
      typeof task.inputs.version === "string" ? task.inputs.version.trim() : "";
    if (!requestedVersion) {
      const savedVersion = await getSavedConstructVersion(file);
      if (savedVersion) {
        task.log("Using Construct release saved with the project", savedVersion);
        inputs = { ...task.inputs, version: savedVersion };
      }
    }

    const execution: ConstructExportExecutionContext = {
      cwd: task.workspace.root,
      log,
      inputs,
      paths: {
        node: services.executables.node,
        thirdparty: services.context.getThirdPartyPath(),
      },
      abortSignal: task.signal,
      context: services.context,
      projectId: services.run.projectId,
    };
    const outputs = await exportc3p(file, execution);
    task.setArtifact("zipFile", outputs.zipFile);
    return outputs;
  };

export const constructWorkflowTaskFactories = {
  "@pipelab/plugin-construct/export-construct-project": constructExportWorkflowTaskFactory,
};
