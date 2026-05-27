import { shallowRef } from "vue";
import type { RendererPluginDefinition } from "./plugins/definitions.js";

type Plugin = RendererPluginDefinition;

const plugins = shallowRef<Plugin[]>([]);

export const usePlugins = () => {
  const load = () => {};

  const registerPlugins = (newPlugins: Plugin[]) => {
    const current = [...plugins.value];
    for (const np of newPlugins) {
      const idx = current.findIndex((p) => p.id === np.id);
      if (idx !== -1) {
        current[idx] = np;
      } else {
        current.push(np);
      }
    }
    plugins.value = current;
  };

  return {
    load,
    registerPlugins,
    plugins,
  };
};
