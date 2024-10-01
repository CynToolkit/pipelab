<template>
  <div class="node-loop-wrapper">
    <div
      class="node-loop"
      :class="{ active: activeNode?.uid === value.uid }"
      @click="showSidebar = true"
    >
      <div class="vertical">
        <PluginIcon :icon="pluginDefinition?.icon"></PluginIcon>

        <div class="content">
          <div class="title">
            <span class="">{{ nodeDefinition?.name }}</span>
          </div>
          <div class="subtitle">
            {{ subtitle }}
          </div>
        </div>

        <span class="pi pi-question-circle"></span>
      </div>
    </div>

    <div class="vl"></div>

    <div class="loop-branches">
      <div class="children">
        <div class="vl"></div>
        <!-- @vue-ignore -->
        <NodesEditor
          :path="[...path, 'children']"
          :extra-add-button="false"
          :nodes="value.children"
          :errors="errors"
          :steps="steps"
        ></NodesEditor>
        <div class="loop-add-button">
          <AddNodeButton
            :button-props="{ size: 'small', icon: 'pi pi-plus' }"
            class="add-btn"
            :path="[...path, 'children', '1']"
            @add-node="emit('add-node', $event)"
          ></AddNodeButton>
        </div>
      </div>
    </div>

    <div class="vl"></div>

    <Drawer v-model:visible="showSidebar" class="w-full md:w-10 lg:w-9 xl:w-8" position="right">
      <template v-if="nodeDefinition">
        <div v-for="(param, key) in nodeDefinition.params" :key="key" class="param">
          <!-- @vue-ignore -->
          <ParamEditor
            :param="value.params[key]"
            :param-key="key"
            :param-definition="param"
            @update:model-value="onValueChanged($event, key.toString())"
            :value="value"
            :steps="steps"
          ></ParamEditor>
        </div>

        <div v-for="(_output, outputKey) in nodeDefinition.outputs" :key="outputKey">
          Step.get("{{ nodeDefinition.id }}").{{ outputKey }}
        </div>
      </template>
      <pre>value: {{ value }}</pre>
      <pre>
getNodeDefinition: {{ getNodeDefinition(value.origin.nodeId, value.origin.pluginId) }}</pre
      >
    </Drawer>
  </div>
</template>

<script setup lang="ts">
import { useEditor } from '@renderer/store/editor'
import { PropType, computed, ref, toRefs } from 'vue'
import NodesEditor from '@renderer/pages/nodes-editor.vue'
import { BlockLoop } from '@@/model'
import { storeToRefs } from 'pinia'
import { computedAsync } from '@vueuse/core'
import AddNodeButton from '@renderer/components/AddNodeButton.vue'
import { AddNodeEvent } from '../AddNodeButton.model'
import { Loop } from '@pipelab/plugin-core'
import PluginIcon from './PluginIcon.vue'
import { ValidationError } from '@renderer/models/error'

const props = defineProps({
  value: {
    type: Object as PropType<BlockLoop>,
    required: true
  },
  path: {
    type: Array as PropType<string[]>,
    required: true
    // default: () => []
  },
  errors: {
    type: Object as PropType<ValidationError[]>,
    required: false,
    default: () => []
  }
})

const emit = defineEmits<{
  'add-node': [payload: AddNodeEvent]
}>()

const { value } = toRefs(props)

const editor = useEditor()
const { getNodeDefinition, setBlockValue, getPluginDefinition } = editor
const { activeNode } = storeToRefs(editor)

const showSidebar = ref(false)

const nodeDefinition = computed(() => {
  return getNodeDefinition(value.value.origin.nodeId, value.value.origin.pluginId).node as Loop
})

const pluginDefinition = computed(() => {
  return getPluginDefinition(value.value.origin.pluginId)
})

const subtitle = computedAsync(
  async () => {
    // const result = await engine.parseAndRender(nodeDefinition.value?.displayString ?? '', {
    //   params: value.value.params
    // })
    // return result
    return 'TODO'
  },
  'Loading...',
  {
    onError: (error) => {
      console.error('error', error)
    }
  }
)

const onValueChanged = (newValue: unknown, paramKey: string) => {
  console.log('newValue', newValue)

  // @ts-expect-error
  setBlockValue(value.value.uid, {
    ...value.value,
    params: {
      ...value.value.params,
      [paramKey]: newValue
    }
  })
}
</script>

<style scoped>
.loop-branches {
  display: flex;
  width: 100%;
  justify-content: center;

  border: 2px solid #c2c9d1;
  padding: 0 16px;

  .children {
    display: flex;
    width: 100%;
    align-items: center;
    flex-direction: column;
  }
}

.node-loop-wrapper {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}

.node-loop {
  border: 1px solid #c2c9d1;
  padding: 16px;
  border-radius: 4px;
  width: fit-content;
  background-color: white;

  &.active {
    outline: 1px solid red;
    outline-offset: 3px;
  }
}

.vl {
  border-left: 2px solid #c2c9d1;
  height: 32px;
}

.loop-add-button {
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
}

.vertical {
  display: flex;
  flex-direction: row;
  gap: 16px;
  align-items: center;

  .content {
    display: flex;
    flex-direction: column;

    .subtitle {
      font-size: 0.75rem;
      color: #999;
    }
  }
}
</style>
