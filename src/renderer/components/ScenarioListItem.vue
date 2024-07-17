<template>
  <div class="scenario">
    <div class="scenario-plugins">
      <div class="scenario-plugin" v-for="icon in icons">
        <PluginIcon width="40px" :icon="icon"></PluginIcon>
      </div>
    </div>
    <div class="name">
      <div class="title">{{ scenario.content.name }}</div>
      <div class="description">{{ scenario.content.description }}</div>
      <div class="description" v-if="scenario.type === 'external'">{{ scenario.path }}</div>
    </div>
    <div class="actions">
      <Button v-if="!noDeleteBtn" label="Delete" severity="danger" @click.stop="onDelete">
        <template #icon>
          <i class="mdi mdi-delete"></i>
        </template>
      </Button>
    </div>
  </div>
</template>

<script lang="ts" setup>
import { useAppStore } from '@renderer/store/app'
import { walker } from '@renderer/utils/graph'
import { SavedFile } from '@@/model'
import { IconType } from '@cyn/plugin-core'
import { PropType, Ref, ref, toRefs, watchEffect } from 'vue'
import PluginIcon from './nodes/PluginIcon.vue'
import { EnhancedFile } from '@@/model'

const props = defineProps({
  scenario: {
    type: Object as PropType<EnhancedFile>,
    required: true
  },
  noDeleteBtn: {
    type: Boolean,
    default: false,
  }
})

const emit = defineEmits<{
  'delete': [payload: SavedFile]
}>()

const { scenario } = toRefs(props)

const appStore = useAppStore()
const { getPluginDefinition } = appStore

const icons = ref<IconType[]>([])

watchEffect(async () => {
  const newIcons: IconType[] = []
  await walker(scenario.value.content.canvas.blocks, async (node) => {
    const def = getPluginDefinition(node.origin.pluginId)
    if (def) {
      newIcons.push(def.icon)
    }
  })
  if (newIcons.length > 4) {
    icons.value = [
      ...newIcons.slice(0, 3),
      {
        type: 'icon',
        icon: 'mdi-plus'
      }
    ]
  } else {
    icons.value = newIcons
  }
})

const onDelete = () => {
  emit('delete', scenario.value.content)
}
</script>

<style lang="scss" scoped>
.scenario {
  display: grid;
  grid-template-columns: calc(48px * 4) 1fr 150px;
  gap: 8px;
  cursor: pointer;
  min-height: 66px;
  border: 1px solid #eee;
  margin: 4px;
  border-radius: 4px;
  align-items: center;

  &:hover {
    background-color: rgba(150, 150, 150, 0.1);
  }

  .description {
    font-size: 0.875rem;
    color: #aaa;
  }

  .name {
    display: flex;
    flex-direction: column;
  }

  .actions {
    display: flex;
    flex-direction: row;
    margin-right: 8px;
    justify-content: flex-end;
  }
}

.scenario-plugins {
  display: flex;
  flex-direction: row;
  border-radius: 4px 0 0 4px;
  background: #eee;
  height: 100%;
  align-items: center;

  .scenario-plugin {
    display: flex;
    justify-content: center;
    align-items: center;

    width: 48px;
    height: 48px;
  }
}
</style>
