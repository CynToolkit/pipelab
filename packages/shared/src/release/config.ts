import type { ReleaseConfig, ValidationIssue } from "./types";

export const validateReleaseConfigShape = (config: unknown): ValidationIssue[] => {
  const issues: ValidationIssue[] = [];
  if (!config || typeof config !== "object" || Array.isArray(config)) {
    return [{ code: "release.config.invalid", message: "Release configuration must be an object.", severity: "error" }];
  }
  const value = config as Partial<ReleaseConfig>;
  if (value.version !== "3.0.0") issues.push({ code: "release.config.version", message: "Only release configuration version 3.0.0 is supported.", severity: "error", path: "version" });
  for (const key of ["id", "project", "name"] as const) {
    if (typeof value[key] !== "string" || !value[key]) issues.push({ code: "release.config.required", message: `${key} is required.`, severity: "error", path: key });
  }
  if (!value.source || typeof value.source.provider !== "string" || !value.source.config || typeof value.source.config !== "object") {
    issues.push({ code: "release.source.invalid", message: "A source provider and config are required.", severity: "error", path: "source" });
  }
  if (!Array.isArray(value.producers)) issues.push({ code: "release.producers.invalid", message: "Producers must be an array.", severity: "error", path: "producers" });
  if (!Array.isArray(value.destinations)) issues.push({ code: "release.destinations.invalid", message: "Destinations must be an array.", severity: "error", path: "destinations" });
  return issues;
};
