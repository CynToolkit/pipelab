import { shallowRef } from "vue";
import type { RendererPluginDefinition } from "./plugins/definitions.js";

type Plugin = RendererPluginDefinition;

const plugins = shallowRef<Plugin[]>([]);

export const usePlugins = () => {
  const load = () => {};

  const registerPlugins = (newPlugins: Plugin[]) => {
    plugins.value.push(...newPlugins);
  };

  return {
    load,
    registerPlugins,
    plugins,
  };
};
