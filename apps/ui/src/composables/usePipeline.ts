import { EnhancedFile, SavedFile } from "@pipelab/shared";
import { AppStore, useAppStore } from "@renderer/store/app";

export function isDefaultPipeline(
  pipeline: EnhancedFile<any>,
): pipeline is EnhancedFile<SavedFile> {
  return !(pipeline.content as any).type || (pipeline.content as any).type === "default";
}

export const usePipeline = () => {
  const appStore = useAppStore();
  const { getPluginDefinition } = appStore;

  const context: Context = {
    getPluginDefinition,
  };

  function createPipeline(pipeline: EnhancedFile<any>) {
    return useDefaultPipeline(pipeline, context);
  }

  return {
    createPipeline,
  };
};

interface UsePipeline {
  getIcons: () => any[];
}

interface Context {
  getPluginDefinition: AppStore["getPluginDefinition"];
}

export const useDefaultPipeline = (
  pipeline: EnhancedFile<SavedFile>,
  context: Context,
): UsePipeline => {
  const getIcons = () => {
    const icons: any[] = [];
    if (!pipeline?.content?.canvas?.blocks) return icons;
    const blocks = pipeline.content.canvas.blocks;
    for (const node of blocks) {
      const def = context.getPluginDefinition(node.origin.pluginId);
      if (def && def.icon) {
        icons.push({ origin: node.origin, ...def.icon });
      }
    }
    if (icons.length > 4) {
      return icons
        .slice(0, 3)
        .concat({ type: "icon", icon: "mdi-plus", origin: { nodeId: "0", pluginId: "0" } });
    }
    return icons;
  };

  return {
    getIcons,
  };
};
