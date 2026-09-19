import type { MainPluginDefinition, RendererPluginDefinition } from "../plugins/definitions";
import type { ReleaseCatalog, ReleaseRegistry } from "./types";

export const buildReleaseRegistry = (
  plugins: Array<MainPluginDefinition | RendererPluginDefinition>,
): ReleaseRegistry => ({
  sources: plugins.flatMap((plugin) => plugin.release?.sources ?? []),
  producers: plugins.flatMap((plugin) => plugin.release?.producers ?? []),
  destinations: plugins.flatMap((plugin) => plugin.release?.destinations ?? []),
});

export const buildReleaseCatalog = (
  registry: ReleaseRegistry,
  host?: Parameters<NonNullable<ReleaseRegistry["producers"][number]["targets"][number]["isAvailable"]>>[0],
): import("./types").ReleaseCatalog => ({
  sources: registry.sources.map((source) => ({
    id: source.id,
    label: source.label,
    description: source.description,
    icon: source.icon,
    output: source.output,
    defaultConfig: source.createDefaultConfig(),
  })),
  producers: registry.producers.map((producer) => ({
    id: producer.id,
    label: producer.label,
    description: producer.description,
    icon: producer.icon,
    accepts: producer.accepts,
    defaultConfig: producer.createDefaultConfig(),
    targets: producer.targets.map((target) => ({
      id: target.id,
      label: target.label,
      output: target.output,
      defaultConfig: target.createDefaultConfig(),
      availability: host && target.isAvailable ? target.isAvailable(host) : undefined,
    })),
  })),
  destinations: registry.destinations.map((destination) => ({
    id: destination.id,
    label: destination.label,
    description: destination.description,
    icon: destination.icon,
    accepts: destination.accepts,
    defaultConfig: destination.createDefaultConfig(),
  })),
});
