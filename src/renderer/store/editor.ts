import { computed, ref } from 'vue'
import {
  Block,
  BlockAction,
  BlockCondition,
  BlockEvent,
  BlockLoop,
  SavedFile,
  savedFileMigrator,
  SavedFileValidator,
  Steps
} from '@@/model'
import {
  Action,
  Condition,
  Event,
  Loop,
  PipelabNode,
  RendererNodeDefinition
} from '@pipelab/plugin-core'
import { Variable } from '@pipelab/core-app'
import { defineStore, storeToRefs } from 'pinia'
import get from 'get-value'
import set from 'set-value'
import { nanoid } from 'nanoid'
import { AddNodeEvent, AddTriggerEvent } from '@renderer/components/AddNodeButton.model'
import { useAppStore } from './app'
import { useFiles } from './files'
import { useRouteParams } from '@vueuse/router'
import { ValidationError } from '@renderer/models/error'
import { isRequired } from '@@/validation'
import { processGraph } from '@@/graph'
import { useLogger } from '@@/logger'
import { klona } from 'klona'
import { create } from 'mutative'
import { parse } from 'valibot'

export type Context = Record<string, unknown>

// Definitions
export const isActionDefinition = (nodeDefinition: PipelabNode): nodeDefinition is Action => {
  return nodeDefinition.type === 'action'
}

export const isConditionDefinition = (nodeDefinition: PipelabNode): nodeDefinition is Condition => {
  return nodeDefinition.type === 'condition'
}

export const isEventDefinition = (nodeDefinition: PipelabNode): nodeDefinition is Event => {
  return nodeDefinition.type === 'event'
}

export const isLoopDefinition = (nodeDefinition: PipelabNode): nodeDefinition is Loop => {
  return nodeDefinition.type === 'loop'
}

export const isActionBlock = (nodeDefinition: Block): nodeDefinition is BlockAction => {
  return nodeDefinition.type === 'action'
}

// export const isConditionBlock = (nodeDefinition: Block): nodeDefinition is BlockCondition => {
//   return nodeDefinition.type === 'condition'
// }

// export const isCommentBlock = (nodeDefinition: Block): nodeDefinition is BlockComment => {
//   return nodeDefinition.type === 'comment'
// }

// export const isEventBlock = (nodeDefinition: Block): nodeDefinition is BlockEvent => {
//   return nodeDefinition.type === 'event'
// }

// export const isLoopBlock = (nodeDefinition: Block): nodeDefinition is BlockLoop => {
//   return nodeDefinition.type === 'loop'
// }

export type BlockToNode<T extends Block> = T['type'] extends 'action'
  ? Action
  : T['type'] extends 'condition'
    ? Condition
    : T['type'] extends 'event'
      ? Event
      : T['type'] extends 'loop'
        ? Loop
        : never

export const useEditor = defineStore('editor', () => {
  const appStore = useAppStore()
  const { presets, pluginDefinitions } = storeToRefs(appStore)
  const { getNodeDefinition, getPluginDefinition } = appStore

  const { logger } = useLogger()

  const filesStore = useFiles()
  const { files } = storeToRefs(filesStore)

  const id = useRouteParams<string>('id')

  const name = ref('')
  const description = ref('')

  const isRunning = ref(false)
  const setIsRunning = (value: boolean) => {
    isRunning.value = value
  }

  /** All the nodes on the editor */
  const blocks = ref<Array<Block>>([])

  /** All the trigger nodes on the editor */
  const triggers = ref<Array<BlockEvent>>([])

  /** All the variables of the editor */
  const variables = ref<Array<Variable>>([])

  /** All the environement variables supported for the editor */
  const environements = ref<Array<any>>([])

  /** The API helper */
  // const api = useAPI()

  const currentFilePointer = computed(() => {
    return files.value.data[id.value]
  })

  // const savedFile = computed(() => {
  //   return {
  //     version: '2.0.0',
  //     name: toRaw(name.value),
  //     description: '',
  //     canvas: {
  //       blocks: toRaw(blocks.value),
  //       triggers: toRaw(triggers.value)
  //     },
  //     variables: toRaw(variables.value)
  //   } satisfies SavedFile
  // })

  // watchEffect(async () => {
  //   if (id.value === undefined) {
  //     return
  //   }
  //   await update((state) => {
  //     state[id.value] = {
  //       data: savedFile.value,
  //     }
  //   })
  // })

  const stepsDisplay = computed(() => {
    const result: Steps = {}

    for (const node of blocks.value) {
      const pluginDef = getNodeDefinition(node.origin.nodeId, node.origin.pluginId)

      if (!result[node.uid]) {
        result[node.uid] = {
          outputs: {}
        }
      }

      if (pluginDef) {
        if (pluginDef.node.type === 'action') {
          const outputs = pluginDef.node.outputs

          for (const [key, output] of Object.entries(outputs)) {
            result[node.uid]['outputs'][key] =
              `<div class="step">${pluginDef.node.name} → ${output.label}</div>`
          }
        }
      }
    }

    return result
  })

  const activeNode = ref<BlockAction | BlockCondition | BlockLoop>()
  const setActiveNode = (node?: BlockAction | BlockCondition | BlockLoop | undefined) => {
    activeNode.value = node
  }

  /** All the plugins's node definitions */
  const nodeDefinitions = computed(() => {
    return pluginDefinitions.value
      .map((x) =>
        x.nodes.map((n) => ({
          ...n,
          plugin: x.id
        }))
      )
      .flat(3) satisfies RendererNodeDefinition[]
  })

  const clear = () => {
    blocks.value = []
    variables.value = []
    triggers.value = []
    setActiveNode()
  }

  const errors = computed(() => {
    const editorErrors: Record<string, ValidationError[]> = {}
    for (const block of blocks.value) {
      const blockErrors = validate(block)

      for (const err of blockErrors) {
        if (!editorErrors[block.uid]) {
          editorErrors[block.uid] = []
        }
        editorErrors[block.uid].push(err)
      }
    }

    return editorErrors
  })

  const validate = (block: Block | BlockEvent) => {
    const errors: ValidationError[] = []
    if (block.type === 'action') {
      const definition = getNodeDefinition(block.origin.nodeId, block.origin.pluginId)
      const requiredParams = Object.entries(definition.node?.params ?? {})
      for (const [key, param] of requiredParams) {
        if (isRequired(param) && !(key in block.params)) {
          logger().warn(`Missing required param "${key}" in node "${block.uid}"`)
          errors.push({
            type: 'missing',
            param: key
          })
        }
      }

      // } else if (block.type === 'condition') {
      //   const definition = getNodeDefinition(block.origin.nodeId, block.origin.pluginId)
      //   const requiredParams = Object.keys(definition?.params ?? {})
      //   for (const requiredParam of requiredParams) {
      //     if (!(requiredParam in block.params)) {
      //       console.warn(`Missing required param "${requiredParam}" in node "${block.uid}"`)
      //       errors.push({
      //         type: 'missing',
      //         param: requiredParam
      //       })
      //     }
      //   }
    } else if (block.type === 'event') {
      //
      // } else if (block.type === 'loop') {
      //   const definition = getNodeDefinition(block.origin.nodeId, block.origin.pluginId)
      //   const requiredParams = Object.keys(definition?.params ?? {})
      //   for (const requiredParam of requiredParams) {
      //     if (!(requiredParam in block.params)) {
      //       console.warn(`Missing required param "${requiredParam}" in node "${block.uid}"`)
      //       errors.push({
      //         type: 'missing',
      //         param: requiredParam
      //       })
      //     }
      //   }
      // } else if (block.type === 'comment') {
      //   //
    }
    return errors
  }

  const loadSavedFile = async (input: Readonly<SavedFile>) => {
    clear()

    const data = await savedFileMigrator.migrate(input, {
      debug: true
    })

    // ensure all params are there
    const finalData = create(data, (draft) => {
      for (const block of draft.canvas.blocks) {
        const definition = getNodeDefinition(block.origin.nodeId, block.origin.pluginId)
        if (definition) {
          const params = definition.node.params
          for (const param of Object.keys(params)) {
            if (!(param in block.params)) {
              console.warn("adding mising param", param)
              block.params[param] = {
                editor: 'editor',
                value: params[param].value
              }
            }
          }
        }
      }
    })

    await parse(SavedFileValidator, finalData)

    name.value = finalData.name
    description.value = finalData.description

    for (const variable of finalData.variables) {
      addVariable(variable)
    }

    for (const block of finalData.canvas.blocks) {
      blocks.value.push(block)
      validate(block)
    }

    for (const trigger of finalData.canvas.triggers) {
      triggers.value.push(trigger)
      validate(trigger)
    }

    // // load connections
    // for (const connection of data.connections) {
    //   editor.addConnection({
    //     id: connection.uid,
    //     source: connection.sourceUid,
    //     sourceOutput: connection.sourcePort,
    //     target: connection.targetUid,
    //     targetInput: connection.targetPort
    //   })
    // }

    // console.log('/ loadSchemaIntoEditor')
  }

  /**
   * TODO: support nested removals
   */
  const removeNode = (nodeId: string) => {
    const nodeIndex = blocks.value.findIndex((b) => b.uid === nodeId)
    if (nodeIndex > -1) {
      blocks.value = [
        ...blocks.value.slice(0, nodeIndex),
        ...blocks.value.slice(nodeIndex + 1, undefined)
      ]
    }
  }

  const removeTrigger = (triggerId: string) => {
    const triggerIndex = triggers.value.findIndex((b) => b.uid === triggerId)
    if (triggerIndex > -1) {
      triggers.value = [
        ...triggers.value.slice(0, triggerIndex),
        ...triggers.value.slice(triggerIndex + 1, undefined)
      ]
    }
  }

  const setBlockValue = (nodeId: string, value: Block) => {
    const nodeIndex = blocks.value.findIndex((b) => b.uid === nodeId)
    if (nodeIndex > -1) {
      // replace node
      blocks.value = [
        ...blocks.value.slice(0, nodeIndex),
        value,
        ...blocks.value.slice(nodeIndex + 1, undefined)
      ]
    }
  }

  const setTriggerValue = (nodeId: string, value: BlockEvent) => {
    const nodeIndex = triggers.value.findIndex((b) => b.uid === nodeId)
    if (nodeIndex > -1) {
      // replace node
      triggers.value = [
        ...triggers.value.slice(0, nodeIndex),
        value,
        ...triggers.value.slice(nodeIndex + 1, undefined)
      ]
    }
  }

  const swapNodes = (index: number, direction: 'up' | 'down') => {
    const newIndex = index + (direction === 'up' ? -1 : 1)
    const output = blocks.value.map((element, _index) =>
      _index === index
        ? blocks.value[newIndex]
        : _index === newIndex
          ? blocks.value[index]
          : element
    )
    console.log('input', blocks.value)
    console.log('output', output)

    blocks.value = output
  }

  const cloneNode = (node: Block, newIndex: number) => {
    const newNode = klona(node)
    addNodeToBlock(newNode, [], newIndex)
  }

  const disableNode = (node: Block) => {
    blocks.value = create(klona(blocks.value), (draft) => {
      for (let i = 0; i < draft.length; i += 1) {
        if (draft[i].uid === node.uid) {
          draft[i].disabled = true
        }
      }
    })
  }

  const enableNode = (node: Block) => {
    blocks.value = create(klona(blocks.value), (draft) => {
      for (let i = 0; i < draft.length; i += 1) {
        if (draft[i].uid === node.uid) {
          draft[i].disabled = false
        }
      }
    })
  }

  const addNode = (event: AddNodeEvent) => {
    const { node: nodeDefinition, path, plugin: pluginDefinition, insertAt } = event

    if (nodeDefinition && pluginDefinition) {
      if (isActionDefinition(nodeDefinition)) {
        console.log('nodeDefinition', nodeDefinition)

        const createParams: BlockAction['params'] = {}
        for (const [key, param] of Object.entries(nodeDefinition.params)) {
          createParams[key] = {
            editor: 'simple',
            value: param.value
          }
        }

        console.log('createParams', createParams)

        const node: BlockAction = {
          uid: nanoid(),
          type: nodeDefinition.type,
          origin: {
            nodeId: nodeDefinition.id,
            pluginId: pluginDefinition.id
          },
          params: createParams
        }
        addNodeToBlock(node, path, insertAt)
      } /* else if (isConditionDefinition(nodeDefinition)) {
        const node: BlockCondition = {
          uid: nanoid(),
          type: nodeDefinition.type,
          origin: {
            nodeId: nodeDefinition.id,
            pluginId: pluginDefinition.id
          },
          params: {},
          branchFalse: [],
          branchTrue: []
        }
        addNodeToBlock(node, path, insertAt)
      } else if (isLoopDefinition(nodeDefinition)) {
        const node: BlockLoop = {
          uid: nanoid(),
          type: nodeDefinition.type,
          origin: {
            nodeId: nodeDefinition.id,
            pluginId: pluginDefinition.id
          },
          params: {},
          children: []
        }
        addNodeToBlock(node, path, insertAt)
      } */ else {
        logger().error('Unhandled', nodeDefinition)
      }
    }
  }

  const addTrigger = (event: AddTriggerEvent) => {
    const { trigger: triggerDefinition, path, plugin: pluginDefinition, insertAt } = event

    if (triggerDefinition && pluginDefinition) {
      if (isEventDefinition(triggerDefinition)) {
        const node: BlockEvent = {
          uid: nanoid(),
          type: triggerDefinition.type,
          origin: {
            nodeId: triggerDefinition.id,
            pluginId: pluginDefinition.id
          },
          params: {}
        }
        addTriggerToBlock(node, path, insertAt)
      } else {
        logger().error('Unhandled', triggerDefinition)
      }
    }
  }

  const addTriggerToBlock = (node: BlockEvent, path: string[], insertAt: number) => {
    const value = path.length === 0 ? triggers.value : get(triggers.value, path)

    // const firstPart = value.slice(0, insertAt)
    // const secondPart = value.slice(insertAt + 1)

    const newValue = [
      ...value.slice(0, insertAt),
      node,
      ...value.slice(
        insertAt // already has +1
      )
    ]
    if (path.length === 0) {
      triggers.value = newValue
    } else {
      set(triggers.value, path, newValue)
    }

    return
  }

  // const addNodeToBlock = (node: Block, path: string[], insertAt: number) => {
  //   console.log('node', node)
  //   console.log('path', path)
  //   console.log('insertAt', insertAt)
  //   const value = path.length === 0 ? blocks.value : get(blocks.value, path)

  //   const firstPart = value.slice(0, insertAt)
  //   const secondPart = value.slice(insertAt + 1)

  //   const newValue = [
  //     ...value.slice(0, insertAt),
  //     node,
  //     ...value.slice(
  //       insertAt // already has +1
  //     )
  //   ]
  //   if (path.length === 0) {
  //     blocks.value = newValue
  //   } else {
  //     set(blocks.value, path, newValue)
  //   }

  //   return
  // }

  const addNodeToBlock = (node: Block, path: string[], insertAt: number) => {
    console.log('node', node)
    console.log('path', path)
    console.log('insertAt', insertAt)

    const value = blocks.value

    const newValue = [
      ...value.slice(0, insertAt),
      node,
      ...value.slice(
        insertAt // already has +1
      )
    ]
    blocks.value = newValue

    return
  }

  const addVariable = (variable: Variable) => {
    variables.value.push(variable)
  }

  const removeVariable = (id: string) => {
    const index = variables.value.findIndex((x) => x.id === id)
    variables.value = [
      ...variables.value.slice(0, index),
      ...variables.value.slice(index + 1, undefined)
    ]
  }

  const updateVariable = (variable: Variable) => {
    variables.value = create(variables.value, (draft) => {
      console.log('draft', draft)
      for (let i = 0; i < draft.length; i += 1) {
        console.log('draft[i]', draft[i])
        if (draft[i].id === variable.id) {
          draft[i] = klona(variable)
        }
      }
      return draft
    })
  }

  const loadPreset = async (preset: string) => {
    if (!presets.value) {
      throw new Error('No presets')
    }

    if (preset) {
      const selectedPreset = presets.value[preset]
      if (selectedPreset) {
        await loadSavedFile(selectedPreset.data)
      }
    }
  }

  return {
    nodes: blocks,
    triggers,
    variables,
    environements,
    nodeDefinitions,
    activeNode,
    name,
    id,
    description,
    errors,

    stepsDisplay,

    currentFilePointer,

    setActiveNode,
    setBlockValue,
    setTriggerValue,
    removeNode,
    removeTrigger,

    clear,
    loadSavedFile,
    addNode,
    addNodeToBlock,

    addTrigger,
    addTriggerToBlock,

    addVariable,
    updateVariable,
    removeVariable,
    getPluginDefinition,
    getNodeDefinition,
    processGraph,
    loadPreset,
    isRunning,
    setIsRunning,

    swapNodes,
    cloneNode,
    disableNode,
    enableNode
  }
})

export type UseEditorFn = ReturnType<typeof useEditor>
