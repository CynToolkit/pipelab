<template>
  <!-- ScenarioListItem is now unused. All scenario display logic is in index.vue DataTable. -->
  <div></div>
</template>

<script lang="ts" setup>
import { useAppStore } from '@renderer/store/app'
import { walker } from '@renderer/utils/graph'
import { Origin, SavedFile } from '@@/model'
import { IconType } from '@pipelab/plugin-core'
import { PropType, ref, toRaw, toRefs, watchEffect } from 'vue'
import PluginIcon from './nodes/PluginIcon.vue'
import { EnhancedFile } from '@@/model'
import { klona } from 'klona'

const props = defineProps({
  scenario: {
    type: Object as PropType<EnhancedFile>,
    required: true
  },
  noDeleteBtn: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits<{
  delete: [payload: SavedFile]
  open: [payload: SavedFile]
  duplicate: [payload: SavedFile]
}>()

const { scenario } = toRefs(props)

const appStore = useAppStore()
const { getPluginDefinition } = appStore

const icons = ref<(IconType & { origin: Origin })[]>([])

watchEffect(async () => {
  const newIcons: (IconType & { origin: Origin })[] = []
  await walker(scenario.value.content.canvas.blocks, async (node) => {
    const def = getPluginDefinition(node.origin.pluginId)
    if (def) {
      newIcons.push({
        origin: node.origin,
        ...def.icon
      })
    }
  })
  if (newIcons.length > 4) {
    icons.value = [
      ...newIcons.slice(0, 3),
      {
        type: 'icon',
        icon: 'mdi-plus',
        origin: {
          nodeId: '0',
          pluginId: '0'
        }
      }
    ]
  } else {
    icons.value = newIcons
  }

  // console.log('icons.value', icons.value)
  // icons.value = icons.value.filter((x) => icons.value.map((y) => y.origin).indexOf(x) >= 0)
  // console.log('icons.value', icons.value)
})

const onDelete = () => {
  emit('delete', scenario.value.content)
}

const onDuplicate = () => {
  console.log('scenario.value', scenario.value)
  console.log('scenario.value', scenario.value.content)
  emit('duplicate', scenario.value.content)
}

const onOpen = () => {
  emit('open', scenario.value.content)
}
</script>

<style lang="scss" scoped>
.scenario {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-height: 66px;
  border: 1px solid #eee;
  margin: 4px;
  border-radius: 16px;
  flex: 1 1 0px;
  overflow: hidden;

  &:hover {
    background-color: rgba(150, 150, 150, 0.1);
  }

  .description {
    font-size: 0.875rem;
    color: #aaa;

    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .name {
    display: flex;
    flex-direction: column;
    padding: 8px;
  }

  .actions {
    display: flex;
    flex-direction: row;
    justify-content: center;
    padding: 8px;
  }
}

.scenario-plugins {
  display: flex;
  flex-direction: row;
  background: #eee;
  height: 100%;
  align-items: center;
  width: 100%;
  padding: 4px;
  flex: 1;
  justify-content: space-between;

  .icons {
    display: flex;
    gap: 4px;
  }

  .buttons {
    margin-right: 6px;
  }

  .scenario-plugin {
    display: flex;
    justify-content: center;
    align-items: center;

    width: 48px;
    height: 48px;
    width: 100%;
  }
}
</style>
