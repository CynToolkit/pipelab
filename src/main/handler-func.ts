import { End } from '@@/apis'
import {
  Action,
  ActionRunner,
  Condition,
  ConditionRunner,
  InputsDefinition
} from '@@/libs/plugin-core'
import { usePlugins } from '@@/plugins'
import { isRequired } from '@@/validation'
import { mkdir } from 'node:fs/promises'
import { assetsPath, unpackPath } from './paths'
import { useLogger } from '@@/logger'
import { BrowserWindow } from 'electron'
import { usePluginAPI } from './api'
import { BlockCondition } from '@@/model'
import { HandleListenerSendFn } from './handlers'
import { ensureNodeJS, generateTempFolder } from './utils'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { setupConfig } from './config'

const checkParams = (definitionParams: InputsDefinition, elementParams: Record<string, string>) => {
  // get a list of all required params
  let expected = Object.keys(definitionParams)

  const found: string[] = []
  // for each param in elementParams
  for (const param of Object.keys(elementParams)) {
    // if the param is in the expected list
    if (expected.includes(param)) {
      // add to found
      found.push(param)
      // remove from expected
      expected = expected.filter((x) => x !== param)
    } else {
      // throw new Error('Unexpected param "' + param + '"')
      console.warn('Unexpected param "' + param + '"')
    }
  }

  for (const param of expected) {
    if (isRequired(definitionParams[param])) {
      throw new Error('Missing param "' + param + '"')
    }
  }
}

export const handleConditionExecute = async (
  nodeId: string,
  pluginId: string,
  params: BlockCondition['params']
  // { send }: { send: HandleListenerSendFn<'condition:execute'> }
): Promise<End<'condition:execute'>> => {
  const { plugins } = usePlugins()
  const { logger } = useLogger()

  const node = plugins.value
    .find((plugin) => plugin.id === pluginId)
    ?.nodes.find((node) => node.node.id === nodeId) as
    | {
        node: Condition
        runner: ConditionRunner<any>
      }
    | undefined

  if (!node) {
    return {
      type: 'error',
      ipcError: 'Node not found'
    }
  }

  const tmp = await generateTempFolder(tmpdir())

  await mkdir(tmp, {
    recursive: true
  })

  try {
    checkParams(node.node.params, params)
    const resolvedInputs = params // await resolveConditionInputs(params, node.node, steps)

    const result = await node.runner({
      inputs: resolvedInputs,
      log: (...args) => {
        logger().info(`[${node.node.name}]`, ...args)
      },
      meta: {
        definition: ''
      },
      setMeta: () => {
        logger().info('set meta defined here')
      },
      cwd: tmp
    })

    return {
      type: 'success',
      result: {
        outputs: {},
        value: result
      }
    }
  } catch (e) {
    logger().error('Error in condition execution:', e)
    return {
      type: 'error',
      ipcError: e
    }
  }
}

export const handleActionExecute = async (
  nodeId: string,
  pluginId: string,
  params: Record<string, string>,
  mainWindow: BrowserWindow | undefined,
  send: HandleListenerSendFn<'action:execute'>,
  abortSignal: AbortSignal
): Promise<End<'action:execute'>> => {
  const { plugins } = usePlugins()
  const { logger } = useLogger()
  const settings = await setupConfig()
  const config = await settings.getConfig()

  mainWindow?.setProgressBar(1, {
    mode: 'indeterminate'
  })

  const node = plugins.value
    .find((plugin) => plugin.id === pluginId)
    ?.nodes.find((node) => node.node.id === nodeId) as
    | {
        node: Action
        runner: ActionRunner<any>
      }
    | undefined

  if (!node) {
    mainWindow?.setProgressBar(1, { mode: 'normal' })
    return {
      type: 'error',
      ipcError: 'Node not found'
    }
  }

  const tmp = await generateTempFolder(config.cacheFolder)

  const _assetsPath = await assetsPath()
  const _unpackPath = await unpackPath()
  const nodePath = await ensureNodeJS()
  const modulesPath = join(_unpackPath, 'node_modules')
  const pnpm = join(modulesPath, 'pnpm', 'bin', 'pnpm.cjs')
  const outputs: Record<string, unknown> = {}
  const api = usePluginAPI(mainWindow)

  try {
    await mkdir(tmp, { recursive: true })
    checkParams(node.node.params, params)
    const resolvedInputs = params // await resolveActionInputs(params, node.node, steps)
    logger().info('resolvedInputs', resolvedInputs)

    await node.runner({
      inputs: resolvedInputs,
      log: (...args) => {
        const decorator = `[${node.node.name}]`
        const logArgs = [decorator, ...args]
        logger().info(...logArgs)
        send({
          type: 'log',
          data: {
            decorator,
            time: Date.now(),
            message: args
          }
        })
      },
      setOutput: (key: string, value: unknown) => {
        outputs[key] = value
      },
      meta: {
        definition: ''
      },
      setMeta: () => {
        logger().info('set meta defined here')
      },
      cwd: tmp,
      paths: {
        assets: _assetsPath,
        unpack: _unpackPath,
        cache: config.cacheFolder,
        node: nodePath,
        pnpm
      },
      api,
      browserWindow: mainWindow,
      abortSignal
    })

    mainWindow?.setProgressBar(1, { mode: 'normal' })

    return {
      type: 'success',
      result: { outputs, tmp }
    }
  } catch (e) {
    logger().error('Error in action execution:', e)
    mainWindow?.setProgressBar(1, { mode: 'normal' })

    // If aborted, throw AbortError to distinguish from actual errors
    if (abortSignal.aborted) {
      const abortError = new Error('Aborted')
      abortError.name = 'AbortError'
      throw abortError
    }

    return {
      type: 'error',
      ipcError: e
    }
  }
}
