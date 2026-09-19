import type { BuildHistoryEntry, ExecutionStep } from "@pipelab/shared";

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

export const workflowCancellationFeedback = (result: { type: string; result?: { result?: string } }) =>
  result.type === "success" && result.result?.result === "ko"
    ? "This run is no longer active."
    : "";

export const artifactDisplayName = (
  artifact: NonNullable<BuildHistoryEntry["artifacts"]>[number],
) => "descriptor" in artifact && artifact.descriptor ? `${artifact.descriptor.platform || artifact.descriptor.kind}${artifact.descriptor.format ? ` · ${artifact.descriptor.format}` : ""}` : artifact.name;

export const artifactDisplayDescription = (
  artifact: NonNullable<BuildHistoryEntry["artifacts"]>[number],
  steps: ExecutionStep[],
) => "stepId" in artifact ? steps.find((step) => step.id === artifact.stepId)?.name || "Generated artifact" : artifact.name;

export const deliveryDisplayMetadata = (
  delivery: NonNullable<BuildHistoryEntry["deliveries"]>[number],
) => {
  return {
    id: delivery.destinationId,
    serviceId: delivery.destinationId,
    name: delivery.destinationName || delivery.destinationId,
  };
};
