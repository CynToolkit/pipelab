import type { ArtifactDescriptor } from "@pipelab/workflow-runtime";

export type ArtifactDescriptorChanges = Partial<Pick<ArtifactDescriptor, "kind" | "technology" | "platform" | "architecture" | "container" | "format" | "capabilities">>;

/** Applies an explicit descriptor transformation without inferring semantic meaning. */
export const transformArtifactDescriptor = (input: ArtifactDescriptor, changes: ArtifactDescriptorChanges): ArtifactDescriptor => ({
  ...input,
  ...changes,
});
