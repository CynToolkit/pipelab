import {
  usePlugins,
  transformUrl,
  type MainPluginDefinition,
  type RendererPluginMetadata,
} from "@pipelab/shared";

export const toRendererPluginMetadata = (
  plugin: MainPluginDefinition | RendererPluginMetadata,
): RendererPluginMetadata => ({
  id: plugin.id,
  name: plugin.name,
  icon:
    plugin.icon.type === "image"
      ? { ...plugin.icon, image: transformUrl(plugin.icon.image) }
      : plugin.icon,
  description: plugin.description,
  isOfficial: plugin.isOfficial,
  packageName: plugin.packageName,
  integrations: plugin.integrations,
  release: plugin.release,
});

export const getPluginMetadata = (): RendererPluginMetadata[] => {
  const { plugins } = usePlugins();
  return plugins.value.map(toRendererPluginMetadata);
};
