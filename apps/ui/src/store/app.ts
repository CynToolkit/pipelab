import { defineStore } from "pinia";
import { ref, watch } from "vue";
import { useAPI } from "@renderer/composables/api";
import { useAgentAvailability } from "@renderer/composables/useAgentAvailability";
import {
  mergeReleaseCatalog,
  type ReleaseCatalog,
  type ReleaseChannel,
  type RendererProviderMetadata,
  useLogger,
  transformUrl,
} from "@pipelab/shared";
import type { IntegrationDefinition } from "@pipelab/shared";
import browserProviderSpecs from "@renderer/generated/release-provider-specs";

const transformProviderUrls = (provider: RendererProviderMetadata): RendererProviderMetadata => {
  const transformedIcon =
    provider.icon?.type === "image"
      ? {
          ...provider.icon,
          image: transformUrl(provider.icon.image),
        }
      : provider.icon;

  return {
    id: provider.id,
    name: provider.name,
    icon: transformedIcon,
    description: provider.description,
    isOfficial: provider.isOfficial,
    packageName: provider.packageName,
    integrations: provider.integrations,
  };
};

const mergeProviderMetadata = (
  bundled: RendererProviderMetadata[],
  runtime: RendererProviderMetadata[],
): RendererProviderMetadata[] => {
  const bundledById = new Map(bundled.map((provider) => [provider.id, provider]));
  const runtimeIds = new Set(runtime.map((provider) => provider.id));
  return [
    ...runtime.map((provider) => {
      const base = bundledById.get(provider.id);
      if (!base) return transformProviderUrls(provider);
      return {
        ...base,
        integrations: mergeIntegrations(base.integrations ?? [], provider.integrations ?? []),
      };
    }),
    ...bundled.filter((provider) => !runtimeIds.has(provider.id)),
  ];
};

const mergeIntegrations = (
  bundled: IntegrationDefinition[],
  runtime: IntegrationDefinition[],
): IntegrationDefinition[] => {
  const bundledByName = new Map(bundled.map((integration) => [integration.name, integration]));
  const runtimeNames = new Set(runtime.map((integration) => integration.name));
  return [
    ...runtime.map((integration) => {
      const base = bundledByName.get(integration.name);
      if (!base) return integration;
      const bundledFields = new Map(base.fields.map((field) => [field.key, field]));
      const runtimeKeys = new Set(integration.fields.map((field) => field.key));
      return {
        ...integration,
        ...base,
        fields: [
          ...integration.fields.map((field) => bundledFields.get(field.key) ?? field),
          ...base.fields.filter((field) => !runtimeKeys.has(field.key)),
        ],
      };
    }),
    ...bundled.filter((integration) => !runtimeNames.has(integration.name)),
  ];
};

export const useAppStore = defineStore("app", () => {
  const { logger } = useLogger();

  /** Built-in provider metadata */
  const bundledProviders: RendererProviderMetadata[] = browserProviderSpecs.providers;
  const providerDefinitions = ref<Array<RendererProviderMetadata>>([...bundledProviders]);
  const releaseCatalog = ref<ReleaseCatalog>(browserProviderSpecs.catalog);

  const channel = ref<ReleaseChannel>("stable");
  const version = ref<string>("");
  const runtimeStatus = ref<"idle" | "loading" | "ready" | "error">("idle");
  const runtimeError = ref<string>();
  const providerStatus = ref<"idle" | "loading" | "ready" | "error">("ready");
  const providerError = ref<string>();
  let runtimePromise: Promise<void> | undefined;
  let providerPromise: Promise<void> | undefined;
  let catalogPromise: Promise<ReleaseCatalog> | undefined;

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
        catalogPromise = undefined;
        releaseCatalog.value = browserProviderSpecs.catalog;
        runtimeStatus.value = "idle";
        providerDefinitions.value = [...bundledProviders];
        providerStatus.value = "ready";
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
    if (!agent.isReady.value) return Promise.resolve();
    if (providerStatus.value === "ready" && providerAgentGeneration === generation)
      return Promise.resolve();
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
        providerDefinitions.value = mergeProviderMetadata(bundledProviders, providers);
        providerStatus.value = "ready";
        providerAgentGeneration = generation;
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

  let providerAgentGeneration = -1;
  const loadReleaseCatalog = () => {
    if (!agent.isReady.value) return Promise.resolve(browserProviderSpecs.catalog);
    if (catalogPromise) return catalogPromise;
    const requestGeneration = generation;
    catalogPromise = (async () => {
      try {
        const result = await api.execute("release:catalog:get");
        if (result.type === "error") throw new Error(result.ipcError);
        if (requestGeneration !== generation || !agent.isReady.value)
          return browserProviderSpecs.catalog;
        releaseCatalog.value = mergeReleaseCatalog(browserProviderSpecs.catalog, result.result);
        return releaseCatalog.value;
      } catch (error) {
        if (requestGeneration === generation)
          logger().warn("Failed to load runtime Release catalog:", error);
        throw error;
      } finally {
        if (requestGeneration === generation) catalogPromise = undefined;
      }
    })();
    return catalogPromise;
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
    loadReleaseCatalog,

    providerDefinitions,
    releaseCatalog,
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
