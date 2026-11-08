import type {
  ReleaseHostContext,
  ReleaseProducerDefinition,
  ReleaseProducerTargetDefinition,
  ReleaseRegistry,
} from "./types";

/** Target id that resolves to the engine target matching the planning host (see `hostTargetOf`). */
export const HOST_RELEASE_TARGET = "host" as const;

/**
 * One default build: the producer target that fills a build of `buildType`. Defaults are the only
 * source of automatic builds; a producer target never declares itself a default.
 */
export interface ReleaseDefaultEntry {
  /** Build type the entry creates a build for, for example `desktop` or `web`. */
  buildType: string;
  /** Source output technology the entry applies to (for example `construct`); omitted = any source. */
  source?: string;
  /** Producer id of the build engine. */
  engine: string;
  /**
   * Target id of the engine that the build enables, or `host` for the engine target whose output
   * platform and architecture equal the planning host. A `host` entry adds nothing on a host without
   * such a target.
   */
  target: string;
  /** Config merged into the enabled target of the created build. */
  targetConfig?: Record<string, unknown>;
  /** Config merged into the enabled target only when it is the resolved target, keyed by target id. */
  targetConfigs?: Record<string, Record<string, unknown>>;
}

/**
 * The defaults for empty destination slots, in priority order. For one slot the first entry that
 * can be chained to the slot wins; a source-specific entry replaces a generic one of the same build type.
 */
export const RELEASE_DEFAULTS: ReleaseDefaultEntry[] = [
  {
    buildType: "desktop",
    engine: "@pipelab/plugin-electron/producer",
    target: HOST_RELEASE_TARGET,
  },
  {
    buildType: "web",
    source: "construct",
    engine: "@pipelab/plugin-construct/producer",
    target: "web",
  },
  {
    buildType: "desktop",
    source: "godot",
    engine: "@pipelab/plugin-godot/producer",
    target: HOST_RELEASE_TARGET,
    targetConfigs: {
      "linux-x64": { preset: "Linux" },
      "windows-x64": { preset: "Windows Desktop" },
      "macos-arm64": { preset: "macOS" },
    },
  },
  {
    buildType: "web",
    source: "godot",
    engine: "@pipelab/plugin-godot/producer",
    target: "web",
    targetConfig: { preset: "Web" },
  },
];

/** Planning platform name of each host platform, as the output descriptors name it. */
const DESCRIPTOR_PLATFORM_OF_HOST: Record<string, string> = {
  win32: "windows",
  linux: "linux",
  darwin: "macos",
};

/**
 * The engine target of a build type whose output matches the host platform and architecture, or
 * undefined when the host has no such target.
 */
export const hostTargetOf = (
  producer: ReleaseProducerDefinition,
  buildType: string,
  host: ReleaseHostContext,
) => {
  const platform = DESCRIPTOR_PLATFORM_OF_HOST[host.platform];
  if (!platform) return undefined;
  return producer.targets.find(
    (target) =>
      target.buildType === buildType &&
      target.output?.platform === platform &&
      target.output.architecture === host.architecture,
  );
};

/** Config keys a target declares: its default config keys and its field keys. */
const declaredKeysOf = (target: ReleaseProducerTargetDefinition) =>
  new Set([
    ...Object.keys(target.createDefaultConfig()),
    ...(target.fields ?? []).map((field) => field.key),
  ]);

/**
 * Problems of a defaults table against a registry: unknown engines and targets, targets of another
 * build type, `targetConfig` and `targetConfigs` keys the target does not declare, and duplicate
 * (build type, source) pairs. An empty result means every entry can be resolved.
 */
export const validateReleaseDefaults = (
  defaults: ReleaseDefaultEntry[],
  registry: ReleaseRegistry,
): string[] => {
  const problems: string[] = [];
  const pairs = new Set<string>();
  defaults.forEach((entry, index) => {
    const at = `defaults[${index}]`;
    const producer = registry.producers.find((item) => item.id === entry.engine);
    if (!producer) problems.push(`${at}: unknown engine ${entry.engine}`);
    if (producer && entry.target === HOST_RELEASE_TARGET) {
      // A host entry is valid for every host; the targets it can resolve to must declare the config.
      const hostTargets = producer.targets.filter((item) => item.buildType === entry.buildType);
      for (const key of Object.keys(entry.targetConfig ?? {}))
        for (const target of hostTargets)
          if (!declaredKeysOf(target).has(key))
            problems.push(`${at}: target ${target.id} does not declare config ${key}`);
    } else {
      const target = producer?.targets.find((item) => item.id === entry.target);
      if (producer && !target)
        problems.push(`${at}: ${entry.engine} has no target ${entry.target}`);
      if (target && target.buildType !== entry.buildType)
        problems.push(
          `${at}: target ${entry.target} builds ${target.buildType ?? "no build type"}, not ${entry.buildType}`,
        );
      if (target && entry.targetConfig)
        for (const key of Object.keys(entry.targetConfig))
          if (!declaredKeysOf(target).has(key))
            problems.push(`${at}: target ${entry.target} does not declare config ${key}`);
    }
    for (const [targetId, config] of Object.entries(entry.targetConfigs ?? {})) {
      const target = producer?.targets.find((item) => item.id === targetId);
      if (producer && !target) {
        problems.push(`${at}: ${entry.engine} has no target ${targetId}`);
        continue;
      }
      if (!target) continue;
      for (const key of Object.keys(config))
        if (!declaredKeysOf(target).has(key))
          problems.push(`${at}: target ${targetId} does not declare config ${key}`);
    }
    const pair = JSON.stringify([entry.buildType, entry.source ?? null]);
    if (pairs.has(pair))
      problems.push(
        `${at}: duplicate entry for build type ${entry.buildType}${entry.source ? ` from ${entry.source}` : ""}`,
      );
    pairs.add(pair);
  });
  return problems;
};
