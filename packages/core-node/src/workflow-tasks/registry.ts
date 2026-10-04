import { workflowTaskRunners as construct } from "@pipelab/plugin-construct";
import { workflowTaskRunners as electron } from "@pipelab/plugin-electron";
import { workflowTaskRunners as godot } from "@pipelab/plugin-godot";
import { workflowTaskRunners as itch } from "@pipelab/plugin-itch";
import { workflowTaskRunners as poki } from "@pipelab/plugin-poki";
import { workflowTaskRunners as steam } from "@pipelab/plugin-steam";
import { workflowTaskRunners as tauri } from "@pipelab/plugin-tauri";
import {
  createWorkflowActionTask,
  type PipelabPluginServices,
  type WorkflowTaskFactoryRegistry,
} from "../workflow-tasks";

const legacyRunners = {
  ...construct,
  ...electron,
  ...godot,
  ...itch,
  ...poki,
  ...steam,
  ...tauri,
};

const legacyOptions = (services: PipelabPluginServices) => ({
  context: services.context,
  paths: {
    cache: services.workflowCachePath,
    node: services.executables.node,
    pnpm: services.executables.pnpm,
    userData: services.context.userDataPath,
    modules: services.context.getPackagesPath(),
    thirdparty: services.context.getThirdPartyPath(),
  },
});

/** Native task factories; legacy plugin runners are adapted behind this registry. */
export const workflowTaskFactories: WorkflowTaskFactoryRegistry<PipelabPluginServices> =
  Object.fromEntries(
    Object.entries(legacyRunners).map(([id, runner]) => [
      id,
      (services: PipelabPluginServices) =>
        createWorkflowActionTask(runner, legacyOptions(services)),
    ]),
  );
