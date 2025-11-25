import { makeResolvedParams } from '@renderer/utils/evaluator'
import { Steps } from '@@/model'
import { Variable } from './libs/core-app'
import { RendererPluginDefinition } from './libs/plugin-core'
import { Block } from './model'
import { Context } from '@renderer/store/editor'
import { End } from './apis'
import { useLogger } from './logger'
import { variableToFormattedVariable } from '@renderer/composables/variables'
import { createQuickJs } from '@renderer/utils/quickjs'

const getPluginDefinition = (pluginId: string, definitions: Array<RendererPluginDefinition>) => {
  const result = definitions.find((nodeDef) => {
    return nodeDef.id === pluginId
  })
  return result
}

const getNodeDefinition = (
  nodeId: string,
  pluginId: string,
  definitions: Array<RendererPluginDefinition>
) => {
  // const getNodeDefinition = <T extends Block>(node: T extends Block ? T : never) => {
  const plugin = getPluginDefinition(pluginId, definitions)
  if (plugin) {
    return plugin.nodes.find((pluginNode) => pluginNode.node.id === nodeId)
  }
  return undefined
}

export const processGraph = async (options: {
  graph: Array<Block>
  definitions: Array<RendererPluginDefinition>
  // editor user defined variables
  variables: Array<Variable>
  // steps outputs
  steps: Steps
  // context like loopindex
  context: Context
  onExecuteItem: (
    node: Block,
    params: Record<string, string>,
    steps: Steps
  ) => Promise<End<'condition:execute'> | End<'action:execute'>>
  onNodeEnter: (node: Block) => void
  onNodeExit: (node: Block) => void
  abortSignal?: AbortSignal
}) => {
  const { logger } = useLogger()

  for (const node of options.graph) {
    // Check if operation was aborted
    if (options.abortSignal?.aborted) {
      const abortError = new Error('Aborted')
      abortError.name = 'AbortError'
      throw abortError
    }

    const rawNode = node

    const pluginDefinition = getPluginDefinition(node.origin.pluginId, options.definitions)
    const nodeDefinition = getNodeDefinition(
      node.origin.nodeId,
      node.origin.pluginId,
      options.definitions
    )

    /* if (rawNode.type === 'condition') {
      options.onNodeEnter(rawNode)

      const newParams = await makeResolvedParams({
        params: rawNode.params,
        variables: options.variables,
        steps: options.steps,
        context: options.context
      })

      const result = await options.onExecuteItem(node, newParams, options.steps) as End<'condition:execute'>

      if ('result' in result) {
        logger().error(result.result)
        options.onNodeExit(rawNode)
        throw new Error('Condition error')
      } else {
        const { value, outputs } = result
        if (!options.steps[rawNode.uid]) {
          options.steps[rawNode.uid] = {
            outputs: {}
          }
        }
        options.steps[rawNode.uid].outputs = outputs

        if (value === true) {
          await processGraph({
            graph: rawNode.branchTrue,
            ...options,
            abortSignal: options.abortSignal
          })
        } else {
          await processGraph({
            graph: rawNode.branchFalse,
            ...options,
            abortSignal: options.abortSignal
          })
        }
      }
      options.onNodeExit(rawNode)
    } else */ if (rawNode.type === 'action') {
      if (rawNode.disabled === true) {
        console.warn(
          `Node ${rawNode.uid} (${rawNode.origin.pluginId}::${rawNode.origin.nodeId}) is disabled`
        )
        continue
      }

      options.onNodeEnter(rawNode)

      const vm = await createQuickJs()

      const variables = await variableToFormattedVariable(vm, options.variables)
      console.log('variables', variables)

      const newParams = await makeResolvedParams(
        {
          params: rawNode.params,
          variables,
          steps: options.steps,
          context: options.context
        },
        undefined,
        vm
      )

      const result = (await options.onExecuteItem(
        node,
        newParams,
        options.steps
      )) as End<'action:execute'>

      if (result.type === 'error') {
        logger().error(result.ipcError)
        options.onNodeExit(rawNode)
        // Check if it's an AbortError from cancellation
        if (result.ipcError && typeof result.ipcError === 'object' && (result.ipcError as Error).name === 'AbortError') {
          throw result.ipcError
        }
        throw new Error(`"${nodeDefinition.node.name}" action error: ${result.ipcError}`)
      }

      if (result.type === 'success') {
        if (!options.steps[rawNode.uid]) {
          options.steps[rawNode.uid] = {
            outputs: {}
          }
        }
        options.steps[rawNode.uid].outputs = result.result.outputs
      }
      options.onNodeExit(rawNode)
    } else if (rawNode.type === 'loop') {
      options.onNodeEnter(rawNode)

      // const context = {}

      // const arrayToLoopOn = await evaluate(rawNode.params.value, context)

      // element is the value of the element at loopindex
      // let loopindex = 0
      // for (const _element of arrayToLoopOn) {
      //   await processGraph(rawNode.children, definitions, variables, steps, {
      //     ...context,
      //     loopindex
      //   })

      //   loopindex += 1
      // }

      // continue after loop

      // TODO: process loop
      // const result = await api.execute('node:execute', {
      //   nodeId: rawNode.origin.nodeId,
      //   pluginId: rawNode.origin.pluginId,
      //   params: rawNode.params
      // })
      // console.log('result', result)
      options.onNodeExit(rawNode)
    } else if (rawNode.type === 'comment') {
      // pass
    } else if (rawNode.type === 'event') {
      options.onNodeEnter(rawNode)
      // pass
      options.onNodeExit(rawNode)
    } else {
      logger().error('Unknown node type', rawNode.type)
    }

    logger().info('steps', options.steps)
  }
  return options
}
