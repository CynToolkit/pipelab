import {
  type MainPluginDefinition,
  type PluginReleaseDefinition,
  type RendererPluginDefinition,
  type ReleaseRegistry,
} from "@pipelab/shared";
import { builtInReleaseDefinitions } from "./builtins";

export const buildCoreReleaseRegistry = (
  plugins: Array<MainPluginDefinition | RendererPluginDefinition>,
): ReleaseRegistry => {
  const releaseDefinitions: PluginReleaseDefinition[] = [
    builtInReleaseDefinitions,
    ...plugins.map((plugin) => plugin.release ?? {}),
  ];
  return {
    sources: releaseDefinitions.flatMap((release) => release.sources ?? []),
    producers: releaseDefinitions.flatMap((release) => release.producers ?? []),
    destinations: releaseDefinitions.flatMap((release) => release.destinations ?? []),
  };
};
