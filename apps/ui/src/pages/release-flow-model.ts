import { DEFAULT_RELEASE_BUILD_PREFERENCES, evaluateArtifactAcceptance } from "@pipelab/shared";
import type {
  ReleaseBuildProfileConfig,
  ReleaseCatalog,
  ReleaseConfig,
  ReleaseOutputRef,
  ReleasePlan,
  ReleaseBuildPreferences,
  ValidationIssue,
} from "@pipelab/shared";

export interface ReleaseOutputOption {
  value: string;
  label: string;
  ref: ReleaseOutputRef;
}

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

export const defaultBuildProfile = (
  catalog: ReleaseCatalog,
  type: string,
  id: string,
  preferences: ReleaseBuildPreferences,
) => {
  const candidates = [
    preferences.buildTypes[type],
    DEFAULT_RELEASE_BUILD_PREFERENCES.buildTypes[type],
  ];
  for (const preference of candidates) {
    if (!preference?.engine) continue;
    const engine = buildEnginesFor(catalog, type).find(
      (candidate) => candidate.id === preference.engine,
    );
    if (!engine) continue;
    const targets = buildTargetsFor(catalog, preference.engine, type);
    const selectedTargets = preference.targets?.filter((target) =>
      targets.some((candidate) => candidate.id === target),
    );
    if (preference.targets?.length && !selectedTargets?.length) continue;
    return createBuildProfile(catalog, type, preference.engine, id, selectedTargets);
  }
  return undefined;
};

export const resolveMissingDestinationInputs = (
  config: ReleaseConfig,
  plan: ReleasePlan,
  catalog: ReleaseCatalog,
  preferences: ReleaseBuildPreferences,
): boolean => {
  let changed = false;
  for (const [destinationIndex, destination] of config.destinations.entries()) {
    const definition = catalog.destinations.find(
      (candidate) => candidate.id === destination.provider,
    );
    if (!definition || !destination.enabled) continue;
    for (const [slotIndex, slot] of destination.slots.entries()) {
      if (!slot.enabled || slot.input) continue;
      const issuePath = `destinations.${destinationIndex}.slots.${slotIndex}.input`;
      if (
        !plan.issues.some(
          (issue) =>
            issue.code === "release.destination.input.required" &&
            issue.severity === "error" &&
            issue.path === issuePath,
        )
      )
        continue;
      const compatibleOutput = plan.outputs.find(
        (output) => evaluateArtifactAcceptance(output.descriptor, definition.accepts).accepted,
      );
      if (compatibleOutput) {
        slot.input = compatibleOutput.ref;
        changed = true;
        continue;
      }
      const compatibleBuild = config.builds.find(
        (build) =>
          build.enabled &&
          build.targets.some((target) => {
            if (!target.enabled) return false;
            const targetDefinition = catalog.producers
              .find((producer) => producer.id === build.engine)
              ?.targets.find((candidate) => candidate.id === target.id);
            return (
              targetDefinition?.output &&
              evaluateArtifactAcceptance(targetDefinition.output, definition.accepts).accepted
            );
          }),
      );
      if (compatibleBuild) {
        const target = compatibleBuild.targets.find((candidate) => {
          if (!candidate.enabled) return false;
          const targetDefinition = catalog.producers
            .find((producer) => producer.id === compatibleBuild.engine)
            ?.targets.find((target) => target.id === candidate.id);
          return (
            targetDefinition?.output &&
            evaluateArtifactAcceptance(targetDefinition.output, definition.accepts).accepted
          );
        });
        if (target) {
          slot.input = { buildId: compatibleBuild.id, targetId: target.id };
          changed = true;
          continue;
        }
      }
      const buildTypes = new Set([
        ...Object.keys(preferences.buildTypes),
        ...Object.keys(DEFAULT_RELEASE_BUILD_PREFERENCES.buildTypes),
      ]);
      for (const buildType of buildTypes) {
        const buildId = `${buildType}-default`;
        if (config.builds.some((build) => build.id === buildId)) continue;
        const build = defaultBuildProfile(catalog, buildType, buildId, preferences);
        if (!build || !build.targets.some((target) => target.enabled)) continue;
        const matchingTarget = build.targets.find((target) => {
          const targetDefinition = catalog.producers
            .find((producer) => producer.id === build.engine)
            ?.targets.find((candidate) => candidate.id === target.id);
          return (
            target.enabled &&
            targetDefinition?.output &&
            evaluateArtifactAcceptance(targetDefinition.output, definition.accepts).accepted
          );
        });
        if (matchingTarget) {
          config.builds.push(build);
          slot.input = { buildId: build.id, targetId: matchingTarget.id };
          changed = true;
          break;
        }
      }
    }
  }
  return changed;
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
