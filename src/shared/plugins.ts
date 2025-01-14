import { shallowRef } from 'vue'
import { createNodeDefinition } from '../shared/libs/plugin-core'

const builtInPlugins = async () => {
  return (
    await Promise.all([
      (await import('../shared/libs/plugin-construct')).default,
      (await import('../shared/libs/plugin-filesystem')).default,
      (await import('../shared/libs/plugin-system')).default,
      (await import('../shared/libs/plugin-steam')).default,
      (await import('../shared/libs/plugin-itch')).default,
      (await import('../shared/libs/plugin-electron')).default,
      // (await import('../shared/libs/plugin-tauri')).default
    ])
  ).flat()
}

type Plugin = ReturnType<typeof createNodeDefinition>

const plugins = shallowRef<Plugin[]>([])

export const usePlugins = () => {
  const load = () => {}

  const registerBuiltIn = async () => {
    const builtIns = (await builtInPlugins()) as Plugin[]
    plugins.value.push(...builtIns)
  }

  return {
    load,
    registerBuiltIn,
    plugins
  }
}
