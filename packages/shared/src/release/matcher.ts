import type { ArtifactAcceptance, ArtifactConstraint, ArtifactDescriptor } from "./types";

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
  matchesValue(descriptor.container, constraint.container) &&
  matchesValue(descriptor.format, constraint.format) &&
  (constraint.capabilities ?? []).every((capability) => descriptor.capabilities?.includes(capability));

export const evaluateArtifactAcceptance = (
  descriptor: ArtifactDescriptor,
  constraint: ArtifactConstraint,
  dynamic?: () => ArtifactAcceptance,
): ArtifactAcceptance => {
  if (!matchesArtifact(descriptor, constraint)) return { accepted: false };
  return dynamic?.() ?? { accepted: true };
};
