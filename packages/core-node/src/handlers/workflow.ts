import {
  createLocalHost,
  runWorkflow,
  type Workflow,
  type WorkflowEvent,
  type WorkflowResult,
} from "@pipelab/workflow-runtime";
import { nanoid } from "nanoid";
import { mkdir } from "node:fs/promises";
import {
  buildReleaseCatalog,
  buildReleaseRegistry,
  compileReleasePlan,
  planRelease,
  resolveReleaseDefaults,
  validateRelease,
  type BuildHistoryEntry,
  type ReleaseConfig,
  useLogger,
  usePlugins,
} from "@pipelab/shared";
import { CacheFolder, PipelabContext } from "../context";
import { setupWorkflowConfigFileByName } from "../config";
import { ensureNodeJS, ensurePNPM } from "../utils/remote";
import { createPipelabWorkflowTasks } from "../workflow-tasks";
import { useAPI } from "../ipc-core";
import { BuildHistoryStorage } from "./build-history";
import { WorkflowRunCancellationRegistry } from "./workflow-run-cancellation";
import { getPipelabCloudDownloadUrl } from "../pipelab-cloud";

const host = () => ({ platform: process.platform, architecture: process.arch });
const registry = () => buildReleaseRegistry(usePlugins().plugins.value);
const catalog = () => buildReleaseCatalog(registry(), host());

const issuesFor = (config: ReleaseConfig) => validateRelease(config, registry(), { host: host() });

export const prepareReleaseWorkflow = (config: ReleaseConfig, version = "0.0.0") => {
  const releaseRegistry = registry();
  const context = { host: host(), variables: { version } };
  const resolvedConfig = resolveReleaseDefaults(config, releaseRegistry, context);
  const plan = planRelease(resolvedConfig, releaseRegistry, context);
  const errors = plan.issues.filter((issue) => issue.severity === "error");
  if (errors.length) throw new Error(errors.map((issue) => issue.message).join("\n"));
  return {
    config: resolvedConfig,
    plan,
    registry: releaseRegistry,
    workflow: compileReleasePlan(resolvedConfig, plan, releaseRegistry, context),
  };
};

const executionPlan = (workflow: Workflow) =>
  workflow.steps.map((step) => ({
    id: step.id,
    name: step.id,
    uses: step.uses,
    status: "pending" as const,
    startTime: 0,
    logs: [],
    ...(step.delivery
      ? { destinationId: step.delivery.destinationId, slotId: step.delivery.slotId }
      : {}),
  }));

const historyArtifacts = (result: WorkflowResult): NonNullable<BuildHistoryEntry["artifacts"]> =>
  result.artifacts.map((artifact, index) => {
    if (!("descriptor" in artifact))
      return {
        id: `workflow-artifact-${index}`,
        name: artifact.name,
        path: artifact.path,
        size: 0,
        type: "file" as const,
      };
    return {
      id: artifact.id,
      name: artifact.artifact,
      path: artifact.path,
      size: artifact.size ?? 0,
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
    prepared?: ReturnType<typeof prepareReleaseWorkflow>;
    signal?: AbortSignal;
    onEvent?: (event: WorkflowEvent) => void;
    onRunCreated?: (id: string) => void | Promise<void>;
  } = {},
) => {
  const stored = await (await setupWorkflowConfigFileByName(configName, context)).getConfig();
  const version = options.release?.version?.trim() || "0.0.0";
  const prepared = options.prepared || prepareReleaseWorkflow(stored as ReleaseConfig, version);
  const { config, workflow } = prepared;
  const buildId = nanoid();
  const history = new BuildHistoryStorage(context);
  const startTime = Date.now();
  await history.save({
    id: buildId,
    pipelineId: config.project || config.id,
    workflowId: config.id,
    workflowName: config.name,
    projectName: config.name,
    projectPath: "",
    status: "running",
    version,
    startTime,
    steps: executionPlan(workflow),
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
  const workspaceRoot = context.getArtifactsPath("workflow", buildId);
  await mkdir(workspaceRoot, { recursive: true });
  const node = await ensureNodeJS(context);
  const pnpm = await ensurePNPM(context);
  const tasks = createPipelabWorkflowTasks({
    context,
    paths: {
      cache: context.getCachePath(CacheFolder.Pipelines, config.project || "workflow", buildId),
      pnpm,
      node,
      userData: context.userDataPath,
      modules: context.getPackagesPath(),
      thirdparty: context.getThirdPartyPath(),
    },
  });
  const { logger } = useLogger();
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
    options.onEvent?.(event);
  };
  let result: WorkflowResult;
  try {
    result = await runWorkflow(workflow, {
      host: createLocalHost(workspaceRoot, {
        logger: {
          info: (...args) => logger().info(...args),
          warn: (...args) => logger().warn(...args),
          error: (...args) => logger().error(...args),
        },
      }),
      variables: { version, workspace: workspaceRoot },
      version,
      buildId,
      tasks,
      signal: options.signal,
      onEvent,
    });
  } catch (error) {
    const finalStatus = options.signal?.aborted ? ("cancelled" as const) : ("failed" as const);
    const steps = executionPlan(workflow).map((step) => ({
      ...step,
      status:
        observedSteps.get(step.id) === "completed"
          ? ("completed" as const)
          : observedSteps.get(step.id) === "skipped"
            ? ("skipped" as const)
            : observedSteps.get(step.id) === "cancelled" || finalStatus === "cancelled"
              ? ("cancelled" as const)
              : ("failed" as const),
      endTime: Date.now(),
    }));
    await history.update(
      buildId,
      {
        status: finalStatus,
        endTime: Date.now(),
        duration: Date.now() - startTime,
        steps,
        completedSteps: steps.filter((step) => step.status === "completed").length,
        failedSteps: steps.filter((step) => step.status === "failed" || step.status === "skipped")
          .length,
        cancelledSteps: steps.filter((step) => step.status === "cancelled").length,
        error: {
          message: error instanceof Error ? error.message : String(error),
          code: finalStatus === "cancelled" ? "CANCELLED" : "FAILED",
          timestamp: Date.now(),
        },
      },
      config.project || config.id,
    );
    throw error;
  }
  await history.update(
    buildId,
    {
      status: result.status,
      endTime: Date.now(),
      duration: Date.now() - startTime,
      artifacts: historyArtifacts(result),
      deliveries: result.deliveries,
      output: result.outputs,
      steps: Object.values(result.steps).map((step) => ({
        id: step.id,
        name: step.id,
        uses: step.uses,
        status: step.status,
        startTime: step.startedAt,
        endTime: step.completedAt,
        duration: step.duration,
        logs: [],
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
    },
    config.project || config.id,
  );
  return { result, runId: buildId };
};

export const registerWorkflowHandlers = (context: PipelabContext, pluginsReady?: Promise<void>) => {
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
        ? await producer.inspect(value.config, { host: host() })
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
      await pluginsReady;
      const result = await executeWorkflow(context, value.name, {
        release: value.release,
        signal: controller.signal,
        onRunCreated: (id) => {
          runId = id;
          activeRuns.register(id, controller);
          return send({ type: "workflow-run", data: { runId: id } });
        },
        onEvent: (event) => void send({ type: "workflow-event", data: event }),
      });
      await send({ type: "end", data: { type: "success", result } });
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
