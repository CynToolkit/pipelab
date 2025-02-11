<template>
  <div class="node-action-wrapper">
    <div
      ref="$node"
      class="node-action"
      :class="{
        active: activeNode?.uid === value.uid,
        error: Object.keys(errors).length > 0,
        disabled: value.disabled || isRunning
      }"
      @click="onNodeClick"
    >
      <div class="vertical">
        <PluginIcon width="32px" :icon="pluginDefinition?.icon"></PluginIcon>

        <div class="content">
          <div class="title">
            <div spellcheck="false" contenteditable="true" @click.stop @input="handleInput">
              {{ title }}
            </div>
            <div v-if="value.name" class="original-title">{{ nodeDefinition.name }}</div>
          </div>
          <div v-if="subtitle" class="subtitle" v-html="subtitle"></div>
          <Skeleton v-else width="300px" height="28px"></Skeleton>
        </div>

        <div class="actions">
          <Button
            type="button"
            icon="pi pi-ellipsis-v"
            size="small"
            text
            aria-haspopup="true"
            class="small-btn"
            aria-controls="overlay_menu"
            @click.stop.prevent="toggle"
          />
          <Menu id="overlay_menu" ref="menu" :model="items" :popup="true">
            <template #itemicon="{ item }">
              <i class="mdi" :class="[item.icon]"></i>
            </template>
          </Menu>

          <Button
            v-if="hasErrored"
            class="small-btn"
            icon="pi pi-exclamation-triangle"
            size="small"
            text
          />
        </div>
        <!-- <span class="type-icon pi pi-play"></span> -->
      </div>

      <Drawer v-model:visible="showSidebar" class="w-full md:w-full lg:w-7 xl:w-5" position="right">
        <template v-if="nodeDefinition">
          <div class="flex flex-column gap-4">
            <div v-for="(paramDefinition, key) in nodeDefinition.params" :key="key" class="param">
              <ParamEditor
                :param="value.params[key]"
                :param-key="key"
                :param-definition="paramDefinition"
                :value="value"
                :steps="steps"
                :variables="variables"
                :vm="vm"
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
      :is-running="isRunning"
      @add-node="addNode"
    >
    </AddNodeButton>
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
import { Action } from '@pipelab/plugin-core'
import { createQuickJs } from '@renderer/utils/quickjs'
import DOMPurify from 'dompurify'
import { makeResolvedParams } from '@renderer/utils/evaluator'
import { ValidationError } from '@renderer/models/error'
import AddNodeButton from '../AddNodeButton.vue'
import { ValueOf } from 'type-fest'
import { MenuItem } from 'primevue/menuitem'

const props = defineProps({
  value: {
    type: Object as PropType<BlockAction>,
    required: true
  },
  index: {
    type: Number,
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
  },
  isRunning: {
    type: Boolean,
    required: false,
    default: false
  }
})

const menu = ref()
const { value, steps, index, isRunning } = toRefs(props)

const items = computed<MenuItem[]>(() => [
  {
    label: 'Options',
    items: [
      {
        label: 'Edit',
        icon: 'mdi-pencil',
        command: () => {
          showSidebar.value = true
        }
      },
      {
        separator: true
      },
      {
        label: 'Move up',
        icon: 'mdi-arrow-up',
        command: () => {
          swapNodes(index.value, 'up')
        }
      },
      {
        label: 'Move down',
        icon: 'mdi-arrow-down',
        command: () => {
          swapNodes(index.value, 'down')
        }
      },
      {
        separator: true
      },
      {
        label: 'Enable',
        icon: 'mdi-toggle-switch-off-outline',
        visible: !!value.value.disabled,
        command: () => {
          enableNode(value.value)
        }
      },
      {
        label: 'Disable',
        icon: 'mdi-toggle-switch',
        visible: !value.value.disabled,
        command: () => {
          disableNode(value.value)
        }
      },
      {
        label: 'Duplicate',
        icon: 'mdi-content-copy',
        command: () => {
          cloneNode(value.value, index.value + 1)
        }
      },
      {
        separator: true
      },
      {
        label: 'Delete',
        icon: 'mdi-trash-can',
        class: 'danger',
        command: () => {
          removeNode(value.value.uid)
        }
      }
    ]
  }
])

const toggle = (event: MouseEvent) => {
  if (!isRunning.value) {
    menu.value.toggle(event)
  }
}

const $node = ref<HTMLDivElement>()

// const isHovered = useElementHover($node)

const editor = useEditor()
const {
  getNodeDefinition,
  setBlockValue,
  addNode,
  getPluginDefinition,
  removeNode,
  swapNodes,
  cloneNode,
  disableNode,
  enableNode
} = editor
const { activeNode, variables } = storeToRefs(editor)

const nodeDefinition = computed(() => {
  const def = getNodeDefinition(value.value.origin.nodeId, value.value.origin.pluginId)
  if (def) {
    return def.node as Action
  }
  return undefined
})

const pluginDefinition = computed(() => {
  return getPluginDefinition(value.value.origin.pluginId)
})

type Param = ValueOf<BlockAction['params']>

const handleInput = (newValue: InputEvent) => {
  const content = (newValue.target as HTMLDivElement)?.textContent
  console.log('content', content)
  setBlockValue(value.value.uid, {
    ...value.value,
    name: content
  })
}

const onValueChanged = (newValue: Param, paramKey: string) => {
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

const variablesDisplay = computed(() => {
  const result: Record<string, string> = {}
  for (const variable of variables.value) {
    result[variable.id] = `<div class="variable">@${variable.name}</div>`
  }
  return result
})

const resolvedParams = shallowRef<Record<string, string>>({})
watchDebounced(
  [value, steps, variablesDisplay],
  async () => {
    // const variables = await variableToFormattedVariable(vm, data.variables)
    // console.log('variables', variables)

    resolvedParams.value = await makeResolvedParams(
      {
        params: value.value.params,
        steps: steps.value,
        context: {},
        variables: variablesDisplay.value
      },
      (item) => {
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

const title = computed(() => {
  console.log('value.value', value.value.name)
  console.log('nodeDefinition.value?.name', nodeDefinition.value?.name)
  return value.value.name ?? nodeDefinition.value?.name ?? ''
})

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

const onNodeClick = () => {
  if (!isRunning.value) {
    showSidebar.value = true
  }
}

const hasErrored = computed(() => {
  return false
})
</script>

<style scoped lang="scss">
.condition-branches {
  display: flex;
}

.node-action-wrapper {
  display: flex;
  flex-direction: column;
  align-items: center;
  position: relative;
}

.node-action {
  cursor: pointer;
  position: relative;
  border: 1px solid #c2c9d1;
  padding: 4px 16px 4px 16px;
  border-radius: 4px;
  // width: fit-content;
  // min-width: 300px;
  background-color: white;
  display: flex;

  /*
  &::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    border: 4px solid green;
    border-radius: 4px;
    transition: all 0.5s;
    animation: clippath 3s infinite linear;
  }
  */

  &.disabled {
    // background-color: #eee;
    // color: white;
    opacity: 0.5;
  }

  &:hover {
    .hover-overlay {
      opacity: 1;
    }
  }

  box-shadow:
    0 0 #0000,
    0 0 #0000,
    0 0 22px rgba(186, 186, 191, 0.3);

  &.active {
    border: 1px solid blue;
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
  width: 100%;

  .content {
    display: flex;
    flex-direction: column;
    justify-content: center;
    flex: 1;
    padding: 4px 0;

    .title {
      cursor: text;
      font-size: 1rem;
      display: flex;
      align-items: baseline;
      gap: 16px;

      .original-title {
        font-size: 0.8rem;
        color: #999
      }
    }

    .subtitle {
      font-size: 0.8rem;
      color: #999;
      min-height: 28px;
      flex: 1;
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 2px;
    }
  }

  .actions {
    display: flex;
    flex-direction: column;
  }
}

.hover-overlay {
  position: absolute;
  top: 0;
  left: 0;
  bottom: 0;
  right: 0;
  width: 100%;
  height: 100%;
  background-color: rgba(0, 0, 0, 0.5);
  opacity: 0;
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 10;
  margin: 0 auto;
  transition: opacity 0.25s;

  .hover-overlay-content {
    display: flex;
    flex-direction: row;
    justify-content: space-between;
    gap: 8px;
    width: 100%;
    margin: 0 8px;

    .left,
    .center,
    .right {
      display: flex;
      flex-direction: row;
      justify-content: center;
      align-items: center;
      gap: 4px;

      button {
        // border: 1px solid #5f60b7;
      }
    }
  }
}

.small-btn {
  // --p-button-padding-y: 0;
  // --p-button-sm-padding-y: 0;
}

.danger {
  color: red;
}

@keyframes clippath {
  0%,
  100% {
    clip-path: inset(0 0 95% 0);
  }

  25% {
    clip-path: inset(0 95% 0 0);
  }
  50% {
    clip-path: inset(95% 0 0 0);
  }
  75% {
    clip-path: inset(0 0 0 95%);
  }
}
</style>
