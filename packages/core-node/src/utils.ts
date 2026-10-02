import { usePlugins, RendererPluginDefinition, transformUrl } from "@pipelab/shared";

export const getFinalPlugins = () => {
  const { plugins } = usePlugins();
  // console.log('plugins.value', plugins.value)

  const finalPlugins: RendererPluginDefinition[] = [];

  for (const plugin of plugins.value) {
    const finalNodes = [];

    const finalIcon =
      plugin.icon?.type === "image"
        ? {
            ...plugin.icon,
            image: transformUrl(plugin.icon.image),
          }
        : plugin.icon;

    for (const nodeDef of plugin.nodes) {
      const node = nodeDef.node;
      finalNodes.push({
        ...nodeDef,
        node: {
          ...node,
          icon: transformUrl(node.icon),
        },
      });
    }

    finalPlugins.push({
      ...plugin,
      icon: finalIcon,
      nodes: finalNodes,
    });
  }

  return finalPlugins;
};
