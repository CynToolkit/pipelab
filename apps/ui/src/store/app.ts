import { defineStore } from "pinia";
import { ref, watch } from "vue";
import { useAPI } from "@renderer/composables/api";
import { useAgentAvailability } from "@renderer/composables/useAgentAvailability";
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
  const runtimeStatus = ref<"idle" | "loading" | "ready" | "error">("idle");
  const runtimeError = ref<string>();
  const providerStatus = ref<"idle" | "loading" | "ready" | "error">("idle");
  const providerError = ref<string>();
  let runtimePromise: Promise<void> | undefined;
  let providerPromise: Promise<void> | undefined;

  const api = useAPI();
  const agent = useAgentAvailability();
  let generation = 0;

  watch(
    agent.status,
    (status) => {
      if (status !== "ready") {
        generation++;
        runtimePromise = undefined;
        providerPromise = undefined;
        runtimeStatus.value = "idle";
        providerStatus.value = "idle";
      }
    },
    { flush: "sync" },
  );

  const loadRuntimeInfo = () => {
    if (!agent.isReady.value) return Promise.reject(new Error("Agent is not ready"));
    if (runtimeStatus.value === "ready") return Promise.resolve();
    if (runtimePromise) return runtimePromise;
    runtimeStatus.value = "loading";
    runtimeError.value = undefined;
    const requestGeneration = generation;
    runtimePromise = (async () => {
      try {
        const result = await api.execute("agent:version:get");
        if (requestGeneration !== generation || !agent.isReady.value) return;
        if (result.type === "error") throw new Error(result.ipcError);
        version.value = result.result.version;
        channel.value = result.result.channel;
        runtimeStatus.value = "ready";
      } catch (error) {
        if (requestGeneration !== generation) return;
        runtimeError.value = error instanceof Error ? error.message : String(error);
        runtimeStatus.value = "error";
        throw error;
      } finally {
        if (requestGeneration === generation) runtimePromise = undefined;
      }
    })();
    return runtimePromise;
  };

  const loadProviderDefinitions = () => {
    if (!agent.isReady.value) return Promise.reject(new Error("Agent is not ready"));
    if (providerStatus.value === "ready") return Promise.resolve();
    if (providerPromise) return providerPromise;
    providerStatus.value = "loading";
    providerError.value = undefined;
    const requestGeneration = generation;
    providerPromise = (async () => {
      try {
        const result = await api.execute("providers:metadata:get");
        if (requestGeneration !== generation || !agent.isReady.value) return;
        if (result.type === "error") throw new Error(result.ipcError);
        const { providers } = result.result;
        try {
          providerDefinitions.value = providers.map(transformProviderUrls);
        } catch (error) {
          logger().error("Failed to transform provider URLs:", error);
          providerDefinitions.value = providers;
        }
        providerStatus.value = "ready";
      } catch (error) {
        if (requestGeneration !== generation) return;
        providerError.value = error instanceof Error ? error.message : String(error);
        providerStatus.value = "error";
        throw error;
      } finally {
        if (requestGeneration === generation) providerPromise = undefined;
      }
    })();
    return providerPromise;
  };

  const init = () =>
    Promise.all([loadRuntimeInfo(), loadProviderDefinitions()]).then(() => undefined);

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
    loadRuntimeInfo,
    loadProviderDefinitions,

    providerDefinitions,
    channel,
    version,
    runtimeStatus,
    runtimeError,
    providerStatus,
    providerError,

    getProviderDefinition,
  };
});

export type AppStore = ReturnType<typeof useAppStore>;
