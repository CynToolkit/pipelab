import { planRetention, useLogger, type ReleaseRetentionPolicy } from "@pipelab/shared";
import type { PipelabContext } from "../context";
import { BuildHistoryStorage } from "../handlers/build-history";
import { loadStrictProjects } from "../strict-config-persistence";
import { ReleasePersistence } from "../release-persistence";

export interface RetentionResult {
  runs: number;
  files: number;
}

/**
 * Applies a retention policy to one workflow's stored runs. `keepId` is the run that just
 * finished, which is never pruned; it is empty when no run is in flight.
 */
export const applyRetention = async (
  history: Pick<BuildHistoryStorage, "getByProject" | "deleteWithArtifacts" | "deleteArtifacts">,
  {
    projectId,
    workflowId,
    policy,
    keepId = "",
  }: {
    projectId: string;
    workflowId: string;
    policy: ReleaseRetentionPolicy | undefined;
    keepId?: string;
  },
): Promise<RetentionResult> => {
  if (!policy) return { runs: 0, files: 0 };
  const { deleteRuns, deleteArtifacts } = planRetention(await history.getByProject(projectId), {
    workflowId,
    keepId,
    policy,
  });
  for (const entry of deleteRuns) await history.deleteWithArtifacts(entry.id, projectId);
  for (const entry of deleteArtifacts) await history.deleteArtifacts(entry.id, projectId);
  return { runs: deleteRuns.length, files: deleteArtifacts.length };
};

/**
 * Applies every workflow's retention policy once. Meant for app start, in the background, so
 * age-based rules also move for workflows that are not run. One workflow failing never stops
 * the rest.
 */
export const sweepRetention = async (context: PipelabContext): Promise<void> => {
  const { logger } = useLogger();
  const history = new BuildHistoryStorage(context);
  const persistence = new ReleasePersistence(context);
  try {
    const repo = await loadStrictProjects(context);
    for (const workflow of repo.workflows ?? []) {
      try {
        const config = await persistence.load(workflow.id);
        await applyRetention(history, {
          projectId: config.project,
          workflowId: config.id,
          policy: config.settings?.retention,
        });
      } catch (error) {
        logger().warn(`Retention sweep skipped workflow ${workflow.id}:`, error);
      }
    }
  } catch (error) {
    logger().warn("Retention sweep failed:", error);
  }
};
