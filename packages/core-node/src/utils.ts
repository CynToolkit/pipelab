import { builtInProviders } from "./providers-registry";
import { transformUrl, type RendererProviderMetadata } from "@pipelab/shared";

export const toRendererProviderMetadata = (
  provider: RendererProviderMetadata,
): RendererProviderMetadata => ({
  id: provider.id,
  name: provider.name,
  icon:
    provider.icon.type === "image"
      ? { ...provider.icon, image: transformUrl(provider.icon.image) }
      : provider.icon,
  description: provider.description,
  isOfficial: provider.isOfficial,
  packageName: provider.packageName,
  integrations: provider.integrations,
  release: provider.release,
});

export const getProviderMetadata = (): RendererProviderMetadata[] =>
  builtInProviders.map(toRendererProviderMetadata);
