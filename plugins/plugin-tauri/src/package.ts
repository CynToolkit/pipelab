import type { WorkflowTask } from "@pipelab/workflow-runtime";
import { merge } from "ts-deepmerge";
import { tauri, type TauriExecutionContext } from "./tauri";
import { defaultTauriConfig } from "./utils";

export interface TauriWorkflowTaskServices {
  context: TauriExecutionContext["context"];
  executables: { node: string; pnpm: string };
  workflowCachePath: string;
}

export const tauriPackageWorkflowTaskFactory =
  (services: TauriWorkflowTaskServices): WorkflowTask<TauriWorkflowTaskServices> =>
  async (task) => {
    const appFolder = task.inputs["input-folder"];
    const completeConfiguration = merge(defaultTauriConfig, {
      alwaysOnTop: task.inputs.alwaysOnTop,
      appBundleId: task.inputs.appBundleId,
      appCategoryType: task.inputs.appCategoryType,
      appCopyright: task.inputs.appCopyright,
      appVersion: task.inputs.appVersion,
      author: task.inputs.author,
      description: task.inputs.description,
      tauriVersion: task.inputs.tauriVersion,
      enableExtraLogging: task.inputs.enableExtraLogging,
      clearServiceWorkerOnBoot: task.inputs.clearServiceWorkerOnBoot,
      frame: task.inputs.frame,
      fullscreen: task.inputs.fullscreen,
      icon: task.inputs.icon,
      height: task.inputs.height,
      name: task.inputs.name,
      toolbar: task.inputs.toolbar,
      transparent: task.inputs.transparent,
      width: task.inputs.width,
      enableSteamSupport: task.inputs.enableSteamSupport,
      steamGameId: task.inputs.steamGameId,
      ignore: task.inputs.ignore,
      openDevtoolsOnStart: task.inputs.openDevtoolsOnStart,
      enableDiscordSupport: task.inputs.enableDiscordSupport,
      discordAppId: task.inputs.discordAppId,
      customPackages: task.inputs.customPackages,
      backgroundColor: task.inputs.backgroundColor,
    }) as unknown as DesktopApp.Tauri;

    const execution: TauriExecutionContext = {
      cwd: task.workspace.root,
      log: task.log,
      inputs: task.inputs,
      paths: {
        node: services.executables.node,
        cache: services.workflowCachePath,
      },
      abortSignal: task.signal,
      context: services.context,
    };
    const result = await tauri(
      "package",
      typeof appFolder === "string" ? appFolder : undefined,
      execution,
      completeConfiguration,
    );
    if (!result) return {};

    task.setArtifact("output", result.folder);
    return { output: result.folder, binary: result.binary };
  };

export const tauriWorkflowTaskFactories = {
  "@pipelab/plugin-tauri/tauri:package:v2": tauriPackageWorkflowTaskFactory,
};
