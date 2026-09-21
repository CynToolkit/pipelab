import type { ReleaseConfig, ValidationIssue } from "./types";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const requiredString = (value: unknown): boolean =>
  typeof value === "string" && value.trim().length > 0;

export const validateReleaseConfigShape = (config: unknown): ValidationIssue[] => {
  const issues: ValidationIssue[] = [];
  if (!config || typeof config !== "object" || Array.isArray(config)) {
    return [
      {
        code: "release.config.invalid",
        message: "Release configuration must be an object.",
        severity: "error",
      },
    ];
  }
  const value = config as Partial<ReleaseConfig>;
  if (value.version !== "3.0.0")
    issues.push({
      code: "release.config.version",
      message: "Only release configuration version 3.0.0 is supported.",
      severity: "error",
      path: "version",
    });
  for (const key of ["id", "project", "name"] as const) {
    if (typeof value[key] !== "string" || !value[key])
      issues.push({
        code: "release.config.required",
        message: `${key} is required.`,
        severity: "error",
        path: key,
      });
  }
  if (
    !isRecord(value.source) ||
    !requiredString(value.source.provider) ||
    !isRecord(value.source.config)
  ) {
    issues.push({
      code: "release.source.invalid",
      message: "A source provider and config are required.",
      severity: "error",
      path: "source",
    });
  }
  if (!Array.isArray(value.builds))
    issues.push({
      code: "release.builds.invalid",
      message: "Build profiles must be an array.",
      severity: "error",
      path: "builds",
    });
  if (!Array.isArray(value.destinations))
    issues.push({
      code: "release.destinations.invalid",
      message: "Destinations must be an array.",
      severity: "error",
      path: "destinations",
    });
  for (const [index, build] of (Array.isArray(value.builds) ? value.builds : []).entries()) {
    const path = `builds.${index}`;
    if (
      !isRecord(build) ||
      !requiredString(build.id) ||
      !requiredString(build.type) ||
      !requiredString(build.engine) ||
      typeof build.enabled !== "boolean" ||
      !isRecord(build.config) ||
      !Array.isArray(build.targets)
    ) {
      issues.push({
        code: "release.build.invalid",
        message: "Build profiles require id, type, engine, enabled, config, and targets.",
        severity: "error",
        path,
      });
      continue;
    }
    for (const [targetIndex, target] of build.targets.entries()) {
      if (
        !isRecord(target) ||
        !requiredString(target.id) ||
        typeof target.enabled !== "boolean" ||
        !isRecord(target.config)
      )
        issues.push({
          code: "release.build.target.invalid",
          message: "Build targets require id, enabled, and config.",
          severity: "error",
          path: `${path}.targets.${targetIndex}`,
        });
    }
  }
  for (const [index, destination] of (Array.isArray(value.destinations)
    ? value.destinations
    : []
  ).entries()) {
    const path = `destinations.${index}`;
    if (
      !isRecord(destination) ||
      !requiredString(destination.id) ||
      !requiredString(destination.provider) ||
      typeof destination.enabled !== "boolean" ||
      !isRecord(destination.config) ||
      !Array.isArray(destination.slots)
    ) {
      issues.push({
        code: "release.destination.invalid",
        message: "Destinations require id, provider, enabled, config, and slots.",
        severity: "error",
        path,
      });
      continue;
    }
    for (const [slotIndex, slot] of destination.slots.entries()) {
      const slotPath = `${path}.slots.${slotIndex}`;
      const input = isRecord(slot) ? slot.input : undefined;
      const validInput =
        input === undefined ||
        (isRecord(input) &&
          (("source" in input && input.source === true) ||
            ("buildId" in input &&
              "targetId" in input &&
              requiredString(input.buildId) &&
              requiredString(input.targetId))));
      if (
        !isRecord(slot) ||
        !requiredString(slot.id) ||
        typeof slot.enabled !== "boolean" ||
        !validInput ||
        !isRecord(slot.config)
      )
        issues.push({
          code: "release.destination.slot.invalid",
          message: "Destination slots require id, enabled, input, and config.",
          severity: "error",
          path: slotPath,
        });
    }
  }
  return issues;
};
