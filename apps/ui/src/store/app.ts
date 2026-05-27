import { defineStore } from "pinia";
import { createEventHook } from "@vueuse/core";
import { ref } from "vue";
import { useAPI } from "@renderer/composables/api";
import { RendererPluginDefinition, Presets, useLogger, transformUrl } from "@pipelab/shared";

const transformPluginUrls = (plugin: RendererPluginDefinition): RendererPluginDefinition => {
  if (!plugin) return plugin;

  const transformedNodes = (plugin.nodes || []).map((nodeDef) => {
    if (!nodeDef || !nodeDef.node) return nodeDef;
    return {
      ...nodeDef,
      node: {
        ...nodeDef.node,
        icon: transformUrl(nodeDef.node.icon),
      },
    };
  });

  const transformedIcon =
    plugin.icon?.type === "image"
      ? {
          ...plugin.icon,
          image: transformUrl(plugin.icon.image),
        }
      : plugin.icon;

  return {
    ...plugin,
    icon: transformedIcon,
    nodes: transformedNodes,
  };
};

export const useAppStore = defineStore("app", () => {
  const { logger } = useLogger();

  /** Presets to load from */
  const presets = ref<Presets>();

  /** All the plugins definitions */
  const pluginDefinitions = ref<Array<RendererPluginDefinition>>([]);

  const api = useAPI();

  const { on: onPresetsLoaded, trigger: triggerPresetsLoaded } = createEventHook();

  const init = async () => {
    //
    const nodeGetResult = await api.execute("nodes:get");

    if (nodeGetResult.type === "error") {
      throw new Error(nodeGetResult.ipcError);
    }

    const { result } = nodeGetResult;
    const { nodes: nodeDefs } = result;

    try {
      pluginDefinitions.value = (nodeDefs || []).map(transformPluginUrls);
    } catch (err) {
      logger().error("Failed to transform plugin URLs on startup:", err);
      pluginDefinitions.value = nodeDefs || [];
    }

    //
    const presentResult = await api.execute("presets:get");
    if (presentResult.type === "error") {
      throw new Error(presentResult.ipcError);
    }
    presets.value = presentResult.result;

    //
    triggerPresetsLoaded();

    // Listen for dynamically loaded plugins in the background
    api.on("plugin:loaded", (event: any) => {
      if (event && event.plugin) {
        const transformedPlugin = transformPluginUrls(event.plugin);
        const index = pluginDefinitions.value.findIndex((p) => p.id === transformedPlugin.id);
        if (index !== -1) {
          pluginDefinitions.value[index] = transformedPlugin;
        } else {
          pluginDefinitions.value.push(transformedPlugin);
        }
      }
    });
  };

  const getPluginDefinition = (pluginId: string) => {
    const result = pluginDefinitions.value.find((nodeDef) => {
      if (!pluginId) {
        logger().error("Missing origin: node", pluginId);
      }
      return nodeDef.id === pluginId;
    });
    return result;
  };

  const getNodeDefinition = (nodeId: string, pluginId: string) => {
    // const getNodeDefinition = <T extends Block>(node: T extends Block ? T : never) => {
    const plugin = getPluginDefinition(pluginId);
    if (plugin) {
      return plugin.nodes.find((pluginNode) => pluginNode.node.id === nodeId);
    }
    return undefined;
  };

  return {
    presets,
    onPresetsLoaded,
    init,

    pluginDefinitions,

    getPluginDefinition,
    getNodeDefinition,
  };
});

export type AppStore = ReturnType<typeof useAppStore>;
