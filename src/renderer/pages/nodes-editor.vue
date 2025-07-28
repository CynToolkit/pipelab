<template>
  <div class="nodes-editor">
    <template v-for="(node, index) in nodes" :key="node.uid">
      <div class="node-wrapper">
        <div class="node">
          <!-- @vue-ignore -->
          <EditorNodeAction
            v-if="node.type === 'action'"
            :path="[...path, (startingIndex + index).toString()]"
            :value="node"
            :index="index"
            :steps="steps"
            :errors="errors"
            :is-running="isRunning"
          ></EditorNodeAction>
          <!-- <EditorNodeCondition
            v-if="node.type === 'condition'"
            :path="[...path, index.toString()]"
            :value="node"
            :steps="steps"
            :errors="errors[node.uid]"
          ></EditorNodeCondition> -->
          <!-- <EditorNodeLoop
            v-if="node.type === 'loop'"
            :path="[...path, index.toString()]"
            :value="node"
            @add-node="addNode"
            :steps="steps"
            :errors="errors[node.uid]"
          ></EditorNodeLoop> -->
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import EditorNodeAction from '@renderer/components/nodes/EditorNodeAction.vue'
// import EditorNodeCondition from '@renderer/components/nodes/EditorNodeCondition.vue'
// import EditorNodeEvent from '@renderer/components/nodes/EditorNodeEvent.vue'
// import EditorNodeLoop from '@renderer/components/nodes/EditorNodeLoop.vue'

import { PropType, toRefs } from 'vue'
import { Block, Steps } from '@@/model'
import { ValidationError } from '@renderer/models/error'
import { useEditor } from '@renderer/store/editor'
import { storeToRefs } from 'pinia'

const editor = useEditor()
const { steps } = storeToRefs(editor)

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
  path: {
    type: Array as PropType<string[]>,
    required: true
    // default: () => []
  },
  errors: {
    type: Object as PropType<Record<string, ValidationError[]>>,
    required: false,
    default: () => ({})
  },
  startingIndex: {
    type: Number,
    required: false,
    default: 0
  },
  isRunning: {
    type: Boolean,
    required: false,
    default: false
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
