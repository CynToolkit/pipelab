import type { BuildHistoryEntry } from "@pipelab/shared";

export const scheduleWorkflowRunsRefresh = (entries: BuildHistoryEntry[], refresh: () => void) =>
  entries.some((entry) => entry.status === "running") ? setTimeout(refresh, 1000) : undefined;

export const isWorkflowRouteContextValid = (
  workflow: { id?: string; project?: string },
  flowId: string,
  projectId: string,
) => workflow.id === flowId && workflow.project === projectId;

type LoadResult<T> = { type: "success"; result: T } | { type: "error"; ipcError: string };

export const resolveWorkflowRunsState = (
  history: LoadResult<{ entries: BuildHistoryEntry[] }>,
  workflow: LoadResult<{ id: string; project: string; name?: string }>,
  flowId: string,
  projectId: string,
) => {
  const historyError = history.type === "error" ? history.ipcError : "";
  let workflowError = workflow.type === "error" ? workflow.ipcError : "";
  let workflowName = "Workflow";
  let entries: BuildHistoryEntry[] = [];

  if (workflow.type === "success") {
    if (!isWorkflowRouteContextValid(workflow.result, flowId, projectId)) {
      workflowError = "The loaded workflow does not match this route.";
    } else {
      workflowName = workflow.result.name || workflowName;
    }
  }

  if (!historyError && !workflowError && history.type === "success") {
    entries = history.result.entries
      .filter((entry) => entry.workflowId === flowId && entry.pipelineId === projectId)
      .sort((a, b) => b.startTime - a.startTime);
  }

  return { entries, historyError, workflowError, workflowName };
};
