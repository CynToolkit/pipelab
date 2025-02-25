<template>
  <div class="add-button-wrapper">
    <div class="vl"></div>
    <Button
      :disabled="isRunning"
      v-bind="buttonProps"
      class="add-btn"
      size="small"
      :pt="{
        root: { style: { fontSize: '10px', width: '24px', height: '24px' } },
        icon: { style: { fontSize: '10px' } }
      }"
      @click="addNode"
    ></Button>
    <!-- <pre>{{ path }}</pre> -->
    <div class="vl"></div>

    <Dialog v-model:visible="visible" :closable="false" modal header="" :style="{ width: '75%' }">
      <template #header>
        <div class="flex flex-column w-full">
          <p class="text-xl">Add plugin</p>
          <div class="search">
            <IconField class="search-field" icon-position="left">
              <InputIcon class="pi pi-search"> </InputIcon>
              <InputText ref="$searchInput" v-model="search" placeholder="Search" />
            </IconField>
          </div>
        </div>
      </template>

      <div class="list">
        <div v-for="plugin in searchedElements" :key="plugin.id" class="plugin">
          <div class="triggers">
            <ul class="node list-none p-0 m-0">
              <li class="flex align-items-center mb-3">
                <span class="mr-3">
                  <PluginIcon width="32px" :icon="plugin.icon" />

                  <!-- <img v-if="plugin.icon" width="24" class="w-2rem h-2rem" :src="plugin.icon" />
                  <i v-else class="pi pi-circle" style="font-size: 2rem"></i> -->
                </span>
                <div class="flex flex-column">
                  <span class="font-bold mb-1">{{ plugin.name }}</span>
                  <!-- <span class="text-secondary">Administrator</span> -->
                </div>
              </li>
              <template v-for="node in plugin.nodes" :key="node.node.id">
                <li
                  v-if="shouldShowNode(node)"
                  class="flex node-item"
                  @click="selected = { nodeId: node.node.id, pluginId: plugin.id }"
                >
                  <a
                    class="element flex align-items-center p-3 border-round w-full transition-colors transition-duration-150 cursor-pointer"
                    style="border-radius: '10px'"
                    :class="{
                      selected: selected?.nodeId === node.node.id && selected.pluginId === plugin.id
                    }"
                  >
                    <i class="pi pi-home text-xl mr-3"></i>
                    <span class="flex flex-column">
                      <span class="font-bold mb-1">
                        <span>{{ node.node.name }}</span>
                        <span v-if="node.node.version"> (v{{ node.node.version }})</span>
                      </span>
                      <span class="m-0 text-secondary"> {{ node.node.description }}</span>
                      <span
                        v-if="typeof node.disabled === 'string'"
                        class="m-0 text-secondary font-bold"
                        >{{ node.disabled }}</span
                      >
                    </span>
                  </a>
                </li></template
              >
            </ul>
          </div>
        </div>
      </div>

      <template #footer>
        <div class="footer pt-4">
          <div class="flex justify-content-start gap-2">
            <Checkbox id="advanced-nodes-checkbox" v-model="displayAdvancedNodes" :binary="true" />
            <label for="advanced-nodes-checkbox"> Display advanced nodes </label>
          </div>

          <div class="flex justify-content-end gap-2">
            <Button
              type="button"
              label="Cancel"
              severity="secondary"
              @click="visible = false"
            ></Button>
            <Button type="button" label="Ajouter" @click="onAdd"></Button>
          </div>
        </div>
      </template>
    </Dialog>
    <!-- <TieredMenu ref="$menu" :model="nodeMenuItems" :popup="true"></TieredMenu> -->
  </div>
</template>

<script lang="ts" setup>
import { useEditor } from '@renderer/store/editor'
import { PropType, computed, ref, toRefs, watchEffect } from 'vue'

import { storeToRefs } from 'pinia'
import Button from 'primevue/button'
import InputText from 'primevue/inputtext'
import { useAppStore } from '@renderer/store/app'
import { PipelabNode, RendererNodeDefinition } from '@@/libs/plugin-core'
import { useLogger } from '@@/logger'
import PluginIcon from './nodes/PluginIcon.vue'

type ButtonProps = InstanceType<typeof Button>['$props']

const props = defineProps({
  buttonProps: {
    type: Object as PropType<ButtonProps>,
    required: false,
    default: () => ({})
  },
  path: {
    type: Array as PropType<string[]>,
    required: true
  },
  isRunning: {
    type: Boolean,
    required: false,
    default: false
  }
})

const { path, isRunning } = toRefs(props)

const instance = useEditor()
const appStore = useAppStore()

const { pluginDefinitions } = storeToRefs(appStore)
const $searchInput = ref<InstanceType<typeof InputText>>()

const visible = ref(false)
const search = ref('')
const displayAdvancedNodes = ref(false)

watchEffect(() => {
  if (visible.value === true) {
    const el = $searchInput.value?.$el as HTMLInputElement

    if (el) {
      el.focus()
    }
  }
})

const shouldShowNode = (node: RendererNodeDefinition) => {
  if (node.advanced && displayAdvancedNodes.value) {
    return true
  } else if (node.advanced && !displayAdvancedNodes.value ) {
    return false
  } else if (node.disabled) {
    return false
  } else {
    return true
  }
}

const selected = ref<{ nodeId: string; pluginId: string }>()

const addNode = () => {
  if (!isRunning.value) {
    visible.value = true
  }
}

const editor = useEditor()
const { getNodeDefinition, getPluginDefinition } = editor

const { logger } = useLogger()

const onAdd = () => {
  const selection = selected.value

  if (!selection) {
    logger().error('cannot find selection')
    return
  }

  const def = getPluginDefinition(selection.pluginId)

  if (!def) {
    logger().error('cannot find definition')
    return
  }

  const node = getNodeDefinition(selection.nodeId, selection.pluginId)

  if (!node) {
    logger().error('cannot find node')
    return
  }

  const insertAt = Number.parseInt(path.value.pop() ?? '0')

  instance.addNode({
    node: node.node,
    plugin: def,
    path: path.value,
    insertAt
  })

  visible.value = false
}

const isNodePicked = (node: PipelabNode, searchedValue: string) => {
  const description = node.description.toLowerCase()
  const name = node.name.toLowerCase()

  if (node.type !== 'action') {
    return false
  }

  if (description.includes(searchedValue) || name.includes(searchedValue)) {
    return true
  }
  return false
}

// TODO: refactor
const searchedElements = computed(() => {
  logger().info('pluginDefinitions', pluginDefinitions.value)
  const searchedValue = search.value.toLowerCase()

  return pluginDefinitions.value
    .filter((def) => {
      const description = def.description.toLowerCase()
      const name = def.name.toLowerCase()

      const someNodeMatch = def.nodes.some((node) => isNodePicked(node.node, searchedValue))

      if (description.includes(searchedValue) || name.includes(searchedValue) || someNodeMatch) {
        return true
      }
      return false
    })
    .map((def) => {
      return {
        ...def,
        nodes: def.nodes.filter((node) => isNodePicked(node.node, searchedValue))
      }
    })
})
</script>

<style lang="scss" scoped>
.add-button-wrapper {
  display: flex;
  flex-direction: column;
  align-items: center;
}

.vl {
  border-left: 2px solid #c2c9d1;
  height: 8px;
}

.content {
  min-height: 50vh;
}

.search {
  margin-top: 8px;
}

.search .search-field input {
  width: 100%;
}

.list {
  margin: 24px 8px;

  .plugin {
    margin-top: 24px;
  }
}

.triggers {
  margin: 8px;
  display: grid;
  grid-template-columns: 4fr;
  gap: 4px;

  .node {
    flex: 1;

    .node-item {
      cursor: pointer;

      &[disabled] {
        pointer-events: none;
        color: grey;
      }
    }
  }
}

.element {
  &:hover {
    // color: var(--p-primary-contrast-color);
    background-color: var(--p-surface-200);
  }
  &.selected {
    color: var(--p-primary-contrast-color);
    background-color: var(--p-primary-color);
  }
}

.footer {
  border-top: 1px solid #c2c9d1;
  display: flex;
  justify-content: space-between;
  width: 100%;
  align-items: baseline;
}
</style>
