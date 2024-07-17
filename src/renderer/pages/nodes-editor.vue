<template>
  <div class="nodes-editor">
    <template v-for="(node, index) in nodes" :key="node.uid">
      <div class="node-wrapper">
        <div class="node">
          <EditorNodeAction
            v-if="node.type === 'action'"
            :path="[...path, index.toString()]"
            :value="node"
            :steps="steps"
            :errors="errors[node.uid]"
          ></EditorNodeAction>
          <EditorNodeCondition
            v-if="node.type === 'condition'"
            :path="[...path, index.toString()]"
            :value="node"
            :steps="steps"
            :errors="errors[node.uid]"
          ></EditorNodeCondition>
          <EditorNodeEvent
            v-if="node.type === 'event'"
            :path="[...path, index.toString()]"
            :value="node"
            :steps="steps"
            :errors="errors[node.uid]"
          ></EditorNodeEvent>
          <EditorNodeLoop
            v-if="node.type === 'loop'"
            :path="[...path, index.toString()]"
            :value="node"
            @add-node="addNode"
            :steps="steps"
            :errors="errors[node.uid]"
          ></EditorNodeLoop>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { useEditor } from '@renderer/store/editor'
import EditorNodeAction from '@renderer/components/nodes/EditorNodeAction.vue'
import EditorNodeCondition from '@renderer/components/nodes/EditorNodeCondition.vue'
import EditorNodeEvent from '@renderer/components/nodes/EditorNodeEvent.vue'
import EditorNodeLoop from '@renderer/components/nodes/EditorNodeLoop.vue'

import { PropType, toRefs } from 'vue'
import { storeToRefs } from 'pinia'
import { useAppStore } from '@renderer/store/app'
import { Block, Steps } from '@@/model'

const instance = useEditor()
const { } = storeToRefs(instance)
const { addNode } = instance

const appStore = useAppStore()
const { } = instance

const props = defineProps({
  nodes: {
    type: Array as PropType<Block[]>,
    required: true
  },
  extraAddButton: {
    type: Boolean,
    default: true,
    required: false
  },
  steps: {
    type: Object as PropType<Steps>,
    required: true,
  },
  path: {
    type: Array as PropType<string[]>,
    required: true
    // default: () => []
  },
  errors: {
    type: Array as PropType<Record<string, any>>,
    required: false,
    default: () => ({})
  }
})

const { nodes, path } = toRefs(props)

</script>

<style scoped lang="scss">
.nodes-editor {
  display: flex;
  flex-direction: column;
  align-items: center;
  overflow: auto;
  width: 100%;
}

.vl {
  border-left: 2px solid #c2c9d1;
  height: 32px;
}

.node-wrapper {
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
}

.title {
  font-size: 1.5rem;
}

.subtitle {
  font-size: 1rem;
  color: #333;
}
</style>
isConditionDefinition, isEventDefinition, isLoopDefinition, , BlockCondition, BlockEvent,
BlockLoopimport { nanoid } from 'nanoid' isConditionDefinition, isEventDefinition, isLoopDefinition,
, BlockCondition, BlockEvent, BlockLoop
