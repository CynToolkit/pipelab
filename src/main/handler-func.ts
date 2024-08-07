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
import { randomBytes } from 'node:crypto'
import { mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { assetsPath, unpackPath } from './paths'
import { useLogger } from '@@/logger'
import { BrowserWindow } from 'electron'
import { usePluginAPI } from './api'

const checkParams = (definitionParams: InputsDefinition, elementParams: any) => {
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
      throw new Error('Unexpected param "' + param + '"')
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
  params: any,
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

  if (node) {
    const id = randomBytes(24).toString('hex')
    const tmp = join(tmpdir(), id)
    // const tmp = join(tmpdir(), nanoid())

    await mkdir(tmp, {
      recursive: true
    })

    checkParams(node.node.params, params)

    const resolvedInputs = params // await resolveConditionInputs(params, node.node, steps)

    try {
      const outputs = {}
      const value = await node.runner({
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
        outputs,
        value
      }
    } catch (e) {
      logger().error('e', e)
      return {
        result: {
          ipcError: e
        }
      }
    }
  } else {
    return {
      result: {
        ipcError: 'Node not found'
      }
    }
  }
}

export const handleActionExecute = async (
  nodeId: string,
  pluginId: string,
  params: any,
  mainWindow: BrowserWindow | undefined,
  // { send }: { send: HandleListenerSendFn<'action:execute'> }
): Promise<End<'action:execute'>> => {
  const { plugins } = usePlugins()
  const { logger } = useLogger()

  const node = plugins.value
    .find((plugin) => plugin.id === pluginId)
    ?.nodes.find((node) => node.node.id === nodeId) as
    | {
        node: Action
        runner: ActionRunner<any>
      }
    | undefined

  if (node) {
    try {
      const id = randomBytes(24).toString('hex')
      const tmp = join(tmpdir(), id)
      // const tmp = join(tmpdir(), nanoid())

      await mkdir(tmp, {
        recursive: true
      })

      checkParams(node.node.params, params)

      const resolvedInputs = params // await resolveActionInputs(params, node.node, steps)

      logger().info('resolvedInputs', resolvedInputs)

      const _assetsPath = await assetsPath()
      const _unpackPath = await unpackPath()

      const outputs: Record<string | number | symbol, unknown> = {}

      const api = usePluginAPI(mainWindow)

      await node.runner({
        inputs: resolvedInputs,
        log: (...args) => {
          logger().info(`[${node.node.name}]`, ...args)
        },
        setOutput: (key, value) => {
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
          unpack: _unpackPath
        },
        api,
      })
      return {
        outputs
      }
    } catch (e) {
      logger().error('[action:execute] e', e)
      return {
        result: {
          ipcError: e
        }
      }
    }
  } else {
    return {
      result: {
        ipcError: 'Node not found'
      }
    }
  }
}
