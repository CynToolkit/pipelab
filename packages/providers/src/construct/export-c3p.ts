import { fileExists } from "@pipelab/plugin-core";
import type { WorkflowTask } from "@pipelab/workflow-runtime";
import { exportc3p, type ConstructExportExecutionContext } from "./export-shared.js";

export interface ConstructWorkflowTaskServices {
  context: ConstructExportExecutionContext["context"] & {
    getThirdPartyPath(...subpaths: string[]): string;
  };
  executables: { node: string; pnpm: string };
}

export const constructExportWorkflowTaskFactory =
  (services: ConstructWorkflowTaskServices): WorkflowTask<ConstructWorkflowTaskServices> =>
  async (task) => {
    const file = task.inputs.file;
    if (typeof file !== "string" || file.length === 0) {
      throw new Error("You must specify a .c3p file");
    }
    if (!(await fileExists(file))) {
      throw new Error("You must specify a valid .c3p file");
    }

    const execution: ConstructExportExecutionContext = {
      cwd: task.workspace.root,
      log: task.log,
      inputs: task.inputs,
      paths: {
        node: services.executables.node,
        thirdparty: services.context.getThirdPartyPath(),
      },
      abortSignal: task.signal,
      context: services.context,
    };
    const outputs = await exportc3p(file, execution);
    task.setArtifact("zipFile", outputs.zipFile);
    return outputs;
  };

export const constructWorkflowTaskFactories = {
  "@pipelab/plugin-construct/export-construct-project": constructExportWorkflowTaskFactory,
};
