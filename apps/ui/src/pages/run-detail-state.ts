import { outputDescriptor, SERVICE_DEFINITIONS } from "@pipelab/shared";
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

export const artifactDisplayName = (
  artifact: NonNullable<BuildHistoryEntry["artifacts"]>[number],
) => "outputId" in artifact && artifact.outputId
  ? outputDescriptor(artifact.outputId)?.label || artifact.outputId
  : artifact.name;

export const artifactDisplayDescription = (
  artifact: NonNullable<BuildHistoryEntry["artifacts"]>[number],
  steps: ExecutionStep[],
) => "outputId" in artifact
  ? steps.find((step) => step.id === artifact.producerStep)?.name || "Generated artifact"
  : artifact.name;

const legacyServiceId = (destinationId: string) =>
  destinationId === "web" ? "web-folder" : destinationId;

export const deliveryDisplayMetadata = (
  delivery: NonNullable<BuildHistoryEntry["deliveries"]>[number],
) => {
  const serviceId = delivery.serviceId || legacyServiceId(delivery.destinationId);
  const definition = SERVICE_DEFINITIONS[serviceId as keyof typeof SERVICE_DEFINITIONS];
  return {
    id: delivery.destinationId,
    serviceId: definition?.id || serviceId,
    name: delivery.destinationName || definition?.label || delivery.destinationId,
  };
};
