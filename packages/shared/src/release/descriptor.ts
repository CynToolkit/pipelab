import type { ArtifactDescriptor } from "@pipelab/workflow-runtime";
import type { ArtifactDescriptorTransform, ReleaseProducerTargetDefinition } from "./types";

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

export const resolveTargetDescriptor = (input: ArtifactDescriptor, target: Pick<ReleaseProducerTargetDefinition, "output" | "transform">): ArtifactDescriptor | undefined => {
  if (target.output) return target.output;
  if (target.transform) return applyArtifactDescriptorTransform(input, target.transform);
  return undefined;
};

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null;

export const descriptorsEqual = (left: unknown, right: unknown): boolean => {
  if (Object.is(left, right)) return true;
  if (Array.isArray(left) || Array.isArray(right)) {
    return Array.isArray(left) && Array.isArray(right) && left.length === right.length && left.every((value, index) => descriptorsEqual(value, right[index]));
  }
  if (!isRecord(left) || !isRecord(right)) return false;
  const leftKeys = Object.keys(left).filter((key) => left[key] !== undefined).sort();
  const rightKeys = Object.keys(right).filter((key) => right[key] !== undefined).sort();
  return leftKeys.length === rightKeys.length && leftKeys.every((key, index) => key === rightKeys[index] && descriptorsEqual(left[key], right[key]));
};
