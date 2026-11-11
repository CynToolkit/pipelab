import type { BuildHistoryEntry } from "../build-history";
import type { ReleaseRetentionPolicy } from "./types";

const DAY_MS = 24 * 60 * 60 * 1000;

export interface RetentionPlan {
  /** Runs removed from history together with their artifacts. */
  deleteRuns: BuildHistoryEntry[];
  /** Runs that stay in history but lose their artifacts. */
  deleteArtifacts: BuildHistoryEntry[];
}

const isFailure = (entry: BuildHistoryEntry) =>
  entry.status === "failed" || entry.status === "completed-with-errors";

/**
 * Applies a workflow's retention policy to its finished runs. The run that just finished and
 * running runs are never selected, and neither is the newest successful run unless
 * `keepLatestSuccessful` is turned off. Run counts include the run that just finished.
 */
export const planRetention = (
  entries: readonly BuildHistoryEntry[],
  {
    workflowId,
    keepId,
    policy,
    now = Date.now(),
  }: {
    workflowId: string;
    keepId: string;
    policy: ReleaseRetentionPolicy | undefined;
    now?: number;
  },
): RetentionPlan => {
  const plan: RetentionPlan = { deleteRuns: [], deleteArtifacts: [] };
  if (!policy) return plan;
  const runs = entries
    .filter((entry) => entry.workflowId === workflowId && entry.status !== "running")
    .sort((a, b) => b.createdAt - a.createdAt);
  const latestSuccessful =
    policy.keepLatestSuccessful === false
      ? undefined
      : runs.find((entry) => entry.status === "completed");
  const exceeds = (
    entry: BuildHistoryEntry,
    index: number,
    rules: { maxRuns?: number; maxAgeDays?: number } | undefined,
  ) =>
    rules !== undefined &&
    ((rules.maxRuns !== undefined && index >= rules.maxRuns) ||
      (rules.maxAgeDays !== undefined && now - entry.createdAt > rules.maxAgeDays * DAY_MS));

  runs.forEach((entry, index) => {
    if (entry.id === keepId || entry.id === latestSuccessful?.id) return;
    const failedTooOld =
      policy.failedMaxAgeDays !== undefined &&
      isFailure(entry) &&
      now - entry.createdAt > policy.failedMaxAgeDays * DAY_MS;
    if (exceeds(entry, index, policy.history) || failedTooOld) plan.deleteRuns.push(entry);
    else if (exceeds(entry, index, policy.artifacts) && (entry.artifacts?.length ?? 0) > 0)
      plan.deleteArtifacts.push(entry);
  });
  return plan;
};
