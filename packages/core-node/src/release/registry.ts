import {
  type MainPluginDefinition,
  type PluginReleaseDefinition,
  type RendererPluginDefinition,
  type ReleaseRegistry,
} from "@pipelab/shared";
import { builtInReleaseDefinitions } from "./builtins";
import { assertUniqueProviderIds, builtInProviders } from "../providers-registry";

export const buildCoreReleaseRegistry = (
  plugins: Array<MainPluginDefinition | RendererPluginDefinition>,
): ReleaseRegistry => {
  assertUniqueProviderIds(plugins);
  const bundledProviderIds = new Set(builtInProviders.map((provider) => provider.id));
  const releaseDefinitions: PluginReleaseDefinition[] = [
    builtInReleaseDefinitions,
    ...builtInProviders.map((provider) => provider.release ?? {}),
    // Bundled providers are already sourced from their full definitions above.
    // The plugin store also contains their renderer metadata after startup.
    ...plugins
      .filter((plugin) => !bundledProviderIds.has(plugin.id))
      .map((plugin) => plugin.release ?? {}),
  ];
  return {
    sources: releaseDefinitions.flatMap((release) => release.sources ?? []),
    producers: releaseDefinitions.flatMap((release) => release.producers ?? []),
    destinations: releaseDefinitions.flatMap((release) => release.destinations ?? []),
  };
};
