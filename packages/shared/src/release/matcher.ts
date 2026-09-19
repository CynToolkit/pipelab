import type { ArtifactConstraint, ArtifactDescriptor } from "./types";

const matchesValue = (value: string | undefined, expected: string | string[] | undefined): boolean => {
  if (expected === undefined) return true;
  if (value === undefined) return false;
  return Array.isArray(expected) ? expected.includes(value) : value === expected;
};

export const matchesArtifact = (descriptor: ArtifactDescriptor, constraint: ArtifactConstraint): boolean =>
  matchesValue(descriptor.kind, constraint.kind) &&
  matchesValue(descriptor.technology, constraint.technology) &&
  matchesValue(descriptor.platform, constraint.platform) &&
  matchesValue(descriptor.architecture, constraint.architecture) &&
  matchesValue(descriptor.format, constraint.format) &&
  (constraint.capabilities ?? []).every((capability) => descriptor.capabilities?.includes(capability));
