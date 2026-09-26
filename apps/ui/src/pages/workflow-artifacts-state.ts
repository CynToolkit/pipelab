import type { BuildHistoryEntry } from "@pipelab/shared";

export interface WorkflowArtifactViewModel {
  id: string;
  runId: string;
  runLabel: string;
  workflowName: string;
  runDate: number;
  displayName: string;
  releaseVersion?: string;
  platform?: string;
  architecture?: string;
  format?: string;
  kind?: string;
  size?: number;
  localPath?: string;
  hostedArtifactId?: string;
}

const toArtifactViewModel = (
  run: BuildHistoryEntry,
  artifact: NonNullable<BuildHistoryEntry["artifacts"]>[number],
): WorkflowArtifactViewModel => {
  const explicitName =
    typeof artifact.name === "string"
      ? artifact.name
      : typeof artifact.artifact === "string"
        ? artifact.artifact
        : "Artifact";
  const kind =
    artifact.descriptor?.kind ??
    (artifact.type === "file" || artifact.type === "folder" ? artifact.type : undefined);

  return {
    id: `${run.id}:${artifact.id}`,
    runId: run.id,
    runLabel: run.version
      ? `Release ${run.version}`
      : run.workflowName || run.projectName || "Workflow run",
    workflowName: run.workflowName || run.projectName || "Workflow",
    runDate: run.startTime,
    displayName: explicitName,
    releaseVersion: run.version ?? artifact.version,
    ...(artifact.descriptor?.platform ? { platform: artifact.descriptor.platform } : {}),
    ...(artifact.descriptor?.architecture
      ? { architecture: artifact.descriptor.architecture }
      : {}),
    ...(artifact.descriptor?.format ? { format: artifact.descriptor.format } : {}),
    ...(kind ? { kind } : {}),
    ...(typeof artifact.size === "number" ? { size: artifact.size } : {}),
    ...(artifact.path ? { localPath: artifact.path } : {}),
    ...(artifact.cloud?.hostedArtifactId
      ? { hostedArtifactId: artifact.cloud.hostedArtifactId }
      : {}),
  };
};

export const aggregateWorkflowArtifacts = (
  entries: BuildHistoryEntry[],
  workflowId: string,
  projectId: string,
): WorkflowArtifactViewModel[] =>
  entries
    .filter((entry) => entry.workflowId === workflowId && entry.pipelineId === projectId)
    .flatMap((run) => (run.artifacts ?? []).map((artifact) => toArtifactViewModel(run, artifact)))
    .sort((a, b) => b.runDate - a.runDate);
