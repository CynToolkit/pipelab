import type { ProviderReleaseDefinition, ReleaseRegistry } from "@pipelab/shared";
import { builtInReleaseDefinitions } from "./builtins";
import { builtInProviders } from "../providers-registry";

export const assertUniqueReleaseIds = (
  contributionType: "source" | "producer" | "destination",
  ids: readonly string[],
): void => {
  const seen = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) {
      throw new Error(`Duplicate Release ${contributionType} ID: ${id}`);
    }
    seen.add(id);
  }
};

export const buildCoreReleaseRegistry = (): ReleaseRegistry => {
  const definitions: ProviderReleaseDefinition[] = [
    builtInReleaseDefinitions,
    ...builtInProviders.map((provider) => provider.release ?? {}),
  ];
  const registry: ReleaseRegistry = {
    sources: definitions.flatMap((release) => release.sources ?? []),
    producers: definitions.flatMap((release) => release.producers ?? []),
    destinations: definitions.flatMap((release) => release.destinations ?? []),
  };

  assertUniqueReleaseIds(
    "source",
    registry.sources.map((source) => source.id),
  );
  assertUniqueReleaseIds(
    "producer",
    registry.producers.map((producer) => producer.id),
  );
  assertUniqueReleaseIds(
    "destination",
    registry.destinations.map((destination) => destination.id),
  );

  return registry;
};
