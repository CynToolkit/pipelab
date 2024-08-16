<template>
  <div class="node-action-wrapper">
    <div
      ref="$node"
      class="node-action"
      :class="{ active: activeNode?.uid === value.uid, error: errors.length > 0 }"
      @click="showSidebar = true"
    >
      <!--<div v-if="isHovered" class="hover-overlay">
        <div class="hover-overlay-content">
          <Button>
            <template #icon>
              <i class="mdi mdi-pencil"></i>
            </template>
          </Button>
          <Button>
            <template #icon>
              <i class="mdi mdi-trash-can"></i>
            </template>
          </Button>
          <Button>
            <template #icon>
              <i class="mdi mdi-content-copy"></i>
            </template>
          </Button>
          <Button>
            <template #icon>
              <i class="mdi mdi-arrow-up"></i>
            </template>
          </Button>
          <Button>
            <template #icon>
              <i class="mdi mdi-arrow-down"></i>
            </template>
          </Button>
        </div>
      </div>-->

      <div class="vertical">
        <PluginIcon :icon="pluginDefinition?.icon"></PluginIcon>

        <div class="content">
          <div class="title">
            <span class="">{{ nodeDefinition?.name }}</span>
          </div>
          <div class="subtitle" v-html="subtitle"></div>
        </div>

        <span class="type-icon pi pi-play"></span>
      </div>

      <Drawer v-model:visible="showSidebar" class="w-full md:w-full lg:w-7 xl:w-5" position="right">
        <template v-if="nodeDefinition">
          <div class="flex flex-column gap-2">
            <div v-for="(paramDefinition, key) in nodeDefinition.params" :key="key" class="param">
              <ParamEditor
                :param="value.params[key]"
                :param-key="key"
                :param-definition="paramDefinition"
                :value="value"
                :steps="steps"
                @update:model-value="onValueChanged($event, key.toString())"
              ></ParamEditor>
            </div>
          </div>
        </template>
        <template #footer>
          <div class="flex items-center gap-2">
            <Button
              label="Delete"
              icon="pi pi-trash"
              class="flex-auto"
              severity="danger"
              @click="removeNode(value.uid)"
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
import { BlockAction, Steps } from '@@/model'
import { storeToRefs } from 'pinia'
import { PropType, computed, ref, shallowRef, toRefs } from 'vue'
import { watchDebounced } from '@vueuse/core'
import ParamEditor from './ParamEditor.vue'
import PluginIcon from './PluginIcon.vue'
import { Action } from '@cyn/plugin-core'
import { createQuickJs } from '@renderer/utils/quickjs'
import DOMPurify from 'dompurify'
import { makeResolvedParams } from '@renderer/utils/evaluator'
import { ValidationError } from '@renderer/models/error'
import AddNodeButton from '../AddNodeButton.vue'
import { useElementHover } from '@vueuse/core'

const props = defineProps({
  value: {
    type: Object as PropType<BlockAction>,
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
    type: Object as PropType<ValidationError[]>,
    required: false,
    default: () => []
  }
})

const { value, steps } = toRefs(props)

const $node = ref<HTMLDivElement>()

// const isHovered = useElementHover($node)

const editor = useEditor()
const { getNodeDefinition, setBlockValue, addNode, getPluginDefinition, removeNode } = editor
const { activeNode } = storeToRefs(editor)

const nodeDefinition = computed(() => {
  return getNodeDefinition(value.value.origin.nodeId, value.value.origin.pluginId).node as Action
})

const pluginDefinition = computed(() => {
  return getPluginDefinition(value.value.origin.pluginId)
})


const onValueChanged = (newValue: unknown, paramKey: string) => {
  setBlockValue(value.value.uid, {
    ...value.value,
    params: {
      ...value.value.params,
      [paramKey]: newValue
    }
  })
}

// @ts-expect-error tsconfig
const vm = await createQuickJs()

const resolvedParams = shallowRef<Record<string, string>>({})
watchDebounced(
  [value, steps],
  async () => {
    resolvedParams.value = await makeResolvedParams(
      {
        params: value.value.params,
        steps: steps.value,
        context: {},
        variables: []
      },
      (item) => {
        // console.log('item', item)
        // const cleanOutput = DOMPurify.sanitize(item)
        // console.log('cleanOutput', cleanOutput)

        // return `<div class=\"param\">${cleanOutput}</div>`
        return item
      },
      vm
    )
  },
  {
    debounce: 500,
    immediate: true,
    maxWait: 1000
  }
)

const subtitle = ref('')

watchDebounced(
  [resolvedParams, steps],
  async () => {
    const displayString = nodeDefinition.value?.displayString ?? ''
    const result = await vm.run(displayString, {
      params: resolvedParams.value,
      steps: steps.value
    })
    const clean = DOMPurify.sanitize(result)
    subtitle.value = clean
  },
  {
    debounce: 500,
    immediate: true,
    maxWait: 1000
  }
)

const showSidebar = ref(false)
</script>

<style scoped>
.condition-branches {
  display: flex;
}

.node-action-wrapper {
  display: flex;
  flex-direction: column;
  align-items: center;
}

.node-action {
  position: relative;
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

  &.error {
    background-color: #ffcccc;
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
    justify-content: center;

    .subtitle {
      font-size: 0.75rem;
      color: #999;
      height: 32px;
      flex: 1;
      display: flex;
      align-items: center;
      gap: 2px;
    }
  }
}

.hover-overlay {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background-color: rgba(0, 0, 0, 0.5);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 10;

  .hover-overlay-content {
    display: flex;
    flex-direction: row;
    gap: 8px;
  }
}
</style>
