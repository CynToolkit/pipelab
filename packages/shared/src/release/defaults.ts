import type { ReleaseRegistry } from "./types";

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
  /** Target id of the engine that the build enables. */
  target: string;
  /** Config merged into the enabled target of the created build. */
  targetConfig?: Record<string, unknown>;
}

/**
 * The defaults for empty destination slots, in priority order. For one slot the first entry that
 * can be chained to the slot wins; a source-specific entry replaces a generic one of the same build type.
 */
export const RELEASE_DEFAULTS: ReleaseDefaultEntry[] = [
  { buildType: "desktop", engine: "@pipelab/plugin-electron/producer", target: "windows-x64" },
  {
    buildType: "web",
    source: "construct",
    engine: "@pipelab/plugin-construct/producer",
    target: "web",
  },
  {
    buildType: "web",
    source: "godot",
    engine: "@pipelab/plugin-godot/producer",
    target: "web",
    targetConfig: { preset: "Web" },
  },
];

/**
 * Problems of a defaults table against a registry: unknown engines and targets, targets of another
 * build type, `targetConfig` keys the target does not declare, and duplicate (build type, source) pairs.
 * An empty result means every entry can be resolved.
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
    const target = producer?.targets.find((item) => item.id === entry.target);
    if (producer && !target) problems.push(`${at}: ${entry.engine} has no target ${entry.target}`);
    if (target && target.buildType !== entry.buildType)
      problems.push(
        `${at}: target ${entry.target} builds ${target.buildType ?? "no build type"}, not ${entry.buildType}`,
      );
    if (target && entry.targetConfig) {
      const declared = new Set([
        ...Object.keys(target.createDefaultConfig()),
        ...(target.fields ?? []).map((field) => field.key),
      ]);
      for (const key of Object.keys(entry.targetConfig))
        if (!declared.has(key))
          problems.push(`${at}: target ${entry.target} does not declare config ${key}`);
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
