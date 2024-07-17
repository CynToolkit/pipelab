<template>
  <div class="node-event-wrapper">
    <div
      class="node-event"
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

        <span class="pi pi-bolt"></span>
      </div>

      <Drawer v-model:visible="showSidebar" class="w-full md:w-10 lg:w-9 xl:w-8" position="right">
        <template v-if="nodeDefinition">
          <div v-for="(paramDefinition, key) in nodeDefinition.params" :key="key" class="param">
            <ParamEditor
              :param="value.params[key]"
              :param-key="key"
              :param-definition="paramDefinition"
              @update:model-value="onValueChanged($event, key.toString())"
              :value="value"
              :steps="steps"
            ></ParamEditor>
          </div>
        </template>
        <pre>{{ value }}</pre>
        <pre>{{ getNodeDefinition(value.origin.nodeId, value.origin.pluginId) }}</pre>
      </Drawer>
    </div>
    <AddNodeButton
      :button-props="{ size: 'small', icon: 'pi pi-plus' }"
      class="add-btn"
      :path="path"
      @add-node="addNode"
    ></AddNodeButton>
  </div>
</template>

<script setup lang="ts">
import { useEditor } from '@renderer/store/editor'
import { BlockEvent } from '@@/model'
import { storeToRefs } from 'pinia'
import { PropType, computed, ref, toRefs } from 'vue'
import { Liquid } from 'liquidjs'
import { computedAsync } from '@vueuse/core'
import ParamEditor from './ParamEditor.vue'
import { Event } from '@cyn/plugin-core'
import PluginIcon from './PluginIcon.vue'
import { ValidationError } from '@renderer/models/error'
import AddNodeButton from '../AddNodeButton.vue'

const engine = new Liquid()

const props = defineProps({
  value: {
    type: Object as PropType<BlockEvent>,
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

const { value } = toRefs(props)

const editor = useEditor()
const { getNodeDefinition, getPluginDefinition, setNodeValue, addNode } = editor
const { activeNode } = storeToRefs(editor)

const nodeDefinition = computed(() => {
  return getNodeDefinition(value.value.origin.nodeId, value.value.origin.pluginId) as Event
})

const pluginDefinition = computed(() => {
  return getPluginDefinition(value.value.origin.pluginId)
})

const onValueChanged = (newValue: unknown, paramKey: string) => {
  console.log('newValue', newValue)

  setNodeValue(value.value.uid, {
    ...value.value,
    params: {
      ...value.value.params,
      [paramKey]: newValue
    }
  })
}

const subtitle = computedAsync(
  async () => {
    const result = await engine.parseAndRender(nodeDefinition.value?.displayString ?? '', {
      params: value.value.params
    })
    return result
  },
  'Loading...',
  {
    onError: (error) => {
      console.error('error', error)
    }
  }
)

const showSidebar = ref(false)
</script>

<style scoped>
.condition-branches {
  display: flex;
}

.node-event-wrapper {
  display: flex;
  flex-direction: column;
  align-items: center;
}

.node-event {
  border: 1px solid #c2c9d1;
  padding: 16px;
  border-radius: 4px;
  width: fit-content;
  background-color: white;
  box-shadow:
    0 0 #0000,
    0 0 #0000,
    0 0 22px rgba(186, 186, 191, 0.3);

  &.active {
    outline: 1px solid red;
    outline-offset: 3px;
  }
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
