import type { RendererProviderMetadata } from "@pipelab/shared";

/** Connection targets come from shipped provider metadata, independent of settings. */
export const buildIntegrationTargets = (providers: readonly RendererProviderMetadata[]) =>
  providers.flatMap((provider) => {
    const integrations = provider.integrations ?? [];
    return integrations.map((integration) => ({
      // This persisted field name is retained for existing connection compatibility.
      pluginName: provider.id,
      integrationName: integration.name,
      displayName:
        integrations.length > 1 ? `${provider.name} - ${integration.name}` : provider.name,
      icon: provider.icon,
      fields: integration.fields,
    }));
  });
