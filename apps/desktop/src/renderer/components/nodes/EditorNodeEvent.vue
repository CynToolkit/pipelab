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
            <!-- @vue-ignore -->
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
        <template #footer>
          <div class="flex items-center gap-2">
            <Button
              label="Delete"
              icon="pi pi-trash"
              class="flex-auto"
              severity="danger"
              @click="removeTrigger(value.uid)"
            ></Button>
          </div>
        </template>
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
import { BlockEvent, Steps } from '@@/model'
import { storeToRefs } from 'pinia'
import { PropType, computed, ref, toRefs } from 'vue'
import { computedAsync } from '@vueuse/core'
import { makeResolvedParams } from '@renderer/utils/evaluator'
import ParamEditor from './ParamEditor.vue'
import { Event } from '@plugins/plugin-core'
import DOMPurify from 'dompurify'
import PluginIcon from './PluginIcon.vue'
import { ValidationError } from '@renderer/models/error'
import AddNodeButton from '../AddNodeButton.vue'
import { createQuickJs } from '@renderer/utils/quickjs'
import { useLogger } from '@@/logger'

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
  steps: {
    type: Object as PropType<Steps>,
    required: true
  },
  errors: {
    type: Object as PropType<Record<string, ValidationError[]>>,
    required: false,
    default: () => ({})
  }
})

const { value, steps } = toRefs(props)

const { logger } = useLogger()

const editor = useEditor()
const { getNodeDefinition, getPluginDefinition, setTriggerValue, addNode, removeTrigger } = editor
const { activeNode } = storeToRefs(editor)

const nodeDefinition = computed(() => {
  const el = getNodeDefinition(value.value.origin.nodeId, value.value.origin.pluginId)
  if (el) {
    return el.node as Event
  }
  return undefined
})

const pluginDefinition = computed(() => {
  return getPluginDefinition(value.value.origin.pluginId)
})

const onValueChanged = (newValue: unknown, paramKey: string) => {
  setTriggerValue(value.value.uid, {
    ...value.value,
    params: {
      ...value.value.params,
      [paramKey]: newValue
    }
  })
}

const resolvedParams = computedAsync(
  async () => {
    return makeResolvedParams(
      {
        params: value.value.params,
        steps: steps.value,
        context: {},
        variables: {}
      },
      (item) => {
        // console.log('item', item)
        // const cleanOutput = DOMPurify.sanitize(item)
        // console.log('cleanOutput', cleanOutput)

        // return `<div class=\"param\">${cleanOutput}</div>`
        return item
      }
    )
  },
  {},
  {
    onError: (error) => {
      logger().error('error', error)
    }
  }
)

const subtitle = computedAsync(
  async () => {
    const displayString = nodeDefinition.value?.displayString ?? ''
    const vm = await createQuickJs()
    const result = await vm.run(displayString, {
      params: resolvedParams.value,
      steps: steps.value
    })
    const clean = DOMPurify.sanitize(result)
    return clean
  },
  'Loading...',
  {
    onError: (error) => {
      logger().error('error', error)
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
