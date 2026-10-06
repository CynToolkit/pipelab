import type { WorkflowTask, WorkflowTaskRegistry } from "@pipelab/workflow-runtime";
import type { PipelabContext } from "./context";
import { createPipelabCloudUploadTask } from "./pipelab-cloud";
import { createCoreFilesystemWorkflowTasks } from "./workflow-tasks/filesystem";

export interface ProviderServices {
  context: PipelabContext;
  /** Node and pnpm executables ensured for this workflow run. */
  executables: { node: string; pnpm: string };
  /** Per-run build cache directory. Other managed directories come from context. */
  workflowCachePath: string;
}

export type WorkflowTaskFactory<TServices = ProviderServices> = (
  services: TServices,
) => WorkflowTask<TServices>;
export type WorkflowTaskFactoryRegistry<TServices = ProviderServices> = Record<
  string,
  WorkflowTaskFactory<TServices>
>;

export const createWorkflowTaskRegistry = <TServices>(
  factories: WorkflowTaskFactoryRegistry<TServices>,
  services: TServices,
): WorkflowTaskRegistry<TServices> =>
  Object.fromEntries(
    Object.entries(factories).map(([id, createTask]) => [id, createTask(services)]),
  );

export const createPipelabWorkflowTasks = <TServices = unknown>(
  services: ProviderServices,
  registeredTasks: WorkflowTaskRegistry<TServices>,
): WorkflowTaskRegistry<TServices> => {
  return {
    ...registeredTasks,
    ...createCoreFilesystemWorkflowTasks(),
    "pipelab-cloud:upload": createPipelabCloudUploadTask(services.context),
  };
};

/** @deprecated Use ProviderServices. */
export type PipelabPluginServices = ProviderServices;
