import type { BuildHistoryEntry, ExecutionStep, Events } from "@pipelab/shared";
import { nanoid } from "nanoid";

type WorkflowEvent = Extract<Events<"workflow:execute">, { type: "workflow-event" }>["data"];

const workflowArtifacts = (
  artifacts: Extract<WorkflowEvent, { type: "workflow.completed" }>["result"]["artifacts"],
): NonNullable<BuildHistoryEntry["artifacts"]> =>
  artifacts.map((artifact, index) => {
    if (!("descriptor" in artifact)) {
      return {
        id: `workflow-artifact-${index}`,
        name: artifact.name,
        path: artifact.path,
        size: 0,
        type: "file" as const,
      };
    }
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

export interface RunStepSelectionState {
  selectedStepId: string | null;
  initialSelectionMade: boolean;
  userSelectedStep: boolean;
}

export const createRunStepSelectionState = (): RunStepSelectionState => ({
  selectedStepId: null,
  initialSelectionMade: false,
  userSelectedStep: false,
});

export const resetRunStepSelectionState = (state: RunStepSelectionState) => {
  state.selectedStepId = null;
  state.initialSelectionMade = false;
  state.userSelectedStep = false;
};

export const autoSelectInitialRunStep = (state: RunStepSelectionState, steps: ExecutionStep[]) => {
  if (state.userSelectedStep || state.initialSelectionMade || !steps.length) return;
  state.selectedStepId = steps.find((step) => step.status === "running")?.id || steps[0].id;
  state.initialSelectionMade = true;
};

export const selectRunStep = (state: RunStepSelectionState, stepId: string | null) => {
  state.selectedStepId = stepId;
  state.userSelectedStep = true;
};

export const isRunContextValid = (
  entry: Pick<BuildHistoryEntry, "pipelineId" | "workflowId">,
  flowId: string,
  projectId: string,
) => entry.pipelineId === projectId && entry.workflowId === flowId;

export const workflowCancellationFeedback = (result: {
  type: string;
  result?: { result?: string };
}) =>
  result.type === "success" && result.result?.result === "ko"
    ? "This run is no longer active."
    : "";

export const applyWorkflowEventToRunEntry = (entry: BuildHistoryEntry, event: WorkflowEvent) => {
  if (event.type === "workflow.completed") {
    const previousSteps = new Map(entry.steps.map((step) => [step.id, step]));
    entry.steps = Object.values(event.result.steps).map((resultStep) => {
      const previous = previousSteps.get(resultStep.id);
      return {
        id: resultStep.id,
        name: previous?.name || resultStep.id,
        uses: resultStep.uses,
        status: resultStep.status,
        startTime: resultStep.startedAt,
        endTime: resultStep.completedAt,
        duration: resultStep.duration,
        logs: previous?.logs || [],
        output: resultStep.outputs,
        ...(resultStep.error
          ? {
              error: {
                message: resultStep.error.message,
                code: resultStep.error.name,
                timestamp: resultStep.completedAt,
              },
            }
          : {}),
        ...(resultStep.delivery
          ? {
              destinationId: resultStep.delivery.destinationId,
              slotId: resultStep.delivery.slotId,
            }
          : {}),
      };
    });
    entry.status = event.result.status;
    entry.endTime = event.timestamp;
    entry.duration = event.duration;
    entry.output = event.result.outputs;
    entry.artifacts = workflowArtifacts(event.result.artifacts);
    entry.deliveries = event.result.deliveries;
    entry.totalSteps = entry.steps.length;
    entry.completedSteps = entry.steps.filter((step) => step.status === "completed").length;
    entry.failedSteps = entry.steps.filter(
      (step) => step.status === "failed" || step.status === "skipped",
    ).length;
    entry.cancelledSteps = entry.steps.filter((step) => step.status === "cancelled").length;
    entry.updatedAt = event.timestamp;
    return;
  }
  if (event.type === "workflow.failed") {
    entry.status = "failed";
    entry.endTime = event.timestamp;
    entry.duration = event.duration;
    entry.error = {
      message: event.error.message,
      code: event.error.name,
      timestamp: event.timestamp,
    };
    entry.completedSteps = entry.steps.filter((step) => step.status === "completed").length;
    entry.failedSteps = entry.steps.filter(
      (step) => step.status === "failed" || step.status === "skipped",
    ).length;
    entry.cancelledSteps = entry.steps.filter((step) => step.status === "cancelled").length;
    entry.updatedAt = event.timestamp;
    return;
  }
  const step =
    "stepId" in event ? entry.steps.find((candidate) => candidate.id === event.stepId) : undefined;
  if (!step) return;

  switch (event.type) {
    case "step.started":
      step.status = "running";
      step.startTime = event.timestamp;
      return;
    case "step.log": {
      if (
        step.logs.some((log) => log.timestamp === event.timestamp && log.message === event.message)
      )
        return;
      const log = {
        id: nanoid(),
        timestamp: event.timestamp,
        level: event.stream === "stderr" ? ("error" as const) : ("info" as const),
        message: event.message,
        source: event.stepId,
      };
      step.logs.push(log);
      entry.logs.push(log);
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

export const artifactDisplayName = (
  artifact: NonNullable<BuildHistoryEntry["artifacts"]>[number],
) =>
  "descriptor" in artifact && artifact.descriptor
    ? `${artifact.descriptor.platform || artifact.descriptor.kind}${artifact.descriptor.format ? ` · ${artifact.descriptor.format}` : ""}`
    : artifact.name;

export const artifactDisplayDescription = (
  artifact: NonNullable<BuildHistoryEntry["artifacts"]>[number],
  steps: ExecutionStep[],
) =>
  "stepId" in artifact
    ? steps.find((step) => step.id === artifact.stepId)?.name || "Generated artifact"
    : artifact.name;

export const deliveryDisplayMetadata = (
  delivery: NonNullable<BuildHistoryEntry["deliveries"]>[number],
) => {
  return {
    id: delivery.destinationId,
    serviceId: delivery.destinationId,
    name: delivery.destinationName || delivery.destinationId,
  };
};
