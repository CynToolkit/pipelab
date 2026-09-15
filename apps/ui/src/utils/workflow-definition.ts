export type WorkflowSourceType = "c3p" | "folder";

export interface WorkflowTargetOptions {
  steam?: {
    sdk: string;
    username: string;
    appId: string;
    depotId: string;
    description: string;
  };
  itch?: {
    project: string;
    apiKey: string;
    channel: string;
  };
}

export interface WorkflowDefinitionOptions {
  sourceType: WorkflowSourceType;
  packageProject: boolean;
  targets: WorkflowTargetOptions;
}

export interface WorkflowDefinitionStep {
  id: string;
  uses: string;
  needs?: string[];
  with?: Record<string, unknown>;
}

export interface WorkflowDefinition {
  version: 1;
  steps: WorkflowDefinitionStep[];
}

const sourceExportInputs = (sourceType: WorkflowSourceType) =>
  sourceType === "c3p"
    ? {
        file: "${{ variables.sourcePath }}",
        username: "",
        password: "",
        version: "",
        headless: true,
        timeout: 120,
        customProfile: "",
      }
    : {
        folder: "${{ variables.sourcePath }}",
        username: "",
        password: "",
        version: "",
        headless: true,
        timeout: 120,
        customProfile: "",
      };

const bundleInputs = {
  "input-folder": "${{ steps.prebundle.outputs.outputDirectory }}",
  arch: "",
  platform: "",
  name: "Pipelab Game",
  appBundleId: "com.pipelab.game",
  appCopyright: "",
  appVersion: "1.0.0",
  icon: "",
  author: "Pipelab",
  description: "",
  appCategoryType: "public.app-category.games",
  width: 1280,
  height: 720,
  fullscreen: false,
  frame: true,
  transparent: false,
  toolbar: false,
  alwaysOnTop: false,
  electronVersion: "",
  customMainCode: "",
  disableAsarPackaging: true,
  enableExtraLogging: false,
  clearServiceWorkerOnBoot: false,
  enableInProcessGPU: false,
  enableDisableRendererBackgrounding: false,
  forceHighPerformanceGpu: false,
  websocketApi: [],
  ignore: [],
  enableSteamSupport: false,
  steamGameId: "",
  enableDiscordSupport: false,
  discordAppId: "",
  customPackages: [],
  backgroundColor: "",
  enableDoctor: false,
  serverMode: false,
};

const splitItchProject = (value: string): { user: string; project: string } => {
  const [user = "", project = ""] = value.split("/", 2);
  return { user, project };
};

export const createWorkflowDefinition = (
  options: WorkflowDefinitionOptions,
): WorkflowDefinition => {
  const steps: WorkflowDefinitionStep[] = [
    {
      id: "source-export",
      uses: options.sourceType === "c3p" ? "construct:export" : "construct:export-folder",
      with: sourceExportInputs(options.sourceType),
    },
    {
      id: "prebundle",
      uses: "source:extract",
      with: { file: "${{ steps.source-export.outputs.zipFile }}" },
    },
  ];

  const bundleOutput = options.packageProject
    ? "${{ steps.bundle.outputs.bundleDirectory }}"
    : "${{ steps.prebundle.outputs.outputDirectory }}";

  if (options.packageProject) {
    steps.push({ id: "bundle", uses: "electron:bundle", with: bundleInputs });
  }

  if (options.targets.steam) {
    steps.push({
      id: "steam",
      uses: "steam:upload",
      needs: [options.packageProject ? "bundle" : "prebundle"],
      with: {
        ...options.targets.steam,
        folder: bundleOutput,
      },
    });
  }

  if (options.targets.itch) {
    const itchProject = splitItchProject(options.targets.itch.project);
    steps.push({
      id: "itch",
      uses: "itch:upload",
      needs: [options.packageProject ? "bundle" : "prebundle"],
      with: {
        ...options.targets.itch,
        ...itchProject,
        "input-folder": bundleOutput,
      },
    });
  }

  return { version: 1, steps };
};
