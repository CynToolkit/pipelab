import type { ArtifactDescriptor } from "@pipelab/workflow-runtime";
import type { ArtifactDescriptorTransform } from "./types";

export type ArtifactDescriptorChanges = Partial<Pick<ArtifactDescriptor, "kind" | "technology" | "platform" | "architecture" | "container" | "format" | "capabilities">>;

/** Applies an explicit descriptor transformation without inferring semantic meaning. */
export const transformArtifactDescriptor = (input: ArtifactDescriptor, changes: ArtifactDescriptorChanges): ArtifactDescriptor => ({
  ...input,
  ...changes,
});

export const applyArtifactDescriptorTransform = (input: ArtifactDescriptor, transform: ArtifactDescriptorTransform): ArtifactDescriptor => {
  const result = transformArtifactDescriptor(input, transform.changes || {});
  for (const key of transform.remove || []) delete result[key];
  return result;
};
