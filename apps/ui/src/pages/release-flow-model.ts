import type {
  ReleaseBuildProfileConfig,
  ReleaseCatalog,
  ReleaseConfig,
  Connection,
  ReleaseOutputRef,
  ReleasePlan,
  ReleaseDestinationSlot,
  ProducerInspection,
  ValidationIssue,
} from "@pipelab/shared";

export interface ReleaseOutputOption {
  value: string;
  label: string;
  ref: ReleaseOutputRef;
}

export const createSerializedTaskQueue = (task: () => Promise<void>) => {
  let requested = false;
  let active: Promise<void> | undefined;

  const request = () => {
    requested = true;
    if (active) return active;
    active = (async () => {
      while (requested) {
        requested = false;
        await task();
      }
    })().finally(() => {
      active = undefined;
    });
    return active;
  };

  return request;
};

export const runAfterSuccessfulSave = async <T>(
  save: () => Promise<void>,
  run: () => Promise<T>,
) => {
  await save();
  return run();
};

export const buildTypesFor = (catalog: ReleaseCatalog) => catalog.buildTypes;

export const buildEnginesFor = (catalog: ReleaseCatalog, type: string) =>
  catalog.producers.filter(
    (producer) =>
      producer.planning.mode === "build" &&
      producer.targets.some((target) => target.buildType === type),
  );

export const buildTargetsFor = (catalog: ReleaseCatalog, engine: string, type: string) =>
  catalog.producers
    .find((producer) => producer.id === engine)
    ?.targets.filter((target) => target.buildType === type) ?? [];

export const buildProfileSummary = (catalog: ReleaseCatalog, build: ReleaseBuildProfileConfig) => {
  const producer = catalog.producers.find((candidate) => candidate.id === build.engine);
  const targets = producer?.targets
    .filter((target) => target.buildType === build.type)
    .filter((target) =>
      build.targets.some((selected) => selected.id === target.id && selected.enabled),
    )
    .map((target) => target.label);
  return {
    engineLabel: producer?.label || build.engine,
    targetLabels: targets || [],
  };
};

export const createBuildProfile = (
  catalog: ReleaseCatalog,
  type: string,
  engine: string,
  id: string,
  preferredTargets?: string[],
): ReleaseBuildProfileConfig | undefined => {
  const producer = buildEnginesFor(catalog, type).find((candidate) => candidate.id === engine);
  if (!producer) return undefined;
  const targets = buildTargetsFor(catalog, engine, type);
  return {
    id,
    type,
    engine,
    enabled: true,
    config: { ...producer.defaultConfig },
    targets: targets.map((target, index) => ({
      id: target.id,
      enabled: preferredTargets?.length ? preferredTargets.includes(target.id) : index === 0,
      config: { ...target.defaultConfig },
    })),
  };
};

export const removeBuildProfile = (config: ReleaseConfig, id: string): boolean => {
  const nextBuilds = config.builds.filter((build) => build.id !== id);
  if (nextBuilds.length === config.builds.length) return false;
  config.builds = nextBuilds;
  return true;
};

export const setBuildTargetEnabled = (
  build: ReleaseBuildProfileConfig,
  id: string,
  enabled: boolean,
): boolean => {
  const target = build.targets.find((candidate) => candidate.id === id);
  if (!target) return false;
  target.enabled = enabled;
  return true;
};

export const switchBuildProfileEngine = (
  catalog: ReleaseCatalog,
  build: ReleaseBuildProfileConfig,
  engine: string,
): ReleaseBuildProfileConfig | undefined => {
  const producer = catalog.producers.find((candidate) => candidate.id === engine);
  if (!producer || producer.planning.mode !== "build") return undefined;
  const previousTargets = new Map(build.targets.map((target) => [target.id, target]));
  return {
    ...build,
    engine,
    config: Object.fromEntries(
      Object.keys(producer.defaultConfig).map((key) => [
        key,
        build.config[key] ?? producer.defaultConfig[key],
      ]),
    ),
    targets: producer.targets
      .filter((target) => target.buildType === build.type)
      .map((target, index) => ({
        id: target.id,
        enabled: previousTargets.get(target.id)?.enabled ?? index === 0,
        config: Object.fromEntries(
          Object.keys(target.defaultConfig).map((key) => [
            key,
            previousTargets.get(target.id)?.config[key] ?? target.defaultConfig[key],
          ]),
        ),
      })),
  };
};

export const issuesForPath = (issues: ValidationIssue[], path: string) =>
  issues.filter((issue) => issue.path === path || issue.path?.startsWith(`${path}.`));

export const releaseCanRun = (
  flow: ReleaseConfig | undefined,
  plan: ReleasePlan | undefined,
  issues: ValidationIssue[],
  running: boolean,
  planning: boolean,
  saveState: "saving" | "saved" | "error" = "saved",
) =>
  Boolean(
    flow &&
    plan &&
    !running &&
    !planning &&
    saveState !== "error" &&
    !issues.some((issue) => issue.severity === "error"),
  );

export const deploymentSlotLabel = (slot: ReleaseDestinationSlot, index: number) =>
  slot.name?.trim() || `Deployment ${index + 1}`;

export const readinessLabel = (enabled: boolean, configured: boolean, hasIssues: boolean) => {
  if (!enabled) return "Disabled";
  return configured && !hasIssues ? "Ready" : "Needs attention";
};

export const applyProducerInspection = (
  build: ReleaseBuildProfileConfig,
  buildIndex: number,
  inspection: ProducerInspection,
) => {
  for (const [key, value] of Object.entries(inspection.fieldValues || {})) {
    const targetMatch = key.match(/^targets\.([^.]+)\.config\.(.+)$/);
    if (targetMatch) {
      const target = build.targets.find((candidate) => candidate.id === targetMatch[1]);
      if (target) target.config[targetMatch[2]] = value;
      continue;
    }
    build.config[key.replace(/^config\./, "")] = value;
  }
  const issues = (inspection.issues || []).map((issue) => {
    const targetMatch = issue.path?.match(/^targets\.([^.]+)(?:\.(.*))?$/);
    if (!targetMatch)
      return {
        ...issue,
        path: issue.path ? `builds.${buildIndex}.${issue.path}` : `builds.${buildIndex}`,
      };
    const targetIndex = build.targets.findIndex((target) => target.id === targetMatch[1]);
    return {
      ...issue,
      path:
        targetIndex >= 0
          ? `builds.${buildIndex}.targets.${targetIndex}${targetMatch[2] ? `.${targetMatch[2]}` : ""}`
          : `builds.${buildIndex}`,
    };
  });
  return { options: inspection.fieldOptions || {}, issues };
};

export const plannerAcceptsBuildCandidate = (
  plan: ReleasePlan,
  candidateId: string,
  buildIndex: number,
  destinationIndex: number,
  slotIndex: number,
) => {
  const buildPath = `builds.${buildIndex}`;
  const slotPath = `destinations.${destinationIndex}.slots.${slotIndex}.input`;
  return (
    plan.producers.some((producer) => producer.id === candidateId) &&
    !plan.issues.some(
      (issue) =>
        issue.severity === "error" &&
        (issue.path === buildPath ||
          issue.path?.startsWith(`${buildPath}.`) ||
          issue.path === slotPath ||
          issue.path?.startsWith(`${slotPath}.`)),
    )
  );
};

export const connectionMatchesIntegration = (connection: Connection, integration?: string) =>
  !integration ||
  connection.pluginName === integration ||
  connection.integrationName === integration;

const outputKey = (ref: ReleaseOutputRef) =>
  "source" in ref ? "source" : `${ref.buildId}:${ref.targetId}`;

const outputLabel = (config: ReleaseConfig, catalog: ReleaseCatalog, ref: ReleaseOutputRef) => {
  if ("source" in ref) {
    return `Source — ${catalog.sources.find((source) => source.id === config.source.provider)?.label ?? config.source.provider}`;
  }
  const build = config.builds.find((candidate) => candidate.id === ref.buildId);
  const producer = catalog.producers.find((candidate) => candidate.id === build?.engine);
  const target = producer?.targets.find((candidate) => candidate.id === ref.targetId);
  return `${build?.name || producer?.label || build?.engine || ref.buildId} — ${target?.label || ref.targetId}`;
};

export const planOutputOptions = (
  config: ReleaseConfig,
  plan: ReleasePlan,
  catalog: ReleaseCatalog,
): ReleaseOutputOption[] =>
  plan.outputs.map((output) => ({
    value: outputKey(output.ref),
    label: outputLabel(config, catalog, output.ref),
    ref: output.ref,
  }));
