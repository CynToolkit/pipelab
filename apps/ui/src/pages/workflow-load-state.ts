import type { ReleaseConfig } from "@pipelab/shared";

export interface WorkflowIndexEntry {
  id: string;
  project: string;
  lastModified: string;
  configName?: string;
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

export type WorkflowLoadState = ReturnType<typeof partitionWorkflowLoads>;

export const loadWorkflowEntries = async (
  entries: WorkflowIndexEntry[],
  load: (entry: WorkflowIndexEntry) => Promise<WorkflowLoadResult>,
  isCurrent: () => boolean = () => true,
): Promise<WorkflowLoadState | undefined> => {
  const results = await Promise.all(
    entries.map(async (entry): Promise<WorkflowLoadResult> => {
      try {
        return await load(entry);
      } catch (error) {
        return {
          type: "error",
          ipcError: error instanceof Error ? error.message : String(error),
        };
      }
    }),
  );
  if (!isCurrent()) return undefined;
  return partitionWorkflowLoads(entries, results);
};

export const mergeWorkflowLoadState = (
  current: WorkflowLoadState,
  update: WorkflowLoadState,
): WorkflowLoadState => {
  const updatedIds = new Set([...update.loaded, ...update.broken].map((workflow) => workflow.id));
  const currentLoadedIds = new Set(current.loaded.map((workflow) => workflow.id));
  const updatedLoadedIds = new Set(update.loaded.map((workflow) => workflow.id));
  return {
    loaded: [
      ...current.loaded.filter((workflow) => !updatedLoadedIds.has(workflow.id)),
      ...update.loaded,
    ],
    broken: [
      ...current.broken.filter(
        (workflow) => !currentLoadedIds.has(workflow.id) && !updatedIds.has(workflow.id),
      ),
      ...update.broken.filter((workflow) => !currentLoadedIds.has(workflow.id)),
    ],
  };
};
