<template>
  <div class="node-event-wrapper">
    <div
      class="node-event"
    >
      <div class="vertical">
        <PluginIcon :icon="{ icon: 'mdi mdi-help-circle', type: 'icon' }"></PluginIcon>

        <div class="content">
          <div class="title">
            <span class="">No trigger selected</span>
          </div>
          <div class="subtitle">
            Click here to select one
          </div>
        </div>

        <span class="pi pi-bolt"></span>
      </div>
    </div>
    <AddTriggerButton
      :button-props="{ size: 'small', icon: 'pi pi-plus' }"
      class="add-btn"
      :path="path"
      @add-node="addTrigger"
    ></AddTriggerButton>
  </div>
</template>

<script setup lang="ts">
import { useEditor } from '@renderer/store/editor'
import { storeToRefs } from 'pinia'
import { PropType, computed, ref, toRefs } from 'vue'
import PluginIcon from './PluginIcon.vue'
import AddTriggerButton from '../AddTriggerButton.vue'

const props = defineProps({
  path: {
    type: Array as PropType<string[]>,
    required: true
    // default: () => []
  },
})

const editor = useEditor()
const { getNodeDefinition, getPluginDefinition, setTriggerValue, addNode, addTrigger, removeTrigger } = editor
const { activeNode } = storeToRefs(editor)
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
