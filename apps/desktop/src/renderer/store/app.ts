import { defineStore } from "pinia";
import { createEventHook } from "@vueuse/core";
import { ref } from "vue";
import { useAPI } from "@renderer/composables/api";
import { RendererPluginDefinition } from "@plugins/plugin-core";
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
    const nodeGetResult = await api.execute('nodes:get')

    if (nodeGetResult.type === 'error') {
      throw new Error(nodeGetResult.ipcError)
    }

    const { result } = nodeGetResult
    const { nodes: nodeDefs } = result

    pluginDefinitions.value = nodeDefs

    //
    const presentResult = await api.execute('presets:get')
    if (presentResult.type === 'error') {
      throw new Error(presentResult.ipcError)
    }
    presets.value = presentResult.result

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
