import { EnhancedFile, SavedFileDefault, SavedFileSimple } from '@@/model'
import { AppStore, useAppStore } from '@renderer/store/app'

export function isSimplePipeline(
  pipeline: EnhancedFile
): pipeline is EnhancedFile<SavedFileSimple> {
  return pipeline.content.type === 'simple'
}

export function isDefaultPipeline(
  pipeline: EnhancedFile
): pipeline is EnhancedFile<SavedFileDefault> {
  return pipeline.content.type === 'default'
}

export const usePipeline = () => {
  const appStore = useAppStore()
  const { getPluginDefinition } = appStore

  const context: Context = {
    getPluginDefinition
  }

  function createPipeline(pipeline: EnhancedFile) {
    if (isSimplePipeline(pipeline)) {
      return useSimplePipeline(pipeline, context)
    } else if (isDefaultPipeline(pipeline)) {
      return useDefaultPipeline(pipeline, context)
    } else {
      throw new Error('Invalid pipeline type' + pipeline.content.type)
    }
  }

  return {
    createPipeline
  }
}

interface UsePipeline {
  getIcons: () => any[]
}

interface Context {
  getPluginDefinition: AppStore['getPluginDefinition']
}

export const useSimplePipeline = (
  pipeline: EnhancedFile<SavedFileSimple>,
  context: Context
): UsePipeline => {
  return {
    getIcons: () => []
  }
}

export const useDefaultPipeline = (
  pipeline: EnhancedFile<SavedFileDefault>,
  context: Context
): UsePipeline => {
  const getIcons = () => {
    const icons: any[] = []
    if (!pipeline?.content?.canvas?.blocks) return icons
    const blocks = pipeline.content.canvas.blocks
    for (const node of blocks) {
      const def = context.getPluginDefinition(node.origin.pluginId)
      if (def && def.icon) {
        icons.push({ origin: node.origin, ...def.icon })
      }
    }
    if (icons.length > 4) {
      return icons
        .slice(0, 3)
        .concat({ type: 'icon', icon: 'mdi-plus', origin: { nodeId: '0', pluginId: '0' } })
    }
    return icons
  }

  return {
    getIcons
  }
}
