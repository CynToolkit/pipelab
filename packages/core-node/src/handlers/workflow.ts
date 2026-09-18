import { compileWorkflow, createLocalHost, runWorkflow, type Workflow, type WorkflowEvent, type WorkflowResult } from "@pipelab/workflow-runtime";
import { nanoid } from "nanoid";
import { access, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import {
  useLogger,
  outputDescriptor,
  PACKAGER_DEFINITIONS,
  SERVICE_DEFINITIONS,
  type WorkflowArtifactOutputId,
  type WorkflowConfig,
  type WorkflowConfigV2,
} from "@pipelab/shared";
import { CacheFolder, PipelabContext } from "../context";
import { setupConnectionsConfigFile } from "../config";
import { ensureNodeJS, ensurePNPM } from "../utils/remote";
import { createPipelabWorkflowTasks } from "../workflow-tasks";
import { useAPI } from "../ipc-core";
import { getReleaseHostCapabilities, migrateWorkflowConfig, validateWorkflowConfigV2 } from "@pipelab/shared";
import type { BuildHistoryEntry, ExecutionStep, LogEntry } from "@pipelab/shared";
import { BuildHistoryStorage } from "./build-history";
import { WorkflowRunCancellationRegistry } from "./workflow-run-cancellation";

const workflowHistoryArtifacts = (artifacts: WorkflowResult["artifacts"]): NonNullable<BuildHistoryEntry["artifacts"]> =>
  artifacts.map((artifact, index) => "outputId" in artifact ? {
    id: artifact.id,
    name: artifact.outputId,
    path: artifact.path,
    size: artifact.size ?? 0,
    type: "file" as const,
    outputId: artifact.outputId,
    version: artifact.version,
    platform: artifact.platform,
    architecture: artifact.architecture,
    format: artifact.format,
    producerStep: artifact.producerStep,
    checksum: artifact.checksum,
  } : {
    id: `workflow-artifact-${index}`,
    name: artifact.name,
    path: artifact.path,
    size: 0,
    type: "file" as const,
  });

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
  artifacts: workflowHistoryArtifacts(result.artifacts),
  deliveries: result.deliveries,
  output: result.outputs,
});

export const createWorkflowExecutionPlan = (
  workflow: Workflow,
  config: WorkflowConfigV2,
  startTime: number,
): ExecutionStep[] => workflow.steps.map((step) => {
  const outputId = step.delivery?.artifactOutputId || String(step.with?.outputId || "");
  const output = outputId ? outputDescriptor(outputId as WorkflowArtifactOutputId) : undefined;
  const packager = config.packagers.find((item) => item.id === step.with?.packagerId);
  const destination = step.delivery
    ? config.destinations.find((item) => item.id === step.delivery?.destinationId)
    : undefined;
  const serviceId = step.delivery?.serviceId || destination?.serviceId;
  const destinationName = step.delivery?.destinationName || (serviceId ? SERVICE_DEFINITIONS[serviceId as keyof typeof SERVICE_DEFINITIONS]?.label : undefined);
  let name = step.id;

  if (step.uses === "construct:export") name = "Export Construct project";
  else if (step.uses === "construct:export-folder") name = "Prepare project folder";
  else if (step.uses === "source:extract") name = "Prepare project files";
  else if (step.delivery) name = `${destinationName || serviceId || "Delivery"} · ${output?.label || step.delivery.slotId}`;
  else if (output) {
    const packagerName = packager?.name || (packager ? PACKAGER_DEFINITIONS[packager.definitionId].label : undefined);
    name = packagerName ? `${packagerName} · ${output.label}` : output.label;
  } else if (step.uses) name = step.uses.split(":").map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" · ");

  return {
    id: step.id,
    name,
    uses: step.uses,
    status: "pending",
    startTime,
    logs: [] as LogEntry[],
    ...(step.delivery ? {
      destinationId: step.delivery.destinationId,
      serviceId,
      destinationName,
      slotId: step.delivery.slotId,
      outputId: step.delivery.artifactOutputId,
      producerStep: step.delivery.producerStep,
    } : outputId ? { outputId: outputId as ExecutionStep["outputId"] } : {}),
  };
});

const workflowHistoryLogs = (events: WorkflowEvent[]): LogEntry[] =>
  events.flatMap((event, index) => event.type === "step.log" ? [{
    id: `workflow-log-${event.timestamp}-${index}`,
    timestamp: event.timestamp,
    level: event.stream === "stderr" ? "error" : "info",
    message: event.message,
    source: event.stepId,
  }] : []);

export const applyWorkflowHistoryEvent = (
  event: WorkflowEvent,
  steps: Record<string, ExecutionStep>,
  logs: LogEntry[],
) => {
  const timestamp = event.timestamp;
  if (event.type === "step.started") {
    const current = steps[event.stepId];
    steps[event.stepId] = { ...current, id: event.stepId, name: current?.name || event.stepId, uses: event.uses, status: "running", startTime: timestamp, endTime: undefined, duration: undefined, logs: current?.logs || [] };
  } else if (event.type === "step.log") {
    const log: LogEntry = { id: `workflow-log-${timestamp}-${logs.length}`, timestamp, level: event.stream === "stderr" ? "error" : "info", message: event.message, source: event.stepId };
    logs.push(log);
    steps[event.stepId]?.logs.push(log);
  } else if (event.type === "step.completed") {
    const current = steps[event.stepId];
    steps[event.stepId] = { ...(current || { id: event.stepId, name: event.stepId, startTime: timestamp, logs: [] }), name: current?.name || event.stepId, uses: event.uses, status: "completed", endTime: timestamp, duration: event.duration, output: event.outputs };
  } else if (event.type === "step.failed") {
    const current = steps[event.stepId];
    steps[event.stepId] = { ...(current || { id: event.stepId, name: event.stepId, startTime: timestamp, logs: [] }), name: current?.name || event.stepId, uses: event.uses, status: event.error.name === "AbortError" ? "cancelled" : "failed", endTime: timestamp, duration: event.duration, error: { message: event.error.message, timestamp } };
  } else if (event.type === "step.skipped") {
    const current = steps[event.stepId];
    steps[event.stepId] = { ...(current || { id: event.stepId, name: event.stepId, startTime: timestamp, logs: [] }), name: current?.name || event.stepId, uses: event.uses, status: "skipped", endTime: timestamp };
  }
};

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
  onRunCreated?: (runId: string) => void | Promise<void>;
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
  const executionPlan = createWorkflowExecutionPlan(workflow, workflowConfig, startTime);
  const events: WorkflowEvent[] = [];
  await history.save({
    id: buildId,
    pipelineId,
    workflowId: workflowConfig.id,
    workflowName: workflowConfig.name,
    projectName: workflowConfig.name,
    projectPath: workflowConfig.source.path,
    status: "running",
    version,
    startTime,
    steps: executionPlan,
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
  await options.onRunCreated?.(buildId);
  const liveSteps = Object.fromEntries(executionPlan.map((step) => [step.id, step]));
  const liveLogs: LogEntry[] = [];
  const liveArtifacts: NonNullable<BuildHistoryEntry["artifacts"]> = [];
  const liveDeliveries: NonNullable<BuildHistoryEntry["deliveries"]> = [];
  let historyWrites = Promise.resolve();
  const persistEvent = (event: WorkflowEvent) => {
    events.push(event);
    applyWorkflowHistoryEvent(event, liveSteps, liveLogs);
    if (event.type === "step.completed") {
      const artifacts = workflowHistoryArtifacts(event.artifacts);
      for (const artifact of artifacts) {
        if (!liveArtifacts.some((existing) => existing.id === artifact.id)) liveArtifacts.push(artifact);
      }
    }
    if (event.type === "step.completed" || event.type === "step.failed" || event.type === "step.skipped") {
      const step = liveSteps[event.stepId];
      if (step?.destinationId && step.slotId) {
        const delivery: NonNullable<BuildHistoryEntry["deliveries"]>[number] = {
          id: event.stepId,
          destinationId: step.destinationId,
          serviceId: step.serviceId,
          destinationName: step.destinationName,
          slotId: step.slotId,
          producerStep: step.producerStep,
          artifactId: liveArtifacts.find((artifact) => artifact.outputId === step.outputId && artifact.producerStep === step.producerStep)?.id || "",
          status: event.type === "step.completed" ? "completed" : "failed",
          startedAt: step.startTime,
          completedAt: event.timestamp,
          duration: "duration" in event ? event.duration : 0,
          ...("error" in event ? { error: event.error.message } : {}),
        };
        const deliveryIndex = liveDeliveries.findIndex((item) => item.id === delivery.id);
        if (deliveryIndex < 0) liveDeliveries.push(delivery);
        else liveDeliveries[deliveryIndex] = delivery;
      }
    }
    const steps = Object.values(liveSteps).map((step) => ({ ...step, logs: [...step.logs] }));
    const logs = [...liveLogs];
    const artifacts = [...liveArtifacts];
    const deliveries = [...liveDeliveries];
    historyWrites = historyWrites.then(() => history.update(buildId, {
      steps,
      logs,
      artifacts,
      deliveries,
      completedSteps: steps.filter((step) => step.status === "completed").length,
      failedSteps: steps.filter((step) => step.status === "failed" || step.status === "skipped").length,
      cancelledSteps: steps.filter((step) => step.status === "cancelled").length,
    }, pipelineId));
    options.onEvent?.(event);
  };
  try {
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
    // The local host supplies filesystem and process execution for workflow tasks.
    const host = createLocalHost(workspaceRoot, {
      logger: {
        info: (...args) => logger().info(...args),
        warn: (...args) => logger().warn(...args),
        error: (...args) => logger().error(...args),
      },
    });
    const result = await runWorkflow(workflow, {
      host,
      variables: { version, sourcePath: workflowConfig.source.path },
      version,
      buildId,
      tasks,
      onEvent: (event) => {
        persistEvent(event);
      },
      signal: options.signal,
    });
    const update = workflowHistoryUpdateFromResult(result);
    await historyWrites.catch((): undefined => undefined);
    const logs = workflowHistoryLogs(events);
    const endTime = Date.now();
    const finalSteps = update.steps.map((step) => {
      const planStep = liveSteps[step.id];
      return { ...planStep, ...step, name: planStep?.name || step.name, logs: planStep?.logs || [] };
    });
    const deliveries = update.deliveries?.map((delivery) => {
      const planStep = liveSteps[delivery.id];
      return {
        ...delivery,
        destinationId: planStep?.destinationId || delivery.destinationId,
        serviceId: planStep?.serviceId || delivery.serviceId,
        destinationName: planStep?.destinationName || delivery.destinationName,
      };
    });
    await history.update(buildId, {
      ...update,
      deliveries,
      logs,
      endTime,
      duration: endTime - startTime,
      completedSteps: result.steps ? Object.values(result.steps).filter((step) => step.status === "completed").length : 0,
      failedSteps: Object.values(result.steps).filter((step) => step.status === "failed" || step.status === "skipped").length,
      steps: finalSteps.map((step) => ({ ...step, logs: logs.filter((log) => log.source === step.id) })),
    }, pipelineId);
    return { result, runId: buildId };
  } catch (error) {
    await historyWrites.catch((): undefined => undefined);
    const endTime = Date.now();
    const cancelled = error instanceof Error && error.name === "AbortError";
    const steps = Object.values(liveSteps).map((step) => step.status === "running" || step.status === "pending" ? {
      ...step,
      status: cancelled || step.status === "pending" ? "cancelled" as const : "failed" as const,
      endTime,
      duration: step.status === "pending" ? 0 : endTime - step.startTime,
    } : step);
    await history.update(buildId, {
      status: cancelled ? "cancelled" : "failed",
      endTime,
      duration: endTime - startTime,
      logs: workflowHistoryLogs(events),
      steps,
      artifacts: liveArtifacts,
      deliveries: liveDeliveries,
      failedSteps: steps.filter((step) => step.status === "failed" || step.status === "skipped").length,
      cancelledSteps: steps.filter((step) => step.status === "cancelled").length,
      error: {
        message: error instanceof Error ? error.message : String(error),
        ...(error instanceof Error && error.stack ? { stack: error.stack } : {}),
        timestamp: endTime,
      },
    }, pipelineId);
    throw error;
  }
};

export const registerWorkflowHandlers = (context: PipelabContext, pluginsReady?: Promise<void>) => {
  const { handle } = useAPI();
  const { logger } = useLogger();
  const activeRuns = new WorkflowRunCancellationRegistry();

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
    let runId: string | undefined;
    try {
      await pluginsReady;
      const { result, runId: workflowRunId } = await executeWorkflow(context, value.name, {
        release: value.release,
        signal: controller.signal,
        onRunCreated: (createdRunId) => {
          runId = createdRunId;
          activeRuns.register(createdRunId, controller);
          return send({ type: "workflow-run", data: { runId: createdRunId } });
        },
        onEvent: (event) => void send({ type: "workflow-event", data: event }),
      });

      await send({
        type: "end",
        data: {
          type: "success",
          result: { result, runId: workflowRunId },
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
      if (runId) activeRuns.remove(runId, controller);
    }
  });

  handle("workflow:cancel", async (_, { send, value }) => {
    const cancelled = activeRuns.cancel(value.runId);
    await send({
      type: "end",
      data: {
        type: "success",
        result: { result: cancelled ? "ok" : "ko" },
      },
    });
  });
};
