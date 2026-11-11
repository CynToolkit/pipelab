import {
  planRetention,
  type BuildHistoryEntry,
  type ReleaseRetentionPolicy,
} from "@pipelab/shared";

export interface RetentionPreviewRow {
  entry: BuildHistoryEntry;
  /** What the policy does to this run. `protected` runs would have been hit but are kept. */
  action: "delete-run" | "delete-files" | "protected";
  bytes: number;
}

export interface RetentionPreview {
  rows: RetentionPreviewRow[];
  runCount: number;
  fileCount: number;
  bytes: number;
  /** Finished runs of the workflow, before pruning. */
  total: number;
}

const artifactBytes = (entry: BuildHistoryEntry) =>
  (entry.artifacts ?? []).reduce(
    (sum, artifact) =>
      sum + ("size" in artifact && typeof artifact.size === "number" ? artifact.size : 0),
    0,
  );

/** What the policy would remove from the workflow's runs if it were applied right now. */
export const retentionPreview = (
  entries: readonly BuildHistoryEntry[],
  workflowId: string,
  policy: ReleaseRetentionPolicy | undefined,
  now = Date.now(),
): RetentionPreview => {
  const scope = { workflowId, keepId: "", now };
  const plan = planRetention(entries, { ...scope, policy });
  const unprotected = planRetention(entries, {
    ...scope,
    policy: policy && { ...policy, keepLatestSuccessful: false },
  });
  const rows: RetentionPreviewRow[] = [
    ...plan.deleteRuns.map((entry) => ({ entry, action: "delete-run" as const })),
    ...plan.deleteArtifacts.map((entry) => ({ entry, action: "delete-files" as const })),
  ].map((row) => ({ ...row, bytes: artifactBytes(row.entry) }));
  const removed = new Set(rows.map((row) => row.entry.id));
  const spared = [...unprotected.deleteRuns, ...unprotected.deleteArtifacts].filter(
    (entry) => !removed.has(entry.id),
  );
  rows.push(...spared.map((entry) => ({ entry, action: "protected" as const, bytes: 0 })));
  rows.sort((a, b) => b.entry.createdAt - a.entry.createdAt);
  const counted = rows.filter((row) => row.action !== "protected");
  return {
    rows,
    runCount: counted.filter((row) => row.action === "delete-run").length,
    fileCount: counted.filter((row) => row.action === "delete-files").length,
    bytes: counted.reduce((sum, row) => sum + row.bytes, 0),
    total: entries.filter((entry) => entry.workflowId === workflowId && entry.status !== "running")
      .length,
  };
};
