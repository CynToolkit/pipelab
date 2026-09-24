import {
  type MainPluginDefinition,
  type PluginReleaseDefinition,
  type RendererPluginDefinition,
  type ReleaseRegistry,
} from "@pipelab/shared";
import { builtInReleaseDefinitions } from "./builtins";

const FILESYSTEM_PLUGIN_ID = "@pipelab/plugin-filesystem";

export const buildCoreReleaseRegistry = (
  plugins: Array<MainPluginDefinition | RendererPluginDefinition>,
): ReleaseRegistry => {
  const releaseDefinitions: PluginReleaseDefinition[] = plugins.map((plugin) =>
    plugin.id === FILESYSTEM_PLUGIN_ID ? builtInReleaseDefinitions : (plugin.release ?? {}),
  );
  if (!plugins.some((plugin) => plugin.id === FILESYSTEM_PLUGIN_ID)) {
    releaseDefinitions.unshift(builtInReleaseDefinitions);
  }
  return {
    sources: releaseDefinitions.flatMap((release) => release.sources ?? []),
    producers: releaseDefinitions.flatMap((release) => release.producers ?? []),
    destinations: releaseDefinitions.flatMap((release) => release.destinations ?? []),
  };
};
