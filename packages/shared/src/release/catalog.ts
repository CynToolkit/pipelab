import type { ProviderDefinition, RendererProviderMetadata } from "../plugins/definitions";
import type { ReleaseRegistry } from "./types";

export const buildReleaseRegistry = (
  providers: Array<ProviderDefinition | RendererProviderMetadata>,
): ReleaseRegistry => ({
  sources: providers.flatMap((provider) => provider.release?.sources ?? []),
  producers: providers.flatMap((provider) => provider.release?.producers ?? []),
  destinations: providers.flatMap((provider) => provider.release?.destinations ?? []),
});

export const buildReleaseCatalog = (
  registry: ReleaseRegistry,
  host?: Parameters<
    NonNullable<ReleaseRegistry["producers"][number]["targets"][number]["isAvailable"]>
  >[0],
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
    requiresAgentInspection: Boolean(source.inspect),
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
    requiresAgentInspection: Boolean(producer.inspect),
    targets: producer.targets.map((target) => ({
      id: target.id,
      label: target.label,
      buildType: target.buildType,
      output: target.output,
      transform: target.transform,
      defaultConfig: target.createDefaultConfig(),
      fields: target.fields,
      availability: host && target.isAvailable ? target.isAvailable(host) : undefined,
      availabilityStatus: target.isAvailable && !host ? "unknown" : undefined,
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

const mergeCatalogItems = <T extends { id: string }>(
  bundled: T[],
  runtime: T[],
  merge: (bundled: T, runtime: T) => T,
): T[] => {
  const bundledById = new Map(bundled.map((item) => [item.id, item]));
  const runtimeIds = new Set(runtime.map((item) => item.id));
  return [
    ...runtime.map((item) => {
      const base = bundledById.get(item.id);
      return base ? merge(base, item) : item;
    }),
    ...bundled.filter((item) => !runtimeIds.has(item.id)),
  ];
};

/** Keep packaged product metadata while layering runtime-only catalog capabilities. */
export const mergeReleaseCatalog = (
  bundled: import("./types").ReleaseCatalog,
  runtime: import("./types").ReleaseCatalog,
): import("./types").ReleaseCatalog => {
  const mergeDefinition = <
    T extends {
      id: string;
      fields?: unknown[];
      defaultConfig: Record<string, unknown>;
    },
  >(
    base: T,
    current: T,
  ): T => ({
    ...current,
    ...base,
    defaultConfig: { ...current.defaultConfig, ...base.defaultConfig },
  });
  return {
    buildTypes: mergeCatalogItems(bundled.buildTypes, runtime.buildTypes, (base, current) => ({
      ...current,
      ...base,
    })),
    sources: mergeCatalogItems(bundled.sources, runtime.sources, mergeDefinition),
    producers: mergeCatalogItems(bundled.producers, runtime.producers, (base, current) => ({
      ...mergeDefinition(base, current),
      targets: mergeCatalogItems(base.targets, current.targets, (baseTarget, currentTarget) => ({
        ...currentTarget,
        ...baseTarget,
        availability: currentTarget.availability,
        availabilityStatus: currentTarget.availabilityStatus,
        defaultConfig: { ...currentTarget.defaultConfig, ...baseTarget.defaultConfig },
      })),
    })),
    destinations: mergeCatalogItems(
      bundled.destinations,
      runtime.destinations,
      (base, current) => ({
        ...mergeDefinition(base, current),
      }),
    ),
  };
};
