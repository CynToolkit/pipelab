import { usePlugins } from '@@/plugins'
import { RendererPluginDefinition } from '../shared/libs/plugin-core'
import { access, mkdir, mkdtemp, realpath, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { tmpdir } from 'node:os'

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

export const ensure = async (filesPath: string, defaultContent = '{}') => {
  // create parent folder
  await mkdir(dirname(filesPath), {
    recursive: true
  })

  // ensure file exist
  try {
    await access(filesPath)
  } catch {
    // File doesn't exist, create it
    await writeFile(filesPath, defaultContent) // json
  }
}

export const generateTempFolder = async (base = tmpdir()) => {
  const realPath = await realpath(base)
  console.log('join', join(realPath, 'pipelab-'))
  return mkdtemp(join(realPath, 'pipelab-'))
}
