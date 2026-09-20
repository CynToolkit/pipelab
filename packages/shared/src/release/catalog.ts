import type { MainPluginDefinition, RendererPluginDefinition } from "../plugins/definitions";
import type { ReleaseRegistry } from "./types";

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
  buildTypes: [
    { id: "desktop", label: "Desktop" },
    { id: "web", label: "Web" },
    { id: "mobile", label: "Mobile" },
    { id: "console", label: "Console" },
  ],
  sources: registry.sources.map((source) => ({
    id: source.id,
    label: source.label,
    description: source.description,
    icon: source.icon,
    fields: source.fields,
    output: source.output,
    defaultConfig: source.createDefaultConfig(),
  })),
  producers: registry.producers.map((producer) => ({
    id: producer.id,
    label: producer.label,
    description: producer.description,
    icon: producer.icon,
    fields: producer.fields,
    accepts: producer.accepts,
    planning: producer.planning ?? { mode: "build" },
    defaultConfig: producer.createDefaultConfig(),
    targets: producer.targets.map((target) => ({
      id: target.id,
      label: target.label,
      buildType: target.buildType,
      output: target.output,
      transform: target.transform,
      defaultConfig: target.createDefaultConfig(),
      fields: target.fields,
      availability: host && target.isAvailable ? target.isAvailable(host) : undefined,
    })),
  })),
  destinations: registry.destinations.map((destination) => ({
    id: destination.id,
    label: destination.label,
    description: destination.description,
    icon: destination.icon,
    fields: destination.fields,
    slotFields: destination.slotFields,
    accepts: destination.accepts,
    defaultConfig: destination.createDefaultConfig(),
  })),
});
