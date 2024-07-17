<template>
  <div class="add-button-wrapper">
    <div class="vl"></div>
    <Button v-bind="buttonProps" class="add-btn" size="small" @click="addNode"></Button>
    <!-- <pre>{{ path }}</pre> -->
    <div class="vl"></div>

    <Dialog :closable="false" v-model:visible="visible" modal header="" :style="{ width: '75%' }">
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
          <div class="nodes">
            <ul class="node list-none p-0 m-0">
              <li class="flex align-items-center mb-3">
                <span class="mr-3">
                  <img
                    v-if="plugin.icon.type === 'image'"
                    width="32"
                    :src="plugin.icon.image"
                  />
                  <i
                    v-else-if="plugin.icon.type === 'icon'"
                    style="font-size: 2rem"
                    :class="{ 'node-icon': true, mdi: true, [plugin.icon.icon]: true }"
                  />

                  <!-- <img v-if="plugin.icon" width="24" class="w-2rem h-2rem" :src="plugin.icon" />
                  <i v-else class="pi pi-circle" style="font-size: 2rem"></i> -->
                </span>
                <div class="flex flex-column">
                  <span class="font-bold mb-1">{{ plugin.name }}</span>
                  <!-- <span class="text-secondary">Administrator</span> -->
                </div>
              </li>
              <li
                v-for="node in plugin.nodes"
                :key="node.id"
                class="flex"
                @click="selected = { nodeId: node.id, pluginId: plugin.id }"
              >
                <a
                  class="element flex align-items-center p-3 border-round w-full transition-colors transition-duration-150 cursor-pointer"
                  style="border-radius: '10px'"
                  :class="{ 'selected': selected?.nodeId === node.id && selected.pluginId === plugin.id }"
                >
                  <i class="pi pi-home text-xl mr-3"></i>
                  <span class="flex flex-column">
                    <span class="font-bold mb-1"> {{ node.name }}</span>
                    <span class="m-0 text-secondary"> {{ node.description }}</span>
                  </span>

                </a>
              </li>
            </ul>
          </div>
        </div>
      </div>

      <template #footer>
        <div class="flex justify-content-end gap-2 mt-4">
          <Button
            type="button"
            label="Cancel"
            severity="secondary"
            @click="visible = false"
          ></Button>
          <Button type="button" label="Ajouter" @click="onAdd"></Button>
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
  }
})

const { path } = toRefs(props)

const instance = useEditor()
const appStore = useAppStore()

const { } = storeToRefs(instance)

const { pluginDefinitions } = storeToRefs(appStore)
const {  } = appStore

const $searchInput = ref<InstanceType<typeof InputText>>()

const visible = ref(false)
const search = ref('')

watchEffect(() => {
  if (visible.value === true) {
    const el = $searchInput.value?.$el as HTMLInputElement

    if (el) {
      el.focus()
    }
  }
})

const selected = ref<{ nodeId: string; pluginId: string }>()

const addNode = () => {
  visible.value = true
}

const editor = useEditor()
const { getNodeDefinition, getPluginDefinition } = editor

const onAdd = () => {
  const selection = selected.value

  if (!selection) {
    console.error('cannot find selection')
    return
  }

  const def = getPluginDefinition(selection.pluginId)

  if (!def) {
    console.error('cannot find definition')
    return
  }

  const node = getNodeDefinition(selection.nodeId, selection.pluginId)

  if (!node) {
    console.error('cannot find node')
    return
  }

  const insertAt = Number.parseInt(path.value.pop() ?? '0') + 1

  instance.addNode({
    node,
    plugin: def,
    path: path.value,
    insertAt
  })

  visible.value = false
}

// TODO: refactor
const searchedElements = computed(() => {
  const searchedValue = search.value.toLowerCase()

  return pluginDefinitions.value
    .filter((def) => {
      const description = def.description.toLowerCase()
      const name = def.name.toLowerCase()

      const someNodeMatch = def.nodes.some((node) => {
        const description = node.description.toLowerCase()
        const name = node.name.toLowerCase()

        if (description.includes(searchedValue) || name.includes(searchedValue)) {
          return true
        }
        return false
      })

      if (description.includes(searchedValue) || name.includes(searchedValue) || someNodeMatch) {
        return true
      }
      return false
    })
    .map((def) => {
      return {
        ...def,
        nodes: def.nodes.filter((node) => {
          const description = node.description.toLowerCase()
          const name = node.name.toLowerCase()

          if (description.includes(searchedValue) || name.includes(searchedValue)) {
            return true
          }
          return false
        })
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
  height: 32px;
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

.nodes {
  margin: 8px;
  display: grid;
  grid-template-columns: 4fr;
  gap: 4px;

  .node {
    flex: 1;
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
</style>
