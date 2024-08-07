<template>
  <div class="add-button-wrapper">
    <div class="vl"></div>
    <Button v-bind="buttonProps" class="add-btn" size="small" @click="addNode"></Button>
    <!-- <pre>{{ path }}</pre> -->
    <div class="vl"></div>

    <Dialog :closable="false" v-model:visible="visible" modal header="" :style="{ width: '75%' }">
      <template #header>
        <div class="flex flex-column w-full">
          <p class="text-xl">Add trigger</p>
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
            <ul class="trigger list-none p-0 m-0">
              <li class="flex align-items-center mb-3">
                <span class="mr-3">
                  <img v-if="plugin.icon.type === 'image'" width="32" :src="plugin.icon.image" />
                  <i
                    v-else-if="plugin.icon.type === 'icon'"
                    style="font-size: 2rem"
                    :class="{ 'trigger-icon': true, mdi: true, [plugin.icon.icon]: true }"
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
                v-for="trigger in plugin.triggers"
                :key="trigger.node.id"
                class="flex trigger-item"
                @click="selected = { triggerId: trigger.node.id, pluginId: plugin.id }"
                :disabled="trigger.disabled"
              >
                <a
                  class="element flex align-items-center p-3 border-round w-full transition-colors transition-duration-150 cursor-pointer"
                  style="border-radius: '10px'"
                  :class="{
                    selected: selected?.triggerId === trigger.node.id && selected.pluginId === plugin.id
                  }"
                >
                  <i class="pi pi-home text-xl mr-3"></i>
                  <span class="flex flex-column">
                    <span class="font-bold mb-1"> {{ trigger.node.name }}</span>
                    <span class="m-0 text-secondary"> {{ trigger.node.description }}</span>
                    <span class="m-0 text-secondary font-bold" v-if="typeof trigger.disabled === 'string'">{{ trigger.disabled }}</span>
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
    <!-- <TieredMenu ref="$menu" :model="triggerMenuItems" :popup="true"></TieredMenu> -->
  </div>
</template>

<script lang="ts" setup>
import { useEditor } from '@renderer/store/editor'
import { PropType, computed, ref, toRefs, watchEffect } from 'vue'

import { storeToRefs } from 'pinia'
import Button from 'primevue/button'
import InputText from 'primevue/inputtext'
import { useAppStore } from '@renderer/store/app'
import { CynNode, Event } from '@@/libs/plugin-core'
import { useLogger } from '@@/logger'

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

const { pluginDefinitions } = storeToRefs(appStore)
const $searchInput = ref<InstanceType<typeof InputText>>()

const visible = ref(false)
const search = ref('')

const { logger } = useLogger()

watchEffect(() => {
  if (visible.value === true) {
    const el = $searchInput.value?.$el as HTMLInputElement

    if (el) {
      el.focus()
    }
  }
})

const selected = ref<{ triggerId: string; pluginId: string }>()

const addNode = () => {
  visible.value = true
}

const editor = useEditor()
const { getNodeDefinition, getPluginDefinition } = editor

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

  const trigger = getNodeDefinition(selection.triggerId, selection.pluginId)

  if (!trigger) {
    logger().error('cannot find trigger')
    return
  }

  const insertAt = Number.parseInt(path.value.pop() ?? '0') + 1

  instance.addTrigger({
    trigger: trigger.node as Event,
    plugin: def,
    path: path.value,
    insertAt
  })

  visible.value = false
}

const isNodePicked = (trigger: CynNode, searchedValue: string) => {
  const description = trigger.description.toLowerCase()
  const name = trigger.name.toLowerCase()

  if (trigger.type !== 'event') {
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

      const someNodeMatch = def.nodes.some((trigger) => isNodePicked(trigger.node, searchedValue))

      if (description.includes(searchedValue) || name.includes(searchedValue) || someNodeMatch) {
        return true
      }
      return false
    })
    .map((def) => {
      return {
        ...def,
        triggers: def.nodes.filter((trigger) => isNodePicked(trigger.node, searchedValue))
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

.triggers {
  margin: 8px;
  display: grid;
  grid-template-columns: 4fr;
  gap: 4px;

  .trigger {
    flex: 1;

    .trigger-item {
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
</style>
