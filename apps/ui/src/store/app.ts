import { defineStore } from "pinia";
import { ref } from "vue";
import { useAPI } from "@renderer/composables/api";
import { RendererPluginMetadata, useLogger, transformUrl, ReleaseChannel } from "@pipelab/shared";

const transformPluginUrls = (plugin: RendererPluginMetadata): RendererPluginMetadata => {
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
  };
};

export const useAppStore = defineStore("app", () => {
  const { logger } = useLogger();

  /** All the plugins definitions */
  const pluginDefinitions = ref<Array<RendererPluginMetadata>>([]);

  const channel = ref<ReleaseChannel>("stable");
  const version = ref<string>("");

  const api = useAPI();

  const init = async () => {
    try {
      const versionResult = await api.execute("agent:version:get");
      if (versionResult.type === "success") {
        version.value = versionResult.result.version;
        channel.value = versionResult.result.channel;
      }
    } catch (e) {
      logger().error("Failed to fetch version and channel:", e);
    }

    //
    const metadataResult = await api.execute("plugins:metadata:get");

    if (metadataResult.type === "error") {
      throw new Error(metadataResult.ipcError);
    }

    const { plugins } = metadataResult.result;

    try {
      pluginDefinitions.value = plugins.map(transformPluginUrls);
    } catch (err) {
      logger().error("Failed to transform plugin URLs on startup:", err);
      pluginDefinitions.value = plugins;
    }

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

  return {
    init,

    pluginDefinitions,
    channel,
    version,

    getPluginDefinition,
  };
});

export type AppStore = ReturnType<typeof useAppStore>;
