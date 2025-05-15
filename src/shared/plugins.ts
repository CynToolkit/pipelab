import { shallowRef } from 'vue'
import { createNodeDefinition } from '../shared/libs/plugin-core'
import { is } from '@electron-toolkit/utils'

const builtInPlugins = async () => {
  const base = [
    (await import('./libs/plugin-construct')).default,
    (await import('./libs/plugin-filesystem')).default,
    (await import('./libs/plugin-system')).default,
    (await import('./libs/plugin-steam')).default,
    (await import('./libs/plugin-itch')).default,
    (await import('./libs/plugin-electron')).default,
    (await import('./libs/plugin-discord')).default,
    (await import('./libs/plugin-poki')).default,
    (await import('./libs/plugin-nvpatch')).default
  ]

  if (is.dev) {
    base.push((await import('./libs/plugin-tauri')).default)
    base.push((await import('./libs/plugin-netlify')).default)
  }

  return (await Promise.all([...base])).flat()
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

export type OutputRuntimes = 'construct' | 'godot'

export const detectRuntime = async (
  appFolder: string | undefined
): Promise<OutputRuntimes | undefined> => {
  const { fileExists } = await import('@@/libs/plugin-core')
  const { join } = await import('node:path')

  let detectedRuntime: OutputRuntimes | undefined = undefined
  if (appFolder) {
    const indexExist = await fileExists(join(appFolder, 'index.html'))
    const swExist = await fileExists(join(appFolder, 'sw.js'))
    const offlineJSON = await fileExists(join(appFolder, 'offline.json'))
    const dataJSON = await fileExists(join(appFolder, 'data.json'))
    const scriptsFolder = await fileExists(join(appFolder, 'scripts'))
    const workermainJs = await fileExists(join(appFolder, 'workermain.js'))

    if (!indexExist) {
      throw new Error('The input folder does not contain an index.html file')
    }

    if (swExist || dataJSON || workermainJs || scriptsFolder) {
      detectedRuntime = 'construct'
    }

    console.log('Detected runtime', detectedRuntime)

    if (detectedRuntime === 'construct' && offlineJSON && swExist) {
      throw new Error(
        'Construct runtime detected, please disable offline capabilties when using HTML5 export. Offline is already supported by default.'
      )
    }
  }
  return detectedRuntime
}
