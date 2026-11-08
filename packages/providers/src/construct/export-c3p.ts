import { fileExists } from "@pipelab/plugin-core";
import type { WorkflowTask } from "@pipelab/workflow-runtime";
import { exportc3p, type ConstructExportExecutionContext } from "./export-shared.js";
import { parseConstructExportType } from "./assets/script.js";
import { getSavedConstructVersion } from "./saved-version.js";

export { formatSavedConstructVersion } from "./saved-version.js";

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
    const accountConnectionId =
      typeof task.inputs.accountConnectionId === "string" ? task.inputs.accountConnectionId : "";
    if (accountConnectionId) {
      const account = task.connectionValues[accountConnectionId];
      if (!account?.username || !account.password) {
        throw new Error(
          `Construct account Connection '${accountConnectionId}' is missing required credentials.`,
        );
      }
      inputs = { ...task.inputs };
      delete inputs.accountConnectionId;
      inputs.username = account.username;
      inputs.password = account.password;
    }
    inputs = { ...inputs, exportType: parseConstructExportType(task.inputs.exportType) };
    const requestedVersion =
      typeof task.inputs.version === "string" ? task.inputs.version.trim() : "";
    if (!requestedVersion) {
      const savedVersion = await getSavedConstructVersion(file);
      if (savedVersion) {
        task.log("Using Construct release saved with the project", savedVersion);
        inputs = { ...inputs, version: savedVersion };
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
