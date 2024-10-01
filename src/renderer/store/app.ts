import { defineStore } from "pinia";
import { createEventHook } from "@vueuse/core";
import { ref } from "vue";
import { useAPI } from "@renderer/composables/api";
import { RendererPluginDefinition } from "@pipelab/plugin-core";
import { Presets } from "@@/apis";
import { useLogger } from "@@/logger";

export const useAppStore = defineStore('app', () => {
  const { logger } = useLogger()

  /** Presets to load from */
  const presets = ref<Presets>()

  /** All the plugins definitions */
  const pluginDefinitions = ref<Array<RendererPluginDefinition>>([])

  const api = useAPI()

  const { on: onPresetsLoaded, trigger: triggerPresetsLoaded } = createEventHook()

  const init = async () => {
    //
    const { nodes: nodeDefs } = await api.execute('nodes:get')
    pluginDefinitions.value = nodeDefs

    //
    presets.value = await api.execute('presets:get')

    //
    triggerPresetsLoaded()
  }

  const getPluginDefinition = (pluginId: string) => {
    const result = pluginDefinitions.value.find((nodeDef) => {
      if (!pluginId) {
        logger().error('Missing origin: node', pluginId)
      }
      return nodeDef.id === pluginId
    })
    return result
  }

  const getNodeDefinition = (nodeId: string, pluginId: string) => {
    // const getNodeDefinition = <T extends Block>(node: T extends Block ? T : never) => {
    const plugin = getPluginDefinition(pluginId)
    if (plugin) {
      return plugin.nodes.find((pluginNode) => pluginNode.node.id === nodeId)
    }
    return undefined
  }

  return {
    presets,
    onPresetsLoaded,
    init,

    pluginDefinitions,

    getPluginDefinition,
    getNodeDefinition,
  }
})
