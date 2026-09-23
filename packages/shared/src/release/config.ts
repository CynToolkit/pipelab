import {
  RELEASE_CONFIG_VERSION,
  type ReleaseConfig,
  type ReleaseRegistry,
  type ValidationIssue,
} from "./types";
import type { ConnectionsConfig } from "../config.schema";
import { isSafePersistedId } from "../persisted-id";

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
  const value = config as Record<string, unknown>;
  if (value.version !== RELEASE_CONFIG_VERSION)
    issues.push({
      code: "release.config.version",
      message: `Only release configuration version ${RELEASE_CONFIG_VERSION} is supported.`,
      severity: "error",
      path: "version",
    });
  for (const key of ["id", "project", "name"] as const) {
    if (!requiredString(value[key]))
      issues.push({
        code: "release.config.required",
        message: `${key} is required.`,
        severity: "error",
        path: key,
      });
  }
  if (value.description !== undefined && typeof value.description !== "string")
    issues.push({
      code: "release.config.description",
      message: "description must be a string when present.",
      severity: "error",
      path: "description",
    });
  if (!isSafePersistedId(value.id))
    issues.push({
      code: "release.config.id.invalid",
      message: "id must be a safe non-empty persisted ID.",
      severity: "error",
      path: "id",
    });
  if (!isSafePersistedId(value.project))
    issues.push({
      code: "release.config.project.invalid",
      message: "project must be a safe non-empty persisted ID.",
      severity: "error",
      path: "project",
    });
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
  const ids = new Map<string, string>();
  const addId = (scope: string, id: unknown, path: string) => {
    if (!requiredString(id)) return;
    const key = `${scope}:${id}`;
    const previous = ids.get(key);
    if (previous) {
      issues.push({
        code: "release.config.duplicate-id",
        message: `ID '${id}' is already used at ${previous}.`,
        severity: "error",
        path,
      });
    } else ids.set(key, path);
  };

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
    addId("build", build.id, `${path}.id`);
    if (build.name !== undefined && !requiredString(build.name))
      issues.push({
        code: "release.build.name",
        message: "Build name must be a non-empty string when present.",
        severity: "error",
        path: `${path}.name`,
      });
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
      else addId(`${path}.targets`, target.id, `${path}.targets.${targetIndex}.id`);
      if (isRecord(target) && target.input !== undefined && !validOutputRef(target.input)) {
        issues.push({
          code: "release.build.target.input.invalid",
          message: "Build target input must be a source or build/target reference.",
          severity: "error",
          path: `${path}.targets.${targetIndex}.input`,
        });
      }
    }
    if (build.input !== undefined && !validOutputRef(build.input))
      issues.push({
        code: "release.build.input.invalid",
        message: "Build input must be a source or build/target reference.",
        severity: "error",
        path: `${path}.input`,
      });
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
    addId("destination", destination.id, `${path}.id`);
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
      else {
        addId(`${path}.slots`, slot.id, `${slotPath}.id`);
        if (slot.name !== undefined && !requiredString(slot.name))
          issues.push({
            code: "release.destination.slot.name",
            message: "Destination slot name must be a non-empty string when present.",
            severity: "error",
            path: `${slotPath}.name`,
          });
      }
    }
  }
  if (value.continueOnError !== undefined && typeof value.continueOnError !== "boolean")
    issues.push({
      code: "release.config.continue-on-error",
      message: "continueOnError must be a boolean.",
      severity: "error",
      path: "continueOnError",
    });
  return issues;
};

const validOutputRef = (value: unknown): value is ReleaseConfig["builds"][number]["input"] =>
  isRecord(value) &&
  ((value.source === true && Object.keys(value).length === 1) ||
    (requiredString(value.buildId) &&
      requiredString(value.targetId) &&
      Object.keys(value).every((key) => key === "buildId" || key === "targetId")));

export class ReleaseConfigParseError extends Error {
  readonly issues: ValidationIssue[];

  constructor(issues: ValidationIssue[]) {
    super(
      issues.map((issue) => `${issue.path ? `${issue.path}: ` : ""}${issue.message}`).join(" "),
    );
    this.name = "ReleaseConfigParseError";
    this.issues = issues;
  }
}

const assertReleaseConfigShape: (value: unknown) => asserts value is ReleaseConfig = (value) => {
  const issues = validateReleaseConfigShape(value);
  if (issues.length > 0) throw new ReleaseConfigParseError(issues);
};

export const parseReleaseConfig = (value: unknown): ReleaseConfig => {
  assertReleaseConfigShape(value);
  return value;
};

export const createReleaseConfig = (
  input: Pick<ReleaseConfig, "id" | "project" | "name" | "source"> &
    Partial<Pick<ReleaseConfig, "description" | "continueOnError">>,
): ReleaseConfig => ({
  version: RELEASE_CONFIG_VERSION,
  id: input.id,
  project: input.project,
  name: input.name,
  ...(input.description === undefined ? {} : { description: input.description }),
  ...(input.continueOnError === undefined ? {} : { continueOnError: input.continueOnError }),
  source: input.source,
  builds: [],
  destinations: [],
});

export const validateReleaseConnectionReferences = (
  config: ReleaseConfig,
  registry: ReleaseRegistry,
  connections: ConnectionsConfig,
): ValidationIssue[] => {
  const issues: ValidationIssue[] = [];
  const known = new Map(connections.connections.map((connection) => [connection.id, connection]));
  const check = (
    fields: ReleaseRegistry["sources"][number]["fields"] | undefined,
    values: Record<string, unknown>,
    path: string,
  ) => {
    for (const field of fields || []) {
      if (field.type !== "connection") continue;
      const selected = values[field.key];
      if (selected === undefined || selected === null || selected === "") continue;
      if (typeof selected !== "string" || !known.has(selected)) {
        issues.push({
          code: "release.connection.missing",
          message: `Connection '${String(selected)}' does not exist.`,
          severity: "error",
          path: `${path}.${field.key}`,
        });
        continue;
      }
      const connection = known.get(selected)!;
      if (
        field.integration &&
        connection.pluginName !== field.integration &&
        connection.integrationName !== field.integration
      )
        issues.push({
          code: "release.connection.integration",
          message: `Connection '${selected}' does not belong to integration '${field.integration}'.`,
          severity: "error",
          path: `${path}.${field.key}`,
        });
    }
  };
  check(
    registry.sources.find((source) => source.id === config.source.provider)?.fields,
    config.source.config,
    "source.config",
  );
  for (const build of config.builds) {
    const producer = registry.producers.find((candidate) => candidate.id === build.engine);
    check(producer?.fields, build.config, `builds.${config.builds.indexOf(build)}.config`);
    for (const target of build.targets)
      check(
        producer?.targets.find((candidate) => candidate.id === target.id)?.fields,
        target.config,
        `builds.${config.builds.indexOf(build)}.targets.${build.targets.indexOf(target)}.config`,
      );
  }
  for (const destination of config.destinations) {
    const definition = registry.destinations.find(
      (candidate) => candidate.id === destination.provider,
    );
    check(
      definition?.fields,
      destination.config,
      `destinations.${config.destinations.indexOf(destination)}.config`,
    );
    for (const slot of destination.slots)
      check(
        definition?.slotFields,
        slot.config,
        `destinations.${config.destinations.indexOf(destination)}.slots.${destination.slots.indexOf(slot)}.config`,
      );
  }
  return issues;
};
