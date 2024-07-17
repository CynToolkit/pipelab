import { computed, ref, toRaw, watch } from 'vue'
import {
  Block,
  BlockAction,
  BlockComment,
  BlockCondition,
  BlockEvent,
  BlockLoop,
  SavedFile,
  Steps
} from '@@/model'
import { useAPI } from '@renderer/composables/api'
import { Action, Condition, RendererPluginDefinition, Event, Loop, CynNode, InputDefinition } from '@cyn/plugin-core'
import { Variable } from '@cyn/core'
import { defineStore, storeToRefs } from 'pinia'
import get from 'get-value'
import set from 'set-value'
import { nanoid } from 'nanoid'
import { AddNodeEvent } from '@renderer/components/AddNodeButton.model'
import { useAppStore } from './app'
import { SaveLocation } from '@@/save-location'
import { FileRepo, useFiles } from './files'
import { useRouteParams } from '@vueuse/router'
import { ValidationError } from '@renderer/models/error'
import { isRequired } from '@@/validation'
import { processGraph } from '@@/graph'

export type Context = Record<string, unknown>

// Definitions
export const isActionDefinition = (nodeDefinition: CynNode): nodeDefinition is Action => {
  return nodeDefinition.type === 'action'
}

export const isConditionDefinition = (nodeDefinition: CynNode): nodeDefinition is Condition => {
  return nodeDefinition.type === 'condition'
}

export const isEventDefinition = (nodeDefinition: CynNode): nodeDefinition is Event => {
  return nodeDefinition.type === 'event'
}

export const isLoopDefinition = (nodeDefinition: CynNode): nodeDefinition is Loop => {
  return nodeDefinition.type === 'loop'
}

export const isActionBlock = (nodeDefinition: Block): nodeDefinition is BlockAction => {
  return nodeDefinition.type === 'action'
}

export const isConditionBlock = (nodeDefinition: Block): nodeDefinition is BlockCondition => {
  return nodeDefinition.type === 'condition'
}

export const isCommentBlock = (nodeDefinition: Block): nodeDefinition is BlockComment => {
  return nodeDefinition.type === 'comment'
}

export const isEventBlock = (nodeDefinition: Block): nodeDefinition is BlockEvent => {
  return nodeDefinition.type === 'event'
}

export const isLoopBlock = (nodeDefinition: Block): nodeDefinition is BlockLoop => {
  return nodeDefinition.type === 'loop'
}

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

  const filesStore = useFiles()
  const { update } = filesStore
  const { files } = storeToRefs(filesStore)

  const id = useRouteParams<string>('id')

  const name = ref('')
  const description = ref('')

  /** All the nodes on the editor */
  const blocks = ref<Array<Block>>([])

  /** All the variables of the editor */
  const variables = ref<Array<Variable>>([])

  /** The API helper */
  // const api = useAPI()

  const currentFilePointer = computed(() => {
    return files.value.data[id.value]
  })

  watch(currentFilePointer, () => {
    console.log('currentFilePointer', currentFilePointer.value)
  }, {
    immediate: true
  })

  const savedFile = computed(() => {
    return {
      version: '1.0.0',
      name: toRaw(name.value),
      description: '',
      canvas: {
        blocks: toRaw(blocks.value)
      },
      variables: toRaw(variables.value)
    } satisfies SavedFile
  })

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
      console.log('pluginDef', pluginDef)

      if (!result[node.uid]) {
        result[node.uid] = {
          outputs: {}
        }
      }

      if (pluginDef) {
        if (pluginDef.type === 'action') {
          const outputs = pluginDef.outputs

          for (const [key, output] of Object.entries(outputs)) {
            console.log('output', outputs)
            result[node.uid]['outputs'][key] = `<div class="step">${pluginDef.name} → ${output.label}</div>`
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
      .flat(3) satisfies CynNode[]
  })

  const clear = () => {
    blocks.value = []
    variables.value = []
    setActiveNode()
    console.log('clear')
  }

  const errors = computed(() => {
    const editorErrors: Record<string, ValidationError[]> = {}
    for (const block of blocks.value) {
      const blockErrors = validate(block)
      console.log('blockErrors', blockErrors)

      for (const err of blockErrors) {
        if(!editorErrors[block.uid] ) {
          editorErrors[block.uid] = []
        }
        editorErrors[block.uid].push(err)
      }
    }

    return editorErrors
  })

  const validate = (block: Block) => {
    const errors: ValidationError[] = []
    if (block.type === 'action') {
      const definition = getNodeDefinition(block.origin.nodeId, block.origin.pluginId)
      const requiredParams = Object.entries(definition?.params ?? {})
      for (const [key, param] of requiredParams) {
        if (isRequired(param) && !(key in block.params)) {
          console.warn(`Missing required param "${key}" in node "${block.uid}"`)
          errors.push({
            type: 'missing',
            param: key
          })
        }
      }
    } else if (block.type === 'condition') {
      const definition = getNodeDefinition(block.origin.nodeId, block.origin.pluginId)
      const requiredParams = Object.keys(definition?.params ?? {})
      for (const requiredParam of requiredParams) {
        if (!(requiredParam in block.params)) {
          console.warn(`Missing required param "${requiredParam}" in node "${block.uid}"`)
          errors.push({
            type: 'missing',
            param: requiredParam
          })
        }
      }
    } else if (block.type === 'event') {
      //
    } else if (block.type === 'loop') {
      const definition = getNodeDefinition(block.origin.nodeId, block.origin.pluginId)
      const requiredParams = Object.keys(definition?.params ?? {})
      for (const requiredParam of requiredParams) {
        if (!(requiredParam in block.params)) {
          console.warn(`Missing required param "${requiredParam}" in node "${block.uid}"`)
          errors.push({
            type: 'missing',
            param: requiredParam
          })
        }
      }
    } else if (block.type === 'comment') {
      //
    }
    return errors
  }

  const loadSavedFile = async (data: Readonly<SavedFile>) => {
    clear()

    console.log('loadSavedFile data', data)

    name.value = data.name
    description.value = data.description

    for (const variable of data.variables) {
      addVariable(variable)
    }

    for (const block of data.canvas.blocks) {
      blocks.value.push(block)
      validate(block)
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

  const setNodeValue = (nodeId: string, value: Block) => {
    const nodeIndex = blocks.value.findIndex((b) => b.uid === nodeId)
    console.log('nodeIndex', nodeIndex)
    console.log('0, nodeIndex', 0, nodeIndex)
    console.log('nodeIndex + 1, blocks.value.length - 1', nodeIndex + 1, blocks.value.length - 1)
    if (nodeIndex > -1) {
      // replace node
      blocks.value = [
        ...blocks.value.slice(0, nodeIndex),
        value,
        ...blocks.value.slice(nodeIndex + 1, undefined)
      ]
    }
  }

  const addNode = (event: AddNodeEvent) => {
    console.log('event', event)
    console.log('nodeDefinitions', nodeDefinitions.value)

    const { node: nodeDefinition, path, plugin: pluginDefinition, insertAt } = event

    if (nodeDefinition && pluginDefinition) {
      if (isActionDefinition(nodeDefinition)) {
        const node: BlockAction = {
          uid: nanoid(),
          type: nodeDefinition.type,
          origin: {
            nodeId: nodeDefinition.id,
            pluginId: pluginDefinition.id
          },
          params: {}
        }
        addNodeToBlock(node, path, insertAt)
      } else if (isConditionDefinition(nodeDefinition)) {
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
      } else if (isEventDefinition(nodeDefinition)) {
        const node: BlockEvent = {
          uid: nanoid(),
          type: nodeDefinition.type,
          origin: {
            nodeId: nodeDefinition.id,
            pluginId: pluginDefinition.id
          },
          params: {}
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
      } else {
        console.error('Unhandled', nodeDefinition)
      }
    }
  }

  const addNodeToBlock = (node: Block, path: string[], insertAt: number) => {
    console.log('path', path)
    console.log('insertAt', insertAt)
    const value = path.length === 0 ? blocks.value : get(blocks.value, path)
    console.log('value', value)

    const firstPart = value.slice(0, insertAt)
    const secondPart = value.slice(insertAt + 1)

    console.log('firstPart', firstPart)
    console.log('secondPart', secondPart)

    const newValue = [
      ...value.slice(0, insertAt),
      node,
      ...value.slice(
        insertAt // already has +1
      )
    ]
    console.log('newValue', newValue)
    if (path.length === 0) {
      blocks.value = newValue
    } else {
      set(blocks.value, path, newValue)
    }

    console.log('blocks.value', blocks.value)

    return
  }

  const addVariable = (variable: Variable) => {
    variables.value.push(variable)
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
    variables,
    nodeDefinitions,
    activeNode,
    name,
    id,
    description,
    errors,

    stepsDisplay,

    currentFilePointer,

    setActiveNode,
    setNodeValue,
    removeNode,

    clear,
    loadSavedFile,
    addNode,
    addNodeToBlock,
    addVariable,
    getPluginDefinition,
    getNodeDefinition,
    processGraph,
    loadPreset
  }
})

export type UseEditorFn = ReturnType<typeof useEditor>
