import { defineStore } from "pinia";
import { ref } from "vue";
import { useAPI } from "@renderer/composables/api";
import { RendererProviderMetadata, useLogger, transformUrl, ReleaseChannel } from "@pipelab/shared";

const transformProviderUrls = (provider: RendererProviderMetadata): RendererProviderMetadata => {
  const transformedIcon =
    provider.icon?.type === "image"
      ? {
          ...provider.icon,
          image: transformUrl(provider.icon.image),
        }
      : provider.icon;

  return {
    ...provider,
    icon: transformedIcon,
  };
};

export const useAppStore = defineStore("app", () => {
  const { logger } = useLogger();

  /** Built-in provider metadata */
  const providerDefinitions = ref<Array<RendererProviderMetadata>>([]);

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

    const metadataResult = await api.execute("providers:metadata:get");

    if (metadataResult.type === "error") {
      throw new Error(metadataResult.ipcError);
    }

    const { providers } = metadataResult.result;

    try {
      providerDefinitions.value = providers.map(transformProviderUrls);
    } catch (err) {
      logger().error("Failed to transform provider URLs on startup:", err);
      providerDefinitions.value = providers;
    }
  };

  const getProviderDefinition = (providerId: string) => {
    const result = providerDefinitions.value.find((nodeDef) => {
      if (!providerId) {
        logger().error("Missing origin: node", providerId);
      }
      return nodeDef.id === providerId;
    });
    return result;
  };

  return {
    init,

    providerDefinitions,
    channel,
    version,

    getProviderDefinition,
  };
});

export type AppStore = ReturnType<typeof useAppStore>;
