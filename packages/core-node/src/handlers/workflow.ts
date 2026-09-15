import {
  createLocalHost,
  runWorkflow,
  type Workflow,
  type WorkflowRunContext,
} from "@pipelab/workflow-runtime";
import { nanoid } from "nanoid";
import { access, mkdir, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import process from "node:process";
import { useLogger, type WorkflowConfig } from "@pipelab/shared";
import { CacheFolder, PipelabContext } from "../context";
import { setupConnectionsConfigFile, setupWorkflowConfigFileByName } from "../config";
import { ensureNodeJS, ensurePNPM } from "../utils/remote";
import { createPipelabWorkflowTasks } from "../workflow-tasks";
import { useAPI } from "../ipc-core";

const hostPlatform =
  process.platform === "win32" ? "win32" : process.platform === "darwin" ? "darwin" : "linux";
const hostArch = process.arch === "arm64" ? "arm64" : "x64";

const itchUsernameFor = async (apiKey: string) => {
  const response = await fetch("https://api.itch.io/profile", {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!response.ok) throw new Error(`Unable to resolve Itch.io username (${response.status})`);
  const profile = (await response.json()) as { user?: { username?: string } };
  const username = profile.user?.username?.trim();
  if (!username) throw new Error("Itch.io API key did not return an account username");
  return username;
};

const bundleIdFor = (name: string) =>
  `com.pipelab.${
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ".")
      .replace(/^\.|\.$/g, "") || "game"
  }`;

const sourceIcon = async (flow: WorkflowConfig) => {
  // ponytail: conventional filenames only; parse source metadata if custom icons are needed.
  const root = flow.source.type === "folder" ? flow.source.path : dirname(flow.source.path);
  for (const name of ["icon.png", "icon.ico", "icon.icns"]) {
    const path = join(root, name);
    try {
      await access(path);
      return path;
    } catch {
      // Try the next conventional icon name.
    }
  }
  return "";
};

const createWorkflowDefinition = async (
  flow: WorkflowConfig,
  connections: Map<string, any>,
  selectedTypes?: string[],
  release?: { version: string; description: string; headless?: boolean },
): Promise<{ workflow: Workflow; variables: Record<string, unknown> }> => {
  if (!flow.source.path) throw new Error("Choose a source before running the workflow");
  const sourceStats = await stat(flow.source.path);
  if (flow.source.type === "folder" && !sourceStats.isDirectory())
    throw new Error("The build folder does not exist");
  if (flow.source.type === "construct3" && !sourceStats.isFile())
    throw new Error("The Construct project file does not exist");

  const destinations = flow.destinations.filter(
    (destination) =>
      destination.enabled !== false && (!selectedTypes || selectedTypes.includes(destination.type)),
  );
  if (!destinations.length) throw new Error("Choose at least one destination");
  if (new Set(destinations.map((destination) => destination.type)).size !== destinations.length)
    throw new Error("A workflow can only contain one destination of each type");

  const steps: Workflow["steps"] = [];
  const variables: Record<string, unknown> = { sourcePath: flow.source.path };
  let sourceReference = "${{ variables.sourcePath }}";
  let sourceNeeds: string[] = [];

  if (flow.source.type === "construct3") {
    if (!flow.source.profilePath)
      throw new Error("Choose a browser profile before running the workflow");
    const profileStats = await stat(flow.source.profilePath);
    if (!profileStats.isDirectory()) throw new Error("The selected browser profile does not exist");
    variables.profilePath = flow.source.profilePath;
    steps.push({
      id: "source-export",
      uses: "construct:export",
      with: {
        file: "${{ variables.sourcePath }}",
        username: "",
        password: "",
        version: flow.source.version || "",
        headless: release?.headless ?? false,
        timeout: 120,
        customProfile: "${{ variables.profilePath }}",
      },
    });
    steps.push({
      id: "source-extract",
      uses: "source:extract",
      needs: ["source-export"],
      with: { file: "${{ steps.source-export.outputs.zipFile }}" },
    });
    sourceReference = "${{ steps.source-extract.outputs.outputDirectory }}";
    sourceNeeds = ["source-extract"];
  }

  for (const destination of destinations) {
    if (destination.type === "web") {
      steps.push({
        id: "web",
        uses: "filesystem:copy",
        needs: sourceNeeds,
        with: {
          from: sourceReference,
          to: destination.outputDir,
          recursive: true,
          overwrite: destination.overwrite ?? false,
          cleanup: destination.cleanup ?? false,
        },
      });
    }

    if (destination.type === "itch") {
      const account = connections.get(destination.accountConnectionId);
      const apiKey = account?.apiKey;
      if (!apiKey) throw new Error("No Itch.io API key connection found");
      const user = await itchUsernameFor(apiKey);
      variables.itchApiKey = apiKey;
      steps.push({
        id: "itch",
        uses: "itch:upload",
        needs: sourceNeeds,
        with: {
          "input-folder": sourceReference,
          user,
          project: destination.project,
          channel: destination.channel,
          "api-key": "${{ variables.itchApiKey }}",
        },
      });
    }

    if (destination.type === "steam") {
      const account = destination.accountConnectionId
        ? connections.get(destination.accountConnectionId)
        : undefined;
      const username = account?.username || account?.email || "";
      const password = account?.password || "";
      if (!username || !password)
        throw new Error("Select a Steam account connection before running the workflow");
      variables.steamUsername = username;
      variables.steamPassword = password;
      const appName = destination.appName || flow.name || "Pipelab game";
      const appBundleId = destination.appBundleId || bundleIdFor(appName);
      const appVersion = release?.version || destination.appVersion || "1.0.0";
      const description =
        release?.description || destination.description || flow.description || flow.name;
      const icon = destination.icon || (await sourceIcon(flow));

      steps.push({
        id: "steam-bundle",
        uses: "electron:bundle",
        needs: sourceNeeds,
        with: {
          "input-folder": sourceReference,
          platform: hostPlatform,
          arch: hostArch,
          configuration: "{}",
          name: appName,
          appBundleId,
          appVersion,
          author: "Pipelab",
          description,
          icon,
        },
      });
      steps.push({
        id: "steam",
        uses: "steam:upload",
        needs: ["steam-bundle"],
        with: {
          username: "${{ variables.steamUsername }}",
          password: "${{ variables.steamPassword }}",
          appId: destination.appId,
          depotId: destination.depotId,
          description,
          folder: "${{ steps.steam-bundle.outputs.bundleDirectory }}",
        },
      });
    }
  }

  return {
    workflow: {
      version: 1,
      continueOnError: flow.continueOnError ?? true,
      steps,
    },
    variables,
  };
};

export interface WorkflowExecutionOptions {
  destinations?: string[];
  release?: { version: string; description: string; headless?: boolean };
  dryRun?: boolean;
  verbose?: boolean;
  signal?: AbortSignal;
  onEvent?: (event: Parameters<NonNullable<WorkflowRunContext["onEvent"]>>[0]) => void;
}

export const executeWorkflow = async (
  context: PipelabContext,
  name: string,
  options: WorkflowExecutionOptions = {},
  pluginsReady?: Promise<void>,
) => {
  const buildId = nanoid();
  const workspaceRoot = context.getArtifactsPath("workflow", buildId);
  await pluginsReady;
  const flow = await (await setupWorkflowConfigFileByName(name, context)).getConfig();
  const connections = await (await setupConnectionsConfigFile(context)).getConfig();
  const connectionById = new Map(
    connections.connections.map((connection: any) => [connection.id, connection]),
  );
  const definition = await createWorkflowDefinition(
    flow,
    connectionById,
    options.destinations,
    options.release,
  );
  if (options.dryRun) {
    return {
      result: {
        status: "dry-run" as const,
        steps: definition.workflow.steps.map((step) => step.id),
      },
      buildId,
    };
  }
  await mkdir(workspaceRoot, { recursive: true });
  const node = await ensureNodeJS(context);
  const pnpm = await ensurePNPM(context);
  const tasks = createPipelabWorkflowTasks({
    context,
    paths: {
      cache: context.getCachePath(CacheFolder.Pipelines, name, buildId),
      pnpm,
      node,
      userData: context.userDataPath,
      modules: context.getPackagesPath(),
      thirdparty: context.getThirdPartyPath(),
    },
  });
  const { logger } = useLogger();
  const hostLogger =
    options.verbose === false
      ? { info: () => undefined, warn: () => undefined, error: () => undefined }
      : logger();
  const host = createLocalHost(workspaceRoot, {
    logger: {
      info: (...args) => hostLogger.info(...args),
      warn: (...args) => hostLogger.warn(...args),
      error: (...args) => hostLogger.error(...args),
    },
  });
  const runContext: WorkflowRunContext = {
    host,
    variables: definition.variables,
    signal: options.signal,
    tasks,
    onEvent: options.onEvent,
  };
  const result = await runWorkflow(definition.workflow, runContext);
  return { result, buildId };
};

export const registerWorkflowHandlers = (context: PipelabContext, pluginsReady?: Promise<void>) => {
  const { handle } = useAPI();
  const { logger } = useLogger();
  let abortController: AbortController | undefined;

  handle("workflow:execute", async (_, { send, value }) => {
    const controller = new AbortController();
    abortController = controller;
    try {
      const execution = await executeWorkflow(
        context,
        value.name,
        {
          destinations: value.destinations,
          release: value.release,
          signal: controller.signal,
          onEvent: (event) => void send({ type: "workflow-event", data: event }),
        },
        pluginsReady,
      );
      await send({ type: "end", data: { type: "success", result: execution } });
    } catch (error) {
      const isCancelled =
        controller.signal.aborted || (error instanceof Error && error.name === "AbortError");
      logger().error("Workflow execution failed:", error);
      await send({
        type: "end",
        data: {
          type: "error",
          code: isCancelled ? "canceled" : "error",
          ipcError: error instanceof Error ? error.message : "Unknown error",
        },
      });
    } finally {
      if (abortController === controller) abortController = undefined;
    }
  });

  handle("workflow:cancel", async (_, { send }) => {
    abortController?.abort("Interrupted by user");
    await send({ type: "end", data: { type: "success", result: { result: "ok" } } });
  });
};

export { createWorkflowDefinition };
