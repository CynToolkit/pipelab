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
  entry: Pick<BuildHistoryEntry, "projectId" | "workflowId">,
  flowId: string,
  projectId: string,
) => entry.projectId === projectId && entry.workflowId === flowId;

export const workflowCancellationFeedback = (result: {
  type: string;
  result?: { result?: string };
}) =>
  result.type === "success" && result.result?.result === "ko"
    ? "This run is no longer active."
    : "";

export interface RunFailureDiagnostic {
  id: string;
  title: string;
  category: string;
  summary: string;
  nextAction: string;
  stepId?: string;
  destination?: string;
  slotId?: string;
  rawMessage?: string;
  rawStack?: string;
  errorCode?: string;
}

export const runFailureArtifactSummary = (entry: BuildHistoryEntry) => {
  const count = entry.artifacts?.length ?? 0;
  return count === 0
    ? "No artifacts were recorded for this run."
    : `${count} artifact${count === 1 ? "" : "s"} available in the Artifacts tab.`;
};

const failureGuidance = (message: string) => {
  if (/auth|credential|unauthori[sz]ed|\b401\b|\b403\b|login|sign.?in/i.test(message)) {
    return {
      category: "Authentication",
      summary: "The destination rejected the configured account or session.",
      nextAction: "Sign in to the destination again, then rerun this workflow.",
    };
  }
  if (/\bEACCES\b|\bEPERM\b|permission denied|access is denied/i.test(message)) {
    return {
      category: "Permission",
      summary: "Pipelab could not access a required file or destination.",
      nextAction: "Check access to the reported path or destination, then rerun this workflow.",
    };
  }
  if (/\bENOSPC\b|no space left|disk full|not enough disk space/i.test(message)) {
    return {
      category: "Disk space",
      summary: "There is not enough free space to complete this step.",
      nextAction: "Free disk space at the reported location, then rerun this workflow.",
    };
  }
  if (
    /\bENOENT\b|not found|missing (?:file|tool|command)|could not find|does not exist/i.test(
      message,
    )
  ) {
    return {
      category: "Missing tool or file",
      summary: "A required command or file could not be found.",
      nextAction:
        "Install the required tool or correct its configured path, then rerun this workflow.",
    };
  }
  if (
    /\bECONN|\bENOTFOUND\b|\bETIMEDOUT\b|network|fetch failed|offline|connection refused/i.test(
      message,
    )
  ) {
    return {
      category: "Connection",
      summary: "Pipelab could not reach a required service.",
      nextAction:
        "Check the network connection and destination availability, then rerun this workflow.",
    };
  }
  return {
    category: "Step failed",
    summary: "This step reported an error while the workflow was running.",
    nextAction:
      "Review this step's logs and provider details to resolve the error before rerunning.",
  };
};

export const buildRunFailureDiagnostics = (entry: BuildHistoryEntry): RunFailureDiagnostic[] => {
  if (entry.status !== "failed" && entry.status !== "completed-with-errors") return [];

  const diagnostics: RunFailureDiagnostic[] = [];
  const failedSteps = entry.steps.filter((step) => step.status === "failed");
  for (const step of failedSteps) {
    const delivery = entry.deliveries?.find((candidate) => candidate.id === step.id);
    const rawMessage = step.error?.message || delivery?.error;
    if (!rawMessage) continue;
    const guidance = failureGuidance(rawMessage);
    const loginCommand = rawMessage.match(/pipelab login\s+\S+/i)?.[0];
    diagnostics.push({
      id: step.id,
      title: step.name || step.id,
      category: guidance.category,
      summary: guidance.summary,
      nextAction: loginCommand
        ? `Run ${loginCommand} and try this step again.`
        : guidance.nextAction,
      stepId: step.id,
      ...(delivery?.destinationName ||
      delivery?.destinationId ||
      step.destinationName ||
      step.destinationId
        ? {
            destination:
              delivery?.destinationName ||
              delivery?.destinationId ||
              step.destinationName ||
              step.destinationId,
          }
        : {}),
      ...(delivery?.slotId || step.slotId ? { slotId: delivery?.slotId || step.slotId } : {}),
      rawMessage,
      ...(step.error?.stack ? { rawStack: step.error.stack } : {}),
      ...(step.error?.code ? { errorCode: step.error.code } : {}),
    });
  }

  if (entry.error && !failedSteps.some((step) => step.error?.message === entry.error?.message)) {
    const guidance = failureGuidance(entry.error.message);
    diagnostics.unshift({
      id: "run-setup",
      title: "Run setup",
      category: guidance.category,
      summary: guidance.summary,
      nextAction: guidance.nextAction,
      rawMessage: entry.error.message,
      ...(entry.error.stack ? { rawStack: entry.error.stack } : {}),
      ...(entry.error.code ? { errorCode: entry.error.code } : {}),
    });
  }

  return diagnostics;
};

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
