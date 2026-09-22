import type { ReleaseConfig } from "@pipelab/shared";

export interface WorkflowIndexEntry {
  id: string;
  project: string;
  lastModified: string;
  configName: string;
}

export type WorkflowLoadResult =
  | { type: "success"; result: ReleaseConfig }
  | { type: "error"; ipcError: string };

export const partitionWorkflowLoads = (
  entries: WorkflowIndexEntry[],
  results: WorkflowLoadResult[],
) => {
  const loaded: Array<WorkflowIndexEntry & { content: ReleaseConfig }> = [];
  const broken: Array<{ id: string; error: string }> = [];
  entries.forEach((entry, index) => {
    const result = results[index];
    if (result?.type !== "success") {
      broken.push({ id: entry.id, error: result?.ipcError || "Unable to load workflow." });
      return;
    }
    if (result.result.id !== entry.id || result.result.project !== entry.project) {
      broken.push({
        id: entry.id,
        error: "Persisted workflow identity does not match its project index entry.",
      });
      return;
    }
    loaded.push({ ...entry, content: result.result });
  });
  return { loaded, broken };
};
