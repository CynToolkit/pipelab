import type { ReleaseConfig, ReleaseHostContext, ReleaseRegistry } from "./types";

/**
 * Build targets this host cannot produce (for example macOS on Linux) are turned off, and so is
 * every deployment that takes one of their outputs. A workflow saved on another machine then
 * plans and runs here with what this host can build, instead of failing on the missing targets.
 */
export const withoutHostUnavailableBuilds = (
  config: ReleaseConfig,
  registry: ReleaseRegistry,
  host: ReleaseHostContext,
): ReleaseConfig => {
  const unavailable = new Set<string>();
  const builds = config.builds.map((build) => {
    const producer = registry.producers.find((candidate) => candidate.id === build.engine);
    return {
      ...build,
      targets: build.targets.filter((target) => {
        const definition = producer?.targets.find((candidate) => candidate.id === target.id);
        if (!definition?.isAvailable || definition.isAvailable(host).available) return true;
        unavailable.add(`${build.id}\0${target.id}`);
        return false;
      }),
    };
  });
  if (!unavailable.size) return config;
  return {
    ...config,
    builds,
    destinations: config.destinations.map((destination) => ({
      ...destination,
      slots: destination.slots.map((slot) =>
        slot.input &&
        "buildId" in slot.input &&
        unavailable.has(`${slot.input.buildId}\0${slot.input.targetId}`)
          ? { ...slot, enabled: false }
          : slot,
      ),
    })),
  };
};
