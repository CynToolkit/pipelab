import type {
  ReleaseBuildProfileConfig,
  ReleaseCatalog,
  ReleaseConfig,
  ReleaseOutputRef,
  ReleasePlan,
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
      enabled: index === 0,
      config: { ...target.defaultConfig },
    })),
  };
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
