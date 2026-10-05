import { constructWorkflowTaskFactories } from "@pipelab/plugin-construct";
import { electronWorkflowTaskFactories } from "@pipelab/plugin-electron";
import { workflowTasks as godot } from "@pipelab/plugin-godot";
import { createItchUploadTask, WORKFLOW_TASK_ID as itchTaskId } from "@pipelab/plugin-itch";
import { createPokiUploadTask, WORKFLOW_TASK_ID as pokiTaskId } from "@pipelab/plugin-poki";
import { createSteamUploadTask, WORKFLOW_TASK_ID as steamTaskId } from "@pipelab/plugin-steam";
import { tauriWorkflowTaskFactories } from "@pipelab/plugin-tauri";
import { type PipelabPluginServices, type WorkflowTaskFactoryRegistry } from "../workflow-tasks";

/** Native Workflow tasks keyed by the stable IDs emitted by Release providers. */
export const workflowTaskFactories: WorkflowTaskFactoryRegistry<PipelabPluginServices> = {
  ...constructWorkflowTaskFactories,
  ...electronWorkflowTaskFactories,
  ...tauriWorkflowTaskFactories,
  "@pipelab/plugin-godot/godot:export": () => godot["@pipelab/plugin-godot/godot:export"],
  [itchTaskId]: (services) => createItchUploadTask({ context: services.context }),
  [pokiTaskId]: (services) =>
    createPokiUploadTask({ context: services.context, executables: services.executables }),
  [steamTaskId]: (services) => createSteamUploadTask({ context: services.context }),
};
