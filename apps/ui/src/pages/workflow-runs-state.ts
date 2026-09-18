import type { BuildHistoryEntry } from "@pipelab/shared";

export const scheduleWorkflowRunsRefresh = (
  entries: BuildHistoryEntry[],
  refresh: () => void,
) => entries.some((entry) => entry.status === "running")
  ? setTimeout(refresh, 1000)
  : undefined;

export const isWorkflowRouteContextValid = (
  workflow: { id?: string; project?: string },
  flowId: string,
  projectId: string,
) => workflow.id === flowId && workflow.project === projectId;
