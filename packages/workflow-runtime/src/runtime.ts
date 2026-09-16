import {
  WORKFLOW_VERSION,
  type Workflow,
  type WorkflowArtifact,
  type WorkflowArtifactInstance,
  type WorkflowError,
  type WorkflowEventInput,
  type WorkflowResult,
  type WorkflowRunContext,
  type WorkflowStep,
  type WorkflowStepResult,
  type WorkflowTaskRegistry,
} from "./types";
import { RUN_COMMAND_TASK_ID, runCommandTask } from "./tasks/run-command";
import { ARTIFACT_OUTPUTS } from "./artifacts";

const builtInTasks: WorkflowTaskRegistry = {
  [RUN_COMMAND_TASK_ID]: runCommandTask,
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const toError = (value: unknown): Error =>
  value instanceof Error ? value : new Error(typeof value === "string" ? value : String(value));

const serializeError = (value: unknown): WorkflowError => {
  const error = toError(value);
  return { name: error.name || "Error", message: error.message };
};

const abortError = (reason: unknown): Error => {
  const error = new Error(
    reason instanceof Error ? reason.message : String(reason || "Workflow cancelled"),
  );
  error.name = "AbortError";
  return error;
};

const ensureNotAborted = (signal: AbortSignal): void => {
  if (signal.aborted) throw abortError(signal.reason);
};

const formatLogValue = (value: unknown): string => {
  if (value instanceof Error) return value.stack || value.message;
  if (typeof value === "string") return value;
  if (typeof value === "object" && value !== null) {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  return String(value);
};

const formatLog = (args: unknown[]): string => args.map(formatLogValue).join(" ");

const getPath = (value: Record<string, unknown>, path: string): unknown => {
  let current: unknown = value;
  for (const segment of path.split(".")) {
    if (!isRecord(current) || !(segment in current)) {
      throw new Error(`Workflow reference not found: ${path}`);
    }
    current = current[segment];
  }
  return current;
};

const resolveReference = (
  reference: string,
  variables: Record<string, unknown>,
  outputs: Record<string, Record<string, unknown>>,
): unknown => {
  if (reference.startsWith("variables.")) {
    return getPath(variables, reference.slice("variables.".length));
  }
  if (reference.startsWith("steps.")) {
    const match = /^steps\.([^.]+)\.outputs\.(.+)$/.exec(reference);
    if (!match) throw new Error(`Invalid workflow reference: ${reference}`);
    const stepOutputs = outputs[match[1]];
    if (!stepOutputs) throw new Error(`Workflow step output not found: ${match[1]}`);
    return getPath(stepOutputs, match[2]);
  }
  throw new Error(`Invalid workflow reference: ${reference}`);
};

const referencePattern = /\$\{\{\s*([^{}]+?)\s*\}\}/g;

const resolveValue = (
  value: unknown,
  variables: Record<string, unknown>,
  outputs: Record<string, Record<string, unknown>>,
): unknown => {
  if (Array.isArray(value)) return value.map((item) => resolveValue(item, variables, outputs));
  if (isRecord(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, resolveValue(item, variables, outputs)]),
    );
  }
  if (typeof value !== "string") return value;

  const exact = /^\$\{\{\s*([^{}]+?)\s*\}\}$/.exec(value);
  if (exact) return resolveReference(exact[1], variables, outputs);

  return value.replace(referencePattern, (_match, reference: string) =>
    formatLogValue(resolveReference(reference.trim(), variables, outputs)),
  );
};

const resolveInputs = (
  step: WorkflowStep,
  variables: Record<string, unknown>,
  outputs: Record<string, Record<string, unknown>>,
): Record<string, unknown> => {
  if (!step.with) return {};
  return resolveValue(step.with, variables, outputs) as Record<string, unknown>;
};

const validateWorkflow = (workflow: Workflow): void => {
  if (!isRecord(workflow) || workflow.version !== WORKFLOW_VERSION) {
    throw new Error(`Unsupported workflow version: ${String(workflow?.version)}`);
  }
  if (!Array.isArray(workflow.steps)) throw new Error("Workflow steps must be an array");

  const ids = new Set<string>();
  for (const step of workflow.steps) {
    if (!isRecord(step) || typeof step.id !== "string" || step.id.length === 0) {
      throw new Error("Every workflow step must have a non-empty id");
    }
    if (ids.has(step.id)) throw new Error(`Duplicate workflow step id: ${step.id}`);
    ids.add(step.id);
    if (typeof step.uses !== "string" || step.uses.length === 0) {
      throw new Error(`Workflow step ${step.id} must have a non-empty uses value`);
    }
    if (
      step.needs !== undefined &&
      (!Array.isArray(step.needs) ||
        step.needs.some((dependency) => typeof dependency !== "string"))
    ) {
      throw new Error(`Workflow step ${step.id} dependencies must be an array of step ids`);
    }
    if (step.needs?.includes(step.id)) {
      throw new Error(`Workflow step ${step.id} cannot depend on itself`);
    }
    if (step.with !== undefined && !isRecord(step.with)) {
      throw new Error(`Workflow step ${step.id} inputs must be an object`);
    }
  }

  for (const [index, step] of workflow.steps.entries()) {
    const dependencies = step.needs ?? (index > 0 ? [workflow.steps[index - 1].id] : []);
    for (const dependency of dependencies) {
      if (!ids.has(dependency)) {
        throw new Error(`Workflow step ${step.id} depends on unknown step: ${dependency}`);
      }
    }
  }
};

const dependenciesFor = (workflow: Workflow, step: WorkflowStep): string[] => {
  const index = workflow.steps.findIndex((candidate) => candidate.id === step.id);
  return step.needs ?? (index > 0 ? [workflow.steps[index - 1].id] : []);
};

const artifactForDelivery = (
  step: WorkflowStep,
  artifacts: Array<WorkflowArtifact | WorkflowArtifactInstance>,
): WorkflowArtifactInstance | undefined => {
  const outputId = step.with?.artifactOutput;
  if (typeof outputId !== "string") return undefined;
  return artifacts.find(
    (artifact): artifact is WorkflowArtifactInstance =>
      "outputId" in artifact && artifact.outputId === outputId,
  );
};

export const runWorkflow = async (
  workflow: Workflow,
  context: WorkflowRunContext,
): Promise<WorkflowResult> => {
  validateWorkflow(workflow);
  const signal = context.signal ?? new AbortController().signal;
  const tasks = { ...builtInTasks, ...context.tasks };
  const variables = context.variables ?? {};
  const outputs: Record<string, Record<string, unknown>> = {};
  const steps: Record<string, WorkflowStepResult> = {};
  const artifacts: Array<WorkflowArtifact | WorkflowArtifactInstance> = [];
  let artifactSequence = 0;
  const startedAt = Date.now();
  const emit = (event: WorkflowEventInput): void => {
    context.onEvent?.({ ...event, timestamp: Date.now() });
  };

  emit({ type: "workflow.started", workflow });

  try {
    const pending = new Set(workflow.steps.map((step) => step.id));
    const continueOnError = workflow.continueOnError ?? false;

    const runStep = async (step: WorkflowStep): Promise<void> => {
      const stepStartedAt = Date.now();
      const stepArtifacts: Array<WorkflowArtifact | WorkflowArtifactInstance> = [];
      emit({ type: "step.started", stepId: step.id, uses: step.uses });

      try {
        ensureNotAborted(signal);
        const task = tasks[step.uses];
        if (!task) throw new Error(`Workflow task not found: ${step.uses}`);
        const inputs = resolveInputs(step, variables, outputs);
        const result =
          (await task({
            step,
            inputs,
            workspace: context.host.workspace,
            filesystem: context.host.filesystem,
            processes: context.host.processes,
            logger: context.host.logger,
            signal,
            log: (...args) => {
              context.host.logger.info(...args);
              emit({
                type: "step.log",
                stepId: step.id,
                stream: "stdout",
                message: formatLog(args),
              });
            },
            logStream: (stream, ...args) => {
              context.host.logger.info(...args);
              emit({ type: "step.log", stepId: step.id, stream, message: formatLog(args) });
            },
            setArtifact: (outputId, path, metadata) => {
              if (!context.version) {
                stepArtifacts.push({ name: metadata?.name ?? outputId, path });
                return;
              }
              const definition = ARTIFACT_OUTPUTS[outputId as keyof typeof ARTIFACT_OUTPUTS];
              if (!definition) return;
              if (stepArtifacts.some((artifact) =>
                "outputId" in artifact && artifact.outputId === outputId && artifact.path === path,
              )) return;
              stepArtifacts.push(
                Object.freeze({
                  id: `artifact-${context.buildId ?? startedAt}-${artifactSequence++}`,
                  outputId: outputId as WorkflowArtifactInstance["outputId"],
                  version: context.version,
                  platform: definition?.platform ?? "unknown",
                  architecture: definition?.architecture ?? "unknown",
                  format: definition?.format ?? "unknown",
                  path,
                  producerStep: step.id,
                  checksum: metadata?.checksum,
                  size: metadata?.size,
                }) as WorkflowArtifactInstance,
              );
            },
          })) ?? {};
        ensureNotAborted(signal);
        if (!isRecord(result))
          throw new Error(`Workflow task ${step.uses} returned invalid outputs`);

        const completedAt = Date.now();
        const stepResult: WorkflowStepResult = {
          id: step.id,
          uses: step.uses,
          status: "completed",
          outputs: result,
          artifacts: [...stepArtifacts],
          startedAt: stepStartedAt,
          completedAt,
          duration: completedAt - stepStartedAt,
        };
        if (step.delivery) {
          stepResult.delivery = {
            id: step.id,
            destinationId: step.delivery.destinationId,
            slotId: step.delivery.slotId,
            artifactId: artifactForDelivery(step, artifacts)?.id ?? "",
            status: "completed",
            startedAt: stepStartedAt,
            completedAt,
            duration: completedAt - stepStartedAt,
          };
        }
        outputs[step.id] = result;
        steps[step.id] = stepResult;
        artifacts.push(...stepArtifacts);
        emit({
          type: "step.completed",
          stepId: step.id,
          uses: step.uses,
          outputs: result,
          artifacts: [...stepArtifacts],
          duration: stepResult.duration,
        });
      } catch (error) {
        const normalized = signal.aborted ? abortError(signal.reason) : toError(error);
        const completedAt = Date.now();
        const serialized = serializeError(normalized);
        const failedStep: WorkflowStepResult = {
          id: step.id,
          uses: step.uses,
          status: "failed",
          outputs: {},
          artifacts: [...stepArtifacts],
          startedAt: stepStartedAt,
          completedAt,
          duration: completedAt - stepStartedAt,
          error: serialized,
        };
        if (step.delivery) {
          failedStep.delivery = {
            id: step.id,
            destinationId: step.delivery.destinationId,
            slotId: step.delivery.slotId,
            artifactId: artifactForDelivery(step, artifacts)?.id ?? "",
            status: "failed",
            startedAt: stepStartedAt,
            completedAt,
            duration: completedAt - stepStartedAt,
            error: serialized.message,
          };
        }
        steps[step.id] = failedStep;
        emit({
          type: "step.failed",
          stepId: step.id,
          uses: step.uses,
          error: serialized,
          duration: completedAt - stepStartedAt,
        });
        throw normalized;
      }
    };

    while (pending.size > 0) {
      ensureNotAborted(signal);
      for (const step of workflow.steps) {
        if (!pending.has(step.id)) continue;
        const blockedBy = dependenciesFor(workflow, step).filter(
          (dependency) =>
            steps[dependency]?.status === "failed" || steps[dependency]?.status === "skipped",
        );
        if (!blockedBy.length) continue;
        const now = Date.now();
        const skippedStep: WorkflowStepResult = {
          id: step.id,
          uses: step.uses,
          status: "skipped",
          outputs: {},
          artifacts: [],
          startedAt: now,
          completedAt: now,
          duration: 0,
          blockedBy,
        };
        if (step.delivery) {
          skippedStep.delivery = {
            id: step.id,
            destinationId: step.delivery.destinationId,
            slotId: step.delivery.slotId,
            artifactId: artifactForDelivery(step, artifacts)?.id ?? "",
            status: "failed",
            startedAt: now,
            completedAt: now,
            duration: 0,
            error: `Skipped because ${blockedBy.join(", ")} failed`,
          };
        }
        steps[step.id] = skippedStep;
        pending.delete(step.id);
        emit({ type: "step.skipped", stepId: step.id, uses: step.uses, blockedBy });
      }
      if (pending.size === 0) break;
      const ready = workflow.steps.filter(
        (step) =>
          pending.has(step.id) &&
          dependenciesFor(workflow, step).every(
            (dependency) => steps[dependency]?.status === "completed",
          ),
      );

      if (ready.length === 0) {
        throw new Error("Workflow dependencies contain a cycle");
      }

      const results = await Promise.allSettled(ready.map((step) => runStep(step)));
      ready.forEach((step) => pending.delete(step.id));

      const failure = results.find(
        (result): result is PromiseRejectedResult => result.status === "rejected",
      );
      if (failure && !continueOnError) throw failure.reason;
    }

    const result: WorkflowResult = {
      status: Object.values(steps).some((step) => step.status !== "completed")
        ? "completed-with-errors"
        : "completed",
      version: context.version,
      outputs,
      artifacts,
      deliveries: workflow.steps
        .map((step) => steps[step.id]?.delivery)
        .filter((delivery): delivery is NonNullable<typeof delivery> => Boolean(delivery)),
      steps,
    };
    emit({ type: "workflow.completed", result, duration: Date.now() - startedAt });
    return result;
  } catch (error) {
    const normalized = signal.aborted ? abortError(signal.reason) : toError(error);
    emit({
      type: "workflow.failed",
      error: serializeError(normalized),
      duration: Date.now() - startedAt,
    });
    throw normalized;
  }
};
