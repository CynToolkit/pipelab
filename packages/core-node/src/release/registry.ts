import type { ProviderReleaseDefinition, ReleaseRegistry } from "@pipelab/shared";
import { builtInReleaseDefinitions } from "./builtins";
import { builtInProviders } from "../providers-registry";

export const buildCoreReleaseRegistry = (): ReleaseRegistry => {
  const definitions: ProviderReleaseDefinition[] = [
    builtInReleaseDefinitions,
    ...builtInProviders.map((provider) => provider.release ?? {}),
  ];
  return {
    sources: definitions.flatMap((release) => release.sources ?? []),
    producers: definitions.flatMap((release) => release.producers ?? []),
    destinations: definitions.flatMap((release) => release.destinations ?? []),
  };
};
