import { compileWorkflow, createLocalHost, runWorkflow, type Workflow, type WorkflowEvent, type WorkflowResult } from "@pipelab/workflow-runtime";
import { nanoid } from "nanoid";
import { access, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { useLogger, type WorkflowConfig } from "@pipelab/shared";
import { CacheFolder, PipelabContext } from "../context";
import { setupConnectionsConfigFile } from "../config";
import { ensureNodeJS, ensurePNPM } from "../utils/remote";
import { createPipelabWorkflowTasks } from "../workflow-tasks";
import { useAPI } from "../ipc-core";
import { getReleaseHostCapabilities, migrateWorkflowConfig, validateWorkflowConfigV2 } from "@pipelab/shared";
import type { BuildHistoryEntry, ExecutionStep, LogEntry } from "@pipelab/shared";
import { BuildHistoryStorage } from "./build-history";

export const workflowHistoryUpdateFromResult = (
  result: WorkflowResult,
): Pick<BuildHistoryEntry, "status" | "version" | "steps" | "artifacts" | "deliveries" | "output"> => ({
  status: result.status,
  version: result.version,
  steps: Object.values(result.steps).map((step): ExecutionStep => ({
    id: step.id,
    name: step.id,
    status: step.status,
    startTime: step.startedAt,
    endTime: step.completedAt,
    duration: step.duration,
    logs: [],
    output: step.outputs,
    ...(step.error ? {
      error: {
        message: step.error.message,
        timestamp: step.completedAt,
      },
    } : {}),
  })),
  artifacts: result.artifacts.filter((artifact) => "outputId" in artifact),
  deliveries: result.deliveries,
  output: result.outputs,
});

const workflowHistoryLogs = (events: WorkflowEvent[]): LogEntry[] =>
  events.flatMap((event, index) => event.type === "step.log" ? [{
    id: `workflow-log-${event.timestamp}-${index}`,
    timestamp: event.timestamp,
    level: event.stream === "stderr" ? "error" : "info",
    message: event.message,
    source: event.stepId,
  }] : []);

const itchUsernameFor = async (apiKey: string) => {
  const response = await fetch("https://api.itch.io/profile", { headers: { Authorization: `Bearer ${apiKey}` } });
  if (!response.ok) throw new Error(`Unable to resolve Itch.io username (${response.status})`);
  const profile = (await response.json()) as { user?: { username?: string } };
  return profile.user?.username || "";
};

const sourceIcon = async (flow: WorkflowConfig) => {
  const root = flow.source.type === "folder" ? flow.source.path : dirname(flow.source.path);
  for (const name of ["icon.png", "icon.ico", "icon.icns"]) {
    try { await access(join(root, name)); return join(root, name); } catch { /* optional */ }
  }
  return "";
};

/** Compatibility builder retained for legacy callers; new execution uses the v2 compiler below. */
export const createWorkflowDefinition = async (
  flow: WorkflowConfig,
  connections: Map<string, any>,
  selectedTypes?: string[],
  release?: { version: string; description: string; headless?: boolean },
): Promise<{ workflow: Workflow; variables: Record<string, unknown> }> => {
  if (!flow.source.path) throw new Error("Choose a source before running the workflow");
  const active = flow.destinations.filter((destination: any) => destination.enabled !== false && (!selectedTypes || selectedTypes.includes(destination.type))) as any[];
  const variables: Record<string, unknown> = { sourcePath: flow.source.path };
  const steps: Workflow["steps"] = [];
  const needs: string[] = [];
  const source = flow.source;
  if (source.type === "construct3") {
    if (!source.profilePath) throw new Error("Choose a browser profile before running the workflow");
    variables.profilePath = source.profilePath;
    steps.push({ id: "source-export", uses: "construct:export", with: { file: "${{ variables.sourcePath }}", customProfile: "${{ variables.profilePath }}", version: source.version || "", headless: release?.headless ?? false } });
    steps.push({ id: "source-extract", uses: "source:extract", needs: ["source-export"], with: { file: "${{ steps.source-export.outputs.zipFile }}" } });
    needs.push("source-extract");
  }
  for (const destination of active) {
    if (destination.type === "web") steps.push({ id: "web", uses: "filesystem:copy", needs, with: { from: "${{ variables.sourcePath }}", to: destination.outputDir, recursive: true, overwrite: destination.overwrite ?? false, cleanup: destination.cleanup ?? false } });
    if (destination.type === "itch") {
      const apiKey = connections.get(destination.accountConnectionId)?.apiKey;
      if (!apiKey) throw new Error("No Itch.io API key connection found");
      variables.itchApiKey = apiKey;
      steps.push({ id: "itch", uses: "itch:upload", needs, with: { "input-folder": "${{ variables.sourcePath }}", user: await itchUsernameFor(apiKey), project: destination.project, channel: destination.channel, "api-key": "${{ variables.itchApiKey }}" } });
    }
    if (destination.type === "steam") {
      const account = connections.get(destination.accountConnectionId);
      if (!account?.username && !account?.email) throw new Error("Select a Steam account connection before running the workflow");
      variables.steamUsername = account.username || account.email; variables.steamPassword = account.password || "";
      const description = release?.description || destination.description || flow.description || flow.name;
      const appBundleId = `com.pipelab.${flow.name.toLowerCase().replace(/[^a-z0-9]+/g, ".").replace(/^\.|\.$/g, "") || "game"}`;
      steps.push({ id: "steam-bundle", uses: "electron:bundle", needs, with: { "input-folder": "${{ variables.sourcePath }}", platform: process.platform, arch: process.arch, name: flow.name, appBundleId, appVersion: release?.version || "1.0.0", description, icon: await sourceIcon(flow) } });
      steps.push({ id: "steam", uses: "steam:upload", needs: ["steam-bundle"], with: { username: "${{ variables.steamUsername }}", password: "${{ variables.steamPassword }}", appId: destination.appId, depotId: destination.depotId, description } });
    }
  }
  return { workflow: { version: 1, continueOnError: flow.continueOnError ?? true, steps }, variables };
};

export type ExecuteWorkflowOptions = {
  release?: { version?: string; description?: string; headless?: boolean };
  verbose?: boolean;
  dryRun?: boolean;
  onEvent?: (event: any) => void;
  signal?: AbortSignal;
};

export const executeWorkflow = async (
  context: PipelabContext,
  configName: string,
  options: ExecuteWorkflowOptions = {},
) => {
  const config = await (await import("../config")).setupWorkflowConfigFileByName(configName, context);
  const workflowConfig = migrateWorkflowConfig(await config.getConfig());
  const capabilities = getReleaseHostCapabilities({ platform: process.platform as "win32" | "linux" | "darwin", architecture: process.arch });
  const validationErrors = validateWorkflowConfigV2(workflowConfig, capabilities);
  if (validationErrors.length) throw new Error(validationErrors.join("\n"));
  const connectionsConfig = await (await setupConnectionsConfigFile(context)).getConfig();
  const connections = new Map(connectionsConfig.connections.map((connection: any) => [connection.id, connection]));
  const runtimeWorkflowConfig = {
    ...workflowConfig,
    destinations: await Promise.all(workflowConfig.destinations.map(async (destination) => {
      const account = connections.get(destination.config.accountConnectionId as string) as any;
      if (destination.serviceId === "steam") return { ...destination, config: { ...destination.config, username: account?.username || account?.email || "", password: account?.password || "" } };
      if (destination.serviceId === "itch") {
        const apiKey = account?.apiKey || "";
        return { ...destination, config: { ...destination.config, "api-key": apiKey, user: apiKey ? await itchUsernameFor(apiKey) : "" } };
      }
      return destination;
    })),
  };
  const workflow = compileWorkflow(runtimeWorkflowConfig);
  const buildId = nanoid();
  const version = options.release?.version?.trim() || "0.0.0";
  const pipelineId = workflowConfig.project || workflowConfig.id || "workflow";
  const startTime = Date.now();
  const history = new BuildHistoryStorage(context);
  const events: WorkflowEvent[] = [];
  await history.save({
    id: buildId,
    pipelineId,
    projectName: workflowConfig.name,
    projectPath: workflowConfig.source.path,
    status: "running",
    version,
    startTime,
    steps: [],
    totalSteps: workflow.steps.length,
    completedSteps: 0,
    failedSteps: 0,
    cancelledSteps: 0,
    logs: [],
    artifacts: [],
    deliveries: [],
    createdAt: startTime,
    updatedAt: startTime,
  });
  const workspaceRoot = context.getArtifactsPath("workflow", buildId);
  await mkdir(workspaceRoot, { recursive: true });
  const node = await ensureNodeJS(context);
  const pnpm = await ensurePNPM(context);
  const tasks = createPipelabWorkflowTasks({
    context,
    paths: {
      cache: context.getCachePath(CacheFolder.Pipelines, workflowConfig.project ?? "workflow", buildId),
      pnpm,
      node,
      userData: context.userDataPath,
      modules: context.getPackagesPath(),
      thirdparty: context.getThirdPartyPath(),
    },
  });
  const { logger } = useLogger();
  const host = createLocalHost(workspaceRoot, {
    logger: {
      info: (...args) => logger().info(...args),
      warn: (...args) => logger().warn(...args),
      error: (...args) => logger().error(...args),
    },
  });
  try {
    const result = await runWorkflow(workflow, {
      host,
      variables: { version, sourcePath: workflowConfig.source.path },
      version,
      buildId,
      tasks,
      onEvent: (event) => {
        events.push(event);
        options.onEvent?.(event);
      },
      signal: options.signal,
    });
    const update = workflowHistoryUpdateFromResult(result);
    const logs = workflowHistoryLogs(events);
    const endTime = Date.now();
    await history.update(buildId, {
      ...update,
      logs,
      endTime,
      duration: endTime - startTime,
      completedSteps: result.steps ? Object.values(result.steps).filter((step) => step.status === "completed").length : 0,
      failedSteps: Object.values(result.steps).filter((step) => step.status === "failed" || step.status === "skipped").length,
      steps: update.steps.map((step) => ({ ...step, logs: logs.filter((log) => log.source === step.id) })),
    }, pipelineId);
    return { result, buildId };
  } catch (error) {
    const endTime = Date.now();
    await history.update(buildId, {
      status: error instanceof Error && error.name === "AbortError" ? "cancelled" : "failed",
      endTime,
      duration: endTime - startTime,
      logs: workflowHistoryLogs(events),
      error: {
        message: error instanceof Error ? error.message : String(error),
        timestamp: endTime,
      },
    }, pipelineId);
    throw error;
  }
};

export const registerWorkflowHandlers = (context: PipelabContext, pluginsReady?: Promise<void>) => {
  const { handle } = useAPI();
  const { logger } = useLogger();
  let abortController: AbortController | undefined;

  handle("workflow:capabilities:get", async (_, { send }) => {
    await send({
      type: "end",
      data: {
        type: "success",
        result: getReleaseHostCapabilities({ platform: process.platform as "win32" | "linux" | "darwin", architecture: process.arch }),
      },
    });
  });

  handle("workflow:execute", async (_, { send, value }) => {
    const controller = new AbortController();
    abortController = controller;
    try {
      await pluginsReady;
      const { result, buildId } = await executeWorkflow(context, value.name, {
        release: value.release,
        signal: controller.signal,
        onEvent: (event) => void send({ type: "workflow-event", data: event }),
      });

      await send({
        type: "end",
        data: {
          type: "success",
          result: { result, buildId },
        },
      });
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
    await send({
      type: "end",
      data: {
        type: "success",
        result: { result: "ok" },
      },
    });
  });
};
