import type { WorkflowTask } from "@pipelab/workflow-runtime";
import { merge } from "ts-deepmerge";
import { forge, type ForgeExecutionContext } from "./forge";
import { defaultElectronConfig } from "./utils";

export interface ElectronWorkflowTaskServices {
  context: ForgeExecutionContext["context"];
  executables: { node: string; pnpm: string };
  workflowCachePath: string;
}

const configurationInputKeys = [
  "alwaysOnTop",
  "appBundleId",
  "appCategoryType",
  "appCopyright",
  "appVersion",
  "author",
  "customMainCode",
  "description",
  "electronVersion",
  "disableAsarPackaging",
  "forceHighPerformanceGpu",
  "patchExecutable",
  "enableExtraLogging",
  "clearServiceWorkerOnBoot",
  "enableDisableRendererBackgrounding",
  "enableInProcessGPU",
  "frame",
  "fullscreen",
  "icon",
  "height",
  "name",
  "toolbar",
  "transparent",
  "width",
  "enableSteamSupport",
  "steamGameId",
  "ignore",
  "openDevtoolsOnStart",
  "enableDiscordSupport",
  "discordAppId",
  "customPackages",
  "backgroundColor",
  "enableDoctor",
  "serverMode",
] as const;

export const electronPackageWorkflowTaskFactory =
  (services: ElectronWorkflowTaskServices): WorkflowTask<ElectronWorkflowTaskServices> =>
  async (task) => {
    const appFolder = task.inputs["input-folder"];
    const inputConfiguration = Object.fromEntries(
      configurationInputKeys
        .map((key) => [key, task.inputs[key]] as const)
        .filter(([, value]) => value !== undefined),
    ) as Partial<DesktopApp.Electron>;
    const completeConfiguration = merge(
      defaultElectronConfig,
      inputConfiguration,
    ) as DesktopApp.Electron;

    task.log("completeConfiguration", completeConfiguration);

    const execution: ForgeExecutionContext = {
      cwd: task.workspace.root,
      log: task.log,
      inputs: task.inputs,
      paths: {
        node: services.executables.node,
        pnpm: services.executables.pnpm,
      },
      abortSignal: task.signal,
      context: services.context,
      setArtifact: task.setArtifact,
    };
    const result = await forge(
      "package",
      typeof appFolder === "string" ? appFolder : undefined,
      execution,
      completeConfiguration,
    );

    return result ? { output: result.folder } : {};
  };

export const electronWorkflowTaskFactories = {
  "@pipelab/plugin-electron/electron:package:v2": electronPackageWorkflowTaskFactory,
};
