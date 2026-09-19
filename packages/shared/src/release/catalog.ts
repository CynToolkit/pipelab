import type { MainPluginDefinition, RendererPluginDefinition } from "../plugins/definitions";
import type { ReleaseCatalog } from "./types";

export const buildReleaseCatalog = (plugins: Array<MainPluginDefinition | RendererPluginDefinition>): ReleaseCatalog => ({
  sources: plugins.flatMap((plugin) => plugin.release?.sources ?? []),
  producers: plugins.flatMap((plugin) => plugin.release?.producers ?? []),
  destinations: plugins.flatMap((plugin) => plugin.release?.destinations ?? []),
});
