import { usePlugins } from '@@/plugins'
import { RendererPluginDefinition } from '../shared/libs/plugin-core'

export const getFinalPlugins = () => {
  const { plugins } = usePlugins()
  // console.log('plugins.value', plugins.value)

  const finalPlugins: RendererPluginDefinition[] = []

  for (const plugin of Object.values(plugins.value)) {
    const finalNodes: RendererPluginDefinition['nodes'][number][] = []
    // console.log('/*')
    // console.log('node', node.definition)
    // console.log('node', JSON.stringify(node.definition, undefined, 2))
    // console.log('*/')

    // send without runner
    for (const element of plugin.nodes) {
      const { node, disabled, advanced } = element
      finalNodes.push({
        node,
        disabled: disabled ?? false,
        advanced: advanced ?? false
      })
    }

    finalPlugins.push({
      ...plugin,
      nodes: finalNodes
    })
  }

  return finalPlugins
}
