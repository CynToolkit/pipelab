import { planRelease } from "./planner";
import { validateReleaseConfigShape } from "./config";
import type { ReleaseConfig, ReleaseRegistry, ReleaseValidationContext, ValidationIssue } from "./types";

/** Validates the persisted Build Profile model and its resolved execution graph. */
export const validateRelease = (config: ReleaseConfig, registry: ReleaseRegistry, context: ReleaseValidationContext): ValidationIssue[] => {
  const shapeIssues = validateReleaseConfigShape(config);
  if (shapeIssues.some((issue) => issue.severity === "error")) return shapeIssues;
  return [...shapeIssues, ...planRelease(config, registry, context).issues];
};
