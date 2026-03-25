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

    <Dialog
      v-model:visible="visible"
      :closable="false"
      modal
      header=""
      :style="{ width: '60%', maxWidth: '800px' }"
      :content-style="{ padding: '1rem' }"
      :breakpoints="{ '960px': '75vw', '641px': '90vw' }"
    >
      <template #header>
        <div class="flex flex-column w-full">
          <div class="text-xl">Add plugin</div>
          <div class="search w-full">
            <IconField class="search-field w-full" icon-position="left">
              <InputIcon class="pi pi-search"> </InputIcon>
              <InputText
                ref="$searchInput"
                v-model="search"
                placeholder="Search..."
                class="w-full"
              />
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
                    class="element"
                    :class="{
                      selected: selected?.nodeId === node.node.id && selected.pluginId === plugin.id
                    }"
                  >
                    <i class="pi" :class="node.node.icon || 'pi-box'"></i>
                    <div class="node-details">
                      <span class="node-name">
                        {{ node.node.name }}
                        <span v-if="node.node.version" class="version"
                          >v{{ node.node.version }}</span
                        >
                      </span>
                      <p v-if="node.node.description" class="node-description">
                        {{ node.node.description }}
                      </p>
                      <span
                        v-if="typeof node.node.disabled === 'string'"
                        class="text-xs text-warning mt-1 block"
                      >
                        {{ node.node.disabled }}
                      </span>
                    </div>
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
            <label for="advanced-nodes-checkbox"> {{ $t('editor.display-advanced-nodes') }} </label>
          </div>

          <div class="flex justify-content-end gap-2">
            <Button
              type="button"
              :label="$t('base.cancel')"
              severity="secondary"
              @click="visible = false"
            ></Button>
            <Button type="button" :label="$t('base.add')" @click="onAdd"></Button>
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
  if (node.node.advanced && displayAdvancedNodes.value) {
    return true
  } else if (node.node.advanced && !displayAdvancedNodes.value) {
    return false
  } else if (node.node.disabled) {
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
  if (node.type !== 'action') {
    return false
  }

  if (!searchedValue) return true

  const searchTerms = searchedValue.toLowerCase().split(/\s+/)
  const description = node.description?.toLowerCase() || ''
  const name = node.name.toLowerCase()
  const tags = node.tags?.map((tag) => tag.toLowerCase()) || []
  const allText = `${name} ${description} ${tags.join(' ')}`

  return searchTerms.every(
    (term) => allText.includes(term) || term.split('').every((char) => allText.includes(char))
  )
}

const searchedElements = computed(() => {
  const searchedValue = search.value.trim()

  return pluginDefinitions.value
    .map((def) => ({
      ...def,
      nodes: def.nodes.filter((node) => isNodePicked(node.node, searchedValue))
    }))
    .filter((def) => {
      if (!searchedValue) return true

      const defName = def.name.toLowerCase()
      const defDescription = (def.description || '').toLowerCase()
      const searchTerms = searchedValue.toLowerCase().split(/\s+/)

      return searchTerms.every(
        (term) =>
          defName.includes(term) || defDescription.includes(term) || def.nodes.some(() => true) // Keep if any nodes matched
      )
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
  margin: 8px 0;
  max-height: 60vh;
  overflow-y: auto;
  padding-right: 4px;

  .plugin {
    margin: 8px 0;

    &:first-child {
      margin-top: 0;
    }
  }

  /* Custom scrollbar */
  &::-webkit-scrollbar {
    width: 6px;
  }

  &::-webkit-scrollbar-track {
    background: var(--surface-100);
    border-radius: 3px;
  }

  &::-webkit-scrollbar-thumb {
    background: var(--surface-300);
    border-radius: 3px;

    &:hover {
      background: var(--surface-400);
    }
  }
}

.triggers {
  .node {
    .node-item {
      cursor: pointer;
      padding: 0;
      margin: 2px 0;
      border-radius: 4px;
      transition: all 0.15s ease;

      &[disabled] {
        pointer-events: none;
        opacity: 0.5;
      }

      .element {
        padding: 8px 12px;
        border-radius: 6px;
        border: 1px solid transparent;
        transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);

        .font-bold {
          font-size: 0.9rem;
          line-height: 1.2;
        }

        .text-secondary {
          font-size: 0.8rem;
          line-height: 1.2;
          opacity: 0.8;
        }
      }
    }
  }
}

.element {
  display: flex;
  align-items: flex-start;
  padding: 0.5rem 0.75rem;
  border-radius: 4px;
  transition: all 0.15s ease;
  width: 100%;

  i {
    margin-top: 2px;
    font-size: 1rem;
    margin-right: 0.75rem;
    color: var(--p-text-color-secondary);
    transition: all 0.2s ease;
  }

  .node-details {
    flex: 1;
    min-width: 0;

    .node-name {
      font-weight: 500;
      margin-bottom: 2px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      transition: color 0.2s ease;

      .version {
        opacity: 0.7;
        font-size: 0.85em;
        margin-left: 4px;
      }
    }

    .node-description {
      display: -webkit-box;
      -webkit-line-clamp: 2;
      line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
      font-size: 0.85rem;
      line-height: 1.3;
      color: var(--p-text-color-secondary);
      margin: 0;
      max-height: 2.6em;
    }
  }

  &:hover {
    background-color: var(--p-surface-100);
    border-color: var(--p-surface-200);

    .node-description {
      color: var(--p-text-color);
    }

    .node-name {
      color: var(--p-primary-color);
    }
  }

  &:active {
    transform: translateY(0);
    transition-duration: 0.1s;
  }

  &.selected {
    width: 100%;
    color: var(--p-primary-color-text);
    background-color: var(--p-surface-300);
    border-color: var(--p-primary-color);

    .node-details {
      .node-name {
        font-weight: 600;
      }
    }

    i {
      color: var(--p-primary-color-text);
    }

    &:hover {
      border-color: var(--p-primary-color);
    }
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
