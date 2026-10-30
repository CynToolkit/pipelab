import {
  createLocalHost,
  createRunScopedWorkflowValueResolver,
  runWorkflow,
  type WorkflowConnectionOverride,
  type WorkflowConnectionValues,
  type Workflow,
  type WorkflowEnvironment,
  type WorkflowEvent,
  type Logger as WorkflowLogger,
  type WorkflowResult,
} from "@pipelab/workflow-runtime";
import { nanoid } from "nanoid";
import { mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  buildReleaseCatalog,
  compileReleasePlan,
  planRelease,
  resolveReleaseDefaults,
  validateRelease,
  type BuildHistoryEntry,
  type ExecutionStep,
  type LogEntry,
  type ReleaseConfig,
  parseReleaseConfig,
  useLogger,
} from "@pipelab/shared";
import { CacheFolder, PipelabContext } from "../context";
import { ReleasePersistence } from "../release-persistence";
import { ensureNodeJS, ensurePNPM } from "../utils/remote";
import { createPipelabWorkflowTasks } from "../workflow-tasks";
import { workflowTaskFactories } from "../workflow-tasks/registry";
import { createWorkflowTaskRegistry, type ProviderServices } from "../workflow-tasks";
import { useAPI } from "../ipc-core";
import { BuildHistoryStorage } from "./build-history";
import { WorkflowRunCancellationRegistry } from "./workflow-run-cancellation";
import { getPipelabCloudDownloadUrl } from "../pipelab-cloud";
import { buildCoreReleaseRegistry } from "../release/registry";
import {
  getReleaseWorkflowValueRequirements,
} from "../release/workflow-value-requirements";
import { builtInProviders } from "../providers-registry";

const host = () => ({ platform: process.platform, architecture: process.arch });
const registry = () => buildCoreReleaseRegistry();
const catalog = () => buildReleaseCatalog(registry(), host());

const issuesFor = (config: ReleaseConfig) => validateRelease(config, registry(), { host: host() });

export const prepareReleaseWorkflow = (
  config: ReleaseConfig,
  version = "0.0.0",
  env: WorkflowEnvironment = process.env,
) => {
  const releaseRegistry = registry();
  const context = {
    host: host(),
    variables: { version },
    getEnvironmentVariableStatus: (name: string) => ({
      configured: Object.hasOwn(env, name),
      nonEmpty: Boolean(env[name]?.trim()),
    }),
  };
  const resolvedConfig = resolveReleaseDefaults(config, releaseRegistry, context);
  const plan = planRelease(resolvedConfig, releaseRegistry, context);
  const errors = plan.issues.filter((issue) => issue.severity === "error");
  if (errors.length) throw new Error(errors.map((issue) => issue.message).join("\n"));
  const valueRequirements = getReleaseWorkflowValueRequirements(
    resolvedConfig,
    plan,
    releaseRegistry,
    builtInProviders,
  );
  return {
    config: resolvedConfig,
    plan,
    registry: releaseRegistry,
    workflow: compileReleasePlan(resolvedConfig, plan, releaseRegistry, context),
    ...valueRequirements,
  };
};

const executionPlan = (workflow: Workflow) =>
  workflow.steps.map((step) => ({
    id: step.id,
    name: step.id,
    uses: step.uses,
    status: "pending" as const,
    startTime: 0,
    logs: [] as LogEntry[],
    ...(step.delivery
      ? { destinationId: step.delivery.destinationId, slotId: step.delivery.slotId }
      : {}),
  }));

export const applyWorkflowEventToHistory = (
  steps: ExecutionStep[],
  logs: LogEntry[],
  event: WorkflowEvent,
) => {
  const step =
    "stepId" in event ? steps.find((candidate) => candidate.id === event.stepId) : undefined;
  if (!step) return;

  switch (event.type) {
    case "step.started":
      step.status = "running";
      step.startTime = event.timestamp;
      return;
    case "step.log": {
      const log: LogEntry = {
        id: nanoid(),
        timestamp: event.timestamp,
        level: event.stream === "stderr" ? "error" : "info",
        message: event.message,
        source: event.stepId,
      };
      step.logs.push(log);
      logs.push(log);
      return;
    }
    case "step.completed":
      step.status = "completed";
      step.endTime = event.timestamp;
      step.duration = event.duration;
      step.output = event.outputs;
      return;
    case "step.failed":
      step.status = "failed";
      step.endTime = event.timestamp;
      step.duration = event.duration;
      step.error = {
        message: event.error.message,
        code: event.error.name,
        timestamp: event.timestamp,
      };
      return;
    case "step.skipped":
      step.status = "skipped";
      step.endTime = event.timestamp;
      step.duration = 0;
      return;
  }
};

const historyArtifacts = (result: WorkflowResult): NonNullable<BuildHistoryEntry["artifacts"]> =>
  result.artifacts.map((artifact, index) => {
    if (!("descriptor" in artifact))
      return {
        id: `workflow-artifact-${index}`,
        name: artifact.name,
        path: artifact.path,
        type: "file" as const,
      };
    return {
      id: artifact.id,
      name: artifact.artifact,
      path: artifact.path,
      ...(typeof artifact.size === "number" && artifact.size > 0 ? { size: artifact.size } : {}),
      type: "file" as const,
      descriptor: artifact.descriptor,
      version: artifact.version,
      stepId: artifact.stepId,
      artifact: artifact.artifact,
      checksum: artifact.checksum,
      cloud: artifact.cloud,
    };
  });

export const executeWorkflow = async (
  context: PipelabContext,
  configName: string,
  options: {
    release?: { version?: string; description?: string };
    workflowConfig?: ReleaseConfig;
    env?: WorkflowEnvironment;
    connectionValues?: WorkflowConnectionValues;
    connectionOverrides?: readonly WorkflowConnectionOverride[];
    persist?: boolean;
    signal?: AbortSignal;
    onEvent?: (event: WorkflowEvent) => void;
    onRunCreated?: (id: string) => void | Promise<void>;
    logger?: WorkflowLogger;
  } = {},
) => {
  const workflowId = configName.replace(/^workflows\//, "").replace(/\.json$/, "");
  let storedEntity: Awaited<ReturnType<ReleasePersistence["loadWithProject"]>> | undefined;
  let stored: ReleaseConfig;
  if (options.workflowConfig) {
    stored = parseReleaseConfig(options.workflowConfig);
  } else {
    storedEntity = await new ReleasePersistence(context).loadWithProject(workflowId);
    stored = storedEntity.config;
  }
  if (stored.id !== workflowId)
    throw new Error(`Workflow config ID '${stored.id}' does not match execution ID '${workflowId}'.`);
  const version = options.release?.version?.trim() || "0.0.0";
  const runEnvironment = Object.freeze({ ...(options.env ?? process.env) });
  const prepared = prepareReleaseWorkflow(stored, version, runEnvironment);
  const { config, workflow, connectionRequirements, requiredEnvironmentVariables } = prepared;
  const connectionValues: Record<string, Record<string, string>> = {};
  for (const [alias, values] of Object.entries(options.connectionValues ?? {}))
    connectionValues[alias] = values;
  const valueResolver = createRunScopedWorkflowValueResolver(
    workflow,
    { version },
    runEnvironment,
    {
      connectionValues,
      connectionOverrides: options.connectionOverrides,
      connectionRequirements,
      requiredEnvironmentVariables,
    },
  );
  const hasEnabledBeforeBuildHooks = config.builds.some((build) =>
    build.beforeBuild?.some((hook) => hook.enabled),
  );
  const { logger } = useLogger();
  const buildId = nanoid();
  const history = new BuildHistoryStorage(context);
  const persistHistory = options.persist !== false;
  const startTime = Date.now();
  const projectId = config.project;
  const liveSteps: ExecutionStep[] = executionPlan(workflow);
  const liveLogs: LogEntry[] = [];
  if (persistHistory) {
    await history.save({
      id: buildId,
      projectId,
      workflowId: config.id,
      workflowName: config.name,
      projectName: storedEntity?.project.name ?? stored.project,
      status: "running",
      version,
      startTime,
      steps: liveSteps,
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
  }
  let historyWriteTimer: ReturnType<typeof setTimeout> | undefined;
  let historyWriteTail: Promise<void> = Promise.resolve();
  const writeLiveHistory = () => {
    if (!persistHistory) return;
    const steps = liveSteps.map((step) => ({ ...step, logs: [...step.logs] }));
    const logs = [...liveLogs];
    historyWriteTail = historyWriteTail
      .then(async () => {
        await history.update(
          buildId,
          {
            steps,
            logs,
            completedSteps: steps.filter((step) => step.status === "completed").length,
            failedSteps: steps.filter(
              (step) => step.status === "failed" || step.status === "skipped",
            ).length,
            cancelledSteps: steps.filter((step) => step.status === "cancelled").length,
          },
          projectId,
        );
      })
      .catch((error) => {
        logger().error(`Failed to update workflow history for ${buildId}:`, error);
      });
  };
  const scheduleLiveHistory = () => {
    if (historyWriteTimer) return;
    historyWriteTimer = setTimeout(() => {
      historyWriteTimer = undefined;
      writeLiveHistory();
    }, 200);
  };
  const flushLiveHistory = async () => {
    if (historyWriteTimer) {
      clearTimeout(historyWriteTimer);
      historyWriteTimer = undefined;
      writeLiveHistory();
    }
    await historyWriteTail;
  };
  const observedSteps = new Map<
    string,
    "pending" | "running" | "completed" | "failed" | "cancelled" | "skipped"
  >(workflow.steps.map((step) => [step.id, "pending"]));
  const onEvent = (event: WorkflowEvent) => {
    if (event.type === "step.started") observedSteps.set(event.stepId, "running" as const);
    if (event.type === "step.completed") observedSteps.set(event.stepId, "completed" as const);
    if (event.type === "step.failed")
      observedSteps.set(
        event.stepId,
        options.signal?.aborted ? ("cancelled" as const) : ("failed" as const),
      );
    if (event.type === "step.skipped") observedSteps.set(event.stepId, "skipped" as const);
    applyWorkflowEventToHistory(liveSteps, liveLogs, event);
    if (persistHistory) scheduleLiveHistory();
    options.onEvent?.(event);
  };
  const temporaryRunRoot =
    options.persist === false
      ? await new PipelabContext({
          userDataPath: context.userDataPath,
          temporaryDirectory: tmpdir(),
        }).createTempFolder("pipelab-workflow-")
      : undefined;
  let result: WorkflowResult;
  try {
    await options.onRunCreated?.(buildId);
    const workspaceRoot = temporaryRunRoot
      ? join(temporaryRunRoot, "workspace")
      : context.getArtifactsPath("workflow", buildId);
    const buildStagingRoot = temporaryRunRoot
      ? join(temporaryRunRoot, "staging")
      : context.getArtifactsPath(config.project, "workflow-staging", buildId);
    await Promise.all([
      mkdir(workspaceRoot, { recursive: true }),
      ...(hasEnabledBeforeBuildHooks ? [mkdir(buildStagingRoot, { recursive: true })] : []),
    ]);
    const workflowContext = temporaryRunRoot
      ? new PipelabContext({
          userDataPath: context.userDataPath,
          releaseTag: context.releaseTag,
          temporaryDirectory: temporaryRunRoot,
        })
      : context;
    const node = await ensureNodeJS(workflowContext);
    const pnpm = await ensurePNPM(workflowContext);
    const services: ProviderServices = {
      context: workflowContext,
      executables: { node, pnpm },
      run: {
        id: buildId,
        workflowId: config.id,
        projectId: config.project,
        releaseVersion: version,
      },
      workflowCachePath: temporaryRunRoot
        ? join(temporaryRunRoot, "cache")
        : context.getCachePath(CacheFolder.Pipelines, config.project, buildId),
    };
    const tasks = createPipelabWorkflowTasks(
      services,
      createWorkflowTaskRegistry(workflowTaskFactories, services),
    );
    const workflowLogger = options.logger ?? {
      info: (...args: unknown[]) => logger().info(...args),
      warn: (...args: unknown[]) => logger().warn(...args),
      error: (...args: unknown[]) => logger().error(...args),
    };
    result = await runWorkflow(workflow, {
      host: createLocalHost(workspaceRoot, {
        logger: workflowLogger,
      }),
      variables: { version, workspace: workspaceRoot, buildStaging: buildStagingRoot },
      env: runEnvironment,
      connectionValues: valueResolver.connectionValues,
      connectionRequirements,
      requiredEnvironmentVariables,
      version,
      buildId,
      tasks,
      services,
      signal: options.signal,
      onEvent,
    });
  } catch (error) {
    if (historyWriteTimer) {
      clearTimeout(historyWriteTimer);
      historyWriteTimer = undefined;
    }
    await flushLiveHistory();
    const finalStatus = options.signal?.aborted ? ("cancelled" as const) : ("failed" as const);
    const steps = liveSteps.map((step) => ({
      ...step,
      status:
        observedSteps.get(step.id) === "completed"
          ? ("completed" as const)
          : observedSteps.get(step.id) === "skipped"
            ? ("skipped" as const)
            : observedSteps.get(step.id) === "cancelled" || finalStatus === "cancelled"
              ? ("cancelled" as const)
              : observedSteps.get(step.id) === "running" || observedSteps.get(step.id) === "failed"
                ? ("failed" as const)
                : step.status,
      ...(observedSteps.get(step.id) === "running" ||
      observedSteps.get(step.id) === "failed" ||
      finalStatus === "cancelled"
        ? { endTime: Date.now() }
        : {}),
    }));
    const errorMessage = valueResolver.redactString(
      error instanceof Error ? error.message : String(error),
    );
    if (persistHistory) {
      await history.update(
        buildId,
        {
          status: finalStatus,
          endTime: Date.now(),
          duration: Date.now() - startTime,
          steps,
          logs: [...liveLogs],
          completedSteps: steps.filter((step) => step.status === "completed").length,
          failedSteps: steps.filter((step) => step.status === "failed" || step.status === "skipped")
            .length,
          cancelledSteps: steps.filter((step) => step.status === "cancelled").length,
          error: {
            message: errorMessage,
            code: finalStatus === "cancelled" ? "CANCELLED" : "FAILED",
            timestamp: Date.now(),
          },
        },
        projectId,
      );
    }
    const safeError = new Error(errorMessage);
    if (error instanceof Error) safeError.name = valueResolver.redactString(error.name);
    throw safeError;
  } finally {
    if (historyWriteTimer) clearTimeout(historyWriteTimer);
    await historyWriteTail;
    if (temporaryRunRoot) await rm(temporaryRunRoot, { recursive: true, force: true });
  }
  await flushLiveHistory();
  const historyUpdate = valueResolver.redactObject({
    status: result.status,
    endTime: Date.now(),
    duration: Date.now() - startTime,
    artifacts: historyArtifacts(result),
    deliveries: result.deliveries,
    output: result.outputs,
    logs: [...liveLogs],
    steps: Object.values(result.steps).map((step) => ({
      id: step.id,
      name: step.id,
      uses: step.uses,
      status: step.status,
      startTime: step.startedAt,
      endTime: step.completedAt,
      duration: step.duration,
      logs: [...(liveSteps.find((candidate) => candidate.id === step.id)?.logs || [])],
      output: step.outputs,
      error: step.error
        ? { message: step.error.message, code: step.error.name, timestamp: step.completedAt }
        : undefined,
    })),
    completedSteps: Object.values(result.steps).filter((step) => step.status === "completed")
      .length,
    failedSteps: Object.values(result.steps).filter(
      (step) => step.status === "failed" || step.status === "skipped",
    ).length,
    cancelledSteps: 0,
  });
  if (persistHistory) {
    await history.update(buildId, historyUpdate, projectId);
  }
  return {
    result,
    safeResult: valueResolver.redactObject(result),
    runId: buildId,
  };
};

export const registerWorkflowHandlers = (context: PipelabContext) => {
  const { handle } = useAPI();
  const { logger } = useLogger();
  const activeRuns = new WorkflowRunCancellationRegistry();
  handle(
    "release:catalog:get",
    async (_, { send }) =>
      await send({ type: "end", data: { type: "success", result: catalog() } }),
  );
  handle("release:source:inspect", async (_, { send, value }) => {
    try {
      const source = registry().sources.find((candidate) => candidate.id === value.provider);
      if (!source) throw new Error(`Unknown source provider: ${value.provider}`);
      const result = source.inspect
        ? await source.inspect(value.config, { host: host() })
        : { issues: [] };
      await send({ type: "end", data: { type: "success", result } });
    } catch (error) {
      await send({
        type: "end",
        data: { type: "error", ipcError: error instanceof Error ? error.message : String(error) },
      });
    }
  });
  handle("release:producer:inspect", async (_, { send, value }) => {
    try {
      const producer = registry().producers.find((candidate) => candidate.id === value.provider);
      if (!producer) throw new Error(`Unknown producer provider: ${value.provider}`);
      const result = producer.inspect
        ? await producer.inspect(value.config, { host: host(), sourceConfig: value.sourceConfig })
        : { issues: [] };
      await send({ type: "end", data: { type: "success", result } });
    } catch (error) {
      await send({
        type: "end",
        data: { type: "error", ipcError: error instanceof Error ? error.message : String(error) },
      });
    }
  });
  handle(
    "release:validate",
    async (_, { send, value }) =>
      await send({
        type: "end",
        data: { type: "success", result: { issues: issuesFor(value.config) } },
      }),
  );
  handle(
    "release:plan",
    async (_, { send, value }) =>
      await send({
        type: "end",
        data: { type: "success", result: planRelease(value.config, registry(), { host: host() }) },
      }),
  );
  handle(
    "release:resolve-defaults",
    async (_, { send, value }) =>
      await send({
        type: "end",
        data: {
          type: "success",
          result: resolveReleaseDefaults(value.config, registry(), { host: host() }),
        },
      }),
  );
  handle("workflow:execute", async (_, { send, value }) => {
    const controller = new AbortController();
    let runId: string | undefined;
    try {
      const execution = await executeWorkflow(context, value.name, {
        release: value.release,
        env: value.env,
        connectionValues: value.connectionValues,
        connectionOverrides: value.connectionOverrides,
        signal: controller.signal,
        onRunCreated: (id) => {
          runId = id;
          activeRuns.register(id, controller);
          return send({ type: "workflow-run", data: { runId: id } });
        },
        onEvent: (event) => void send({ type: "workflow-event", data: event }),
      });
      await send({
        type: "end",
        data: {
          type: "success",
          result: { result: execution.safeResult, runId: execution.runId },
        },
      });
    } catch (error) {
      logger().error("Release workflow failed:", error);
      await send({
        type: "end",
        data: {
          type: "error",
          code: controller.signal.aborted ? "canceled" : "error",
          ipcError: error instanceof Error ? error.message : String(error),
        },
      });
    } finally {
      if (runId) activeRuns.remove(runId, controller);
    }
  });
  handle(
    "workflow:cancel",
    async (_, { send, value }) =>
      await send({
        type: "end",
        data: { type: "success", result: { result: activeRuns.cancel(value.runId) ? "ok" : "ko" } },
      }),
  );
  handle("pipelab-cloud:artifact-download-url", async (_, { send, value }) => {
    try {
      await send({
        type: "end",
        data: {
          type: "success",
          result: {
            url: await getPipelabCloudDownloadUrl(context, String(value.hostedArtifactId || "")),
          },
        },
      });
    } catch (error) {
      await send({
        type: "end",
        data: { type: "error", ipcError: error instanceof Error ? error.message : String(error) },
      });
    }
  });
};
