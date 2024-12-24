<template>
  <div ref="$nodeConditionWrapper" class="node-condition-wrapper">
    <div
      class="node-condition"
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

        <span class="pi pi-question-circle"></span>
      </div>
    </div>

    <div class="vl center"></div>

    <div class="condition-branches">
      <div class="hl top"></div>
      <div class="branches">
        <div class="branch-true">
          <div class="vl left"></div>
          <!-- @vue-ignore -->
          <NodesEditor
            :path="[...path, 'branchTrue']"
            :extra-add-button="false"
            :nodes="value.branchTrue"
            :steps="steps"
            :errors="errors"
          ></NodesEditor>
        </div>
        <div class="branch-false">
          <div class="vl right"></div>
          <!-- @vue-ignore -->
          <NodesEditor
            :path="[...path, 'branchFalse']"
            :extra-add-button="false"
            :nodes="value.branchFalse"
            :steps="steps"
            :errors="errors"
          ></NodesEditor>
        </div>
      </div>
      <div class="hl bottom"></div>
    </div>

    <Drawer v-model:visible="showSidebar" class="w-full md:w-10 lg:w-9 xl:w-8" position="right">
      <template v-if="nodeDefinition">
        <div v-for="(param, key) in nodeDefinition.params" :key="key" class="param">
          <!-- @vue-ignore -->
          <ParamEditor
            :param="value.params[key]"
            :param-key="key"
            :param-definition="param"
            @update:model-value="onValueChanged($event, key.toString())"
            :value="value"
            :steps="steps"
          ></ParamEditor>
        </div>
      </template>
      <pre>value: {{ value }}</pre>
      <pre>
getNodeDefinition: {{ getNodeDefinition(value.origin.nodeId, value.origin.pluginId) }}</pre
      >
    </Drawer>
  </div>
</template>

<script setup lang="ts">
import { useEditor } from '@renderer/store/editor'
import { PropType, computed, ref, toRefs } from 'vue'
import NodesEditor from '@renderer/pages/nodes-editor.vue'
import { BlockCondition } from '@@/model'
import { storeToRefs } from 'pinia'
import { computedAsync } from '@vueuse/core'
import PluginIcon from './PluginIcon.vue'
import { Condition } from '@plugins/plugin-core'
import { ValidationError } from '@renderer/models/error'
import { useLogger } from '@@/logger'

const props = defineProps({
  value: {
    type: Object as PropType<BlockCondition>,
    required: true
  },
  path: {
    type: Array as PropType<string[]>,
    required: true
    // default: () => []
  },
  errors: {
    type: Object as PropType<Record<string, ValidationError[]>>,
    required: false,
    default: () => ({})
  }
})

const { value } = toRefs(props)

const $nodeConditionWrapper = ref<HTMLDivElement>()

const { logger } = useLogger()

const subtitle = computedAsync(
  async () => {
    // const result = await engine.parseAndRender(nodeDefinition.value?.displayString ?? '', {
    //   params: value.value.params
    // })
    // return result
    return 'TODO'
  },
  'Loading...',
  {
    onError: (error) => {
      logger().error('error', error)
    }
  }
)

const editor = useEditor()
const { getNodeDefinition, setBlockValue, getPluginDefinition } = editor
const { activeNode } = storeToRefs(editor)

const onValueChanged = (newValue: unknown, paramKey: string) => {
  // @ts-expect-error not yet condition type
  setBlockValue(value.value.uid, {
    ...value.value,
    params: {
      ...value.value.params,
      [paramKey]: newValue
    }
  })
}

const nodeDefinition = computed(() => {
  return getNodeDefinition(value.value.origin.nodeId, value.value.origin.pluginId).node as Condition
})

const pluginDefinition = computed(() => {
  return getPluginDefinition(value.value.origin.pluginId)
})

const showSidebar = ref(false)
</script>

<style scoped>
.condition-branches {
  display: flex;
  flex-direction: column;
}

.branches {
  display: flex;
  gap: 16px;
}

.node-condition-wrapper {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}

.node-condition {
  border: 1px solid #c2c9d1;
  padding: 16px;
  border-radius: 4px;
  width: fit-content;
  background-color: white;

  &.active {
    outline: 1px solid red;
    outline-offset: 3px;
  }

  .subtitle {
    font-size: 0.75rem;
    color: #999;
  }
}

.branch-true,
.branch-false {
  display: flex;
  flex-direction: column;
  align-items: center;
  flex: 1;
}

.vl {
  height: 32px;

  &.center {
    border-left: 2px solid #c2c9d1;
  }

  &.left {
    border-left: 2px solid #c2c9d1;
    border-top-left-radius: 8px;
    width: 16px;
    margin-right: -8px;
  }

  &.right {
    border-right: 2px solid #c2c9d1;
    border-top-right-radius: 8px;
    width: 16px;
    margin-left: -8px;
  }
}

.hl {
  /* width: v-bind(nodeConditionWrapperWidth); */
  /* left: 24%; */
  left: calc(25% - 8px);
  width: calc(50% + 16px);
  position: relative;

  &.top {
    border-top: 2px solid #c2c9d1;
    border-top-left-radius: 8px;
    border-top-right-radius: 8px;
    height: 8px;
    margin-bottom: -8px;
  }

  &.bottom {
    border-bottom: 2px solid #c2c9d1;
    border-bottom-left-radius: 8px;
    border-top-right-radius: 8px;
    height: 8px;
    margin-top: -8px;
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
  }
}
</style>
