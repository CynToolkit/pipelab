<template>
  <div v-on-click-outside="onClickOutside" class="param-editor" @click="onClickInside">
    <div class="editor">
      <div class="flex flex-column gap-1 editor-content">
        <div class="label">
          <!-- Label -->
          <label :for="`data-${paramKey}`"
            >{{ paramDefinition.label }}
            <span
              v-if="!('required' in paramDefinition) || paramDefinition.required === true"
              class="required"
            >
              *</span
            >
          </label>

          <div class="infos">
            <!-- Is valid button -->
            <Button
              v-tooltip.top="expectedTooltip"
              text
              size="small"
              rounded
              :severity="isExpectedValid ? 'success' : 'danger'"
            >
              <template #icon>
                <i class="mdi" :class="{ [paramIcon]: true }"></i>
              </template>
            </Button>
          </div>
        </div>

        <!-- Code editor -->
        <div ref="$codeEditorText" class="code-editor"></div>

        <!-- Hint text -->
        <Skeleton v-if="hintText === undefined" height="20px"></Skeleton>
        <div v-else v-dompurify-html="hintText" class="hint" :class="{ error: isError }"></div>

        <!-- Floating indicator -->
        <div
          v-if="isModalDisplayed"
          ref="$floating"
          class="floating"
          :style="{ ...floatingStyles, zIndex: 1 }"
        >
          <svg
            ref="$arrow"
            :style="{
              position: 'absolute',
              left: middlewareData.arrow?.x != null ? `${middlewareData.arrow.x}px` : '',
              top: middlewareData.arrow?.y != null ? `${middlewareData.arrow.y}px` : ''
            }"
            class="fill-gray-800"
            aria-hidden="true"
            width="14"
            height="14"
            viewBox="0 0 14 14"
            style="position: absolute; pointer-events: none; top: 100%; left: 32.5px"
          >
            <path stroke="none" d="M0,0 H14 L7,7 Q7,7 7,7 Z"></path>
            <clipPath id=":r8:"><rect x="0" y="0" width="14" height="14"></rect></clipPath>
          </svg>

          <div class="helpers">
            <!-- Value -->
            <Panel header="Value" toggleable>
              <div class="editor">
                <div v-if="paramDefinition.control.type === 'boolean'" class="boolean">
                  <SelectButton
                    :model-value="resultValue"
                    option-label="text"
                    option-value="value"
                    :options="[
                      { text: 'True', value: true },
                      { text: 'False', value: false }
                    ]"
                    aria-labelledby="basic"
                    @change="insertEditorReplace($event.value)"
                  >
                    <template #option="slotProps">
                      <span>{{ slotProps.option.text }}</span>
                    </template>
                  </SelectButton>
                  <p v-if="!isValueSimpleBoolean(param)">Value will be overwitten!</p>
                </div>
                <div v-if="paramDefinition.control.type === 'path'" class="path">
                  <Button
                    class="w-full"
                    @click="onChangePathClick(paramDefinition.control.options)"
                  >
                    {{ paramDefinition.control.label ?? 'Browse path' }}
                  </Button>
                </div>
                <div v-if="paramDefinition.control.type === 'select'" class="select">
                  <Listbox
                    :model-value="param"
                    :options="paramDefinition.control.options.options"
                    filter
                    option-label="label"
                    class="w-full md:w-56"
                    @change="onParamSelectChange"
                  />
                </div>
              </div>
            </Panel>
            <!-- Outputs -->
            <Panel header="Outputs" toggleable>
              <div class="steps-list">
                <template v-for="(step, stepUid) in steps" :key="stepUid">
                  <div v-if="Object.keys(step.outputs).length > 0" class="step-item">
                    <div class="step-name">{{ getStepLabel(stepUid) }}</div>

                    <div class="step-outputs">
                      <div v-for="(_output, outputKey) in step.outputs" class="step-output">
                        <div
                          class="step"
                          @click="insertEditorEnd(`steps['${stepUid}']['outputs']['${outputKey}']`)"
                        >
                          {{ getOutputLabel(stepUid, outputKey) }}
                        </div>
                        <div
                          class="step-description"
                          @click="insertEditorEnd(`steps['${stepUid}']['outputs']['${outputKey}']`)"
                        >
                          {{ getOutputDescription(stepUid, outputKey) }}
                        </div>
                      </div>
                    </div>
                  </div>
                </template>
              </div>
            </Panel>
          </div>
        </div>
      </div>
    </div>
    <!-- <div class="debug">
      <pre>paramDefinition.value: {{ paramDefinition }}</pre>
      <pre>params: {{ param }}</pre>
    </div> -->
  </div>
</template>

<script setup lang="ts">
import { PropType, computed, ref, toRefs, watch } from 'vue'
import type { ValueOf } from 'type-fest'
import { Action, Condition, Event } from '@cyn/plugin-core'
import { useAPI } from '@renderer/composables/api'
import { createCodeEditor } from '@renderer/utils/code-editor'
import { createQuickJs } from '@renderer/utils/quickjs'
import { watchDebounced } from '@vueuse/core'
import { BlockAction, BlockCondition, BlockEvent, BlockLoop, Steps } from '@@/model'
import DOMPurify from 'dompurify'
import { controlsToIcon, controlsToType } from '@renderer/models/controls'
import { Completion, CompletionContext } from '@codemirror/autocomplete'
import { javascriptLanguage } from '@codemirror/lang-javascript'
import vTooltip from 'primevue/tooltip'
import { syntaxTree } from '@codemirror/language'
import { linter, Diagnostic } from '@codemirror/lint'
import {
  arrow,
  autoPlacement,
  autoUpdate,
  flip,
  offset,
  shift,
  useFloating
} from '@floating-ui/vue'
import { vOnClickOutside } from '@vueuse/components'
import { useEditor } from '@renderer/store/editor'
import { storeToRefs } from 'pinia'
import { ListboxChangeEvent } from 'primevue/listbox'
import type { OpenDialogOptions } from 'electron'
import { useLogger } from '@@/logger'

type Params = (Action | Condition | Event)['params']

const props = defineProps({
  param: {
    type: [String, Boolean, Number] as PropType<unknown>,
    required: true
  },
  paramDefinition: {
    type: Object as PropType<ValueOf<Params>>,
    required: true
  },
  paramKey: {
    type: [String, Number],
    required: true
  },

  value: {
    type: Object as PropType<BlockAction | BlockEvent | BlockCondition | BlockLoop>,
    required: true
  },
  steps: {
    type: Object as PropType<Steps>,
    required: true
  }
})

const { param, paramKey, paramDefinition, steps, value } = toRefs(props)

const editor = useEditor()
const { getNodeDefinition, setBlockValue, addNode, getPluginDefinition } = editor
const { nodes } = storeToRefs(editor)

const emit = defineEmits<{
  (event: 'update:modelValue', data: any): void
}>()

const isError = ref(false)
const hintText = ref<string>()
const resultValue = ref<unknown>()

const $codeEditorText = ref<HTMLDivElement>()
const $floating = ref<HTMLDivElement>()
const $arrow = ref<HTMLElement>()

const isValueSimpleBoolean = (str: string | unknown) => {
  return str === 'true' || str === 'false'
}

function myCompletions(context: CompletionContext) {
  const word = context.matchBefore(/\w*/)
  if (word) {
    if (word.from == word.to && !context.explicit) return null
    return {
      from: word.from,
      options: [
        { label: 'match', type: 'keyword', boost: 10 },
        { label: 'hello', type: 'variable', info: '(World)' },
        { label: 'magic', type: 'text', apply: '⠁⭒*.✩.*⭒⠁', detail: 'macro' }
      ] satisfies Completion[]
    }
  }
}

const regexpLinter = linter((view) => {
  const diagnostics: Diagnostic[] = []
  syntaxTree(view.state)
    .cursor()
    .iterate((node) => {
      if (node.name == 'RegExp')
        diagnostics.push({
          from: node.from,
          to: node.to,
          severity: 'warning',
          message: 'Regular expressions are FORBIDDEN',
          actions: [
            {
              name: 'Remove',
              apply(view, from, to) {
                view.dispatch({ changes: { from, to } })
              }
            }
          ]
        })
    })
  return diagnostics
})

const {
  update: codeEditorTextUpdate,
  onUpdate: onCodeEditorTextUpdate,
  value: editorTextValue
} = createCodeEditor($codeEditorText, [
  javascriptLanguage.data.of({
    autocomplete: myCompletions
  })
])

const insertEditorEnd = (str: string | number | boolean) => {
  codeEditorTextUpdate(editorTextValue.value + str.toString())
}

const insertEditorReplace = (str: string | number | boolean) => {
  codeEditorTextUpdate(str.toString())
}

const { floatingStyles, middlewareData } = useFloating($codeEditorText, $floating, {
  placement: 'left',
  middleware: [
    offset(10),
    shift(),
    flip({
      fallbackPlacements: ['bottom']
    }),
    arrow({ element: $arrow })
  ],
  whileElementsMounted: autoUpdate
})

const debounce = <T extends (...args: any[]) => void>(
  func: T,
  delay: number
): ((...args: Parameters<T>) => void) => {
  let timeoutId: ReturnType<typeof setTimeout>

  return (...args: Parameters<T>): void => {
    clearTimeout(timeoutId)
    timeoutId = setTimeout(() => func(...args), delay)
  }
}

const resolveHintTextResult = (result: unknown) => {
  if (paramDefinition.value.control.type === 'select') {
    const label = paramDefinition.value.control.options.options.find(
      (o) => o.value === result
    )?.label
    if (label) {
      return label
    }
  }
  return (result as string).toString()
}

// @ts-expect-error tsconfig
const vm = await createQuickJs()

watchDebounced(
  editorTextValue,
  async () => {
    const displayString = editorTextValue.value

    if (!displayString) {
      return
    }

    try {
      const result = await vm.run(displayString, {
        params: {},
        // params: resolvedParams.value,
        steps: steps.value
      })
      resultValue.value = result
      hintText.value = resolveHintTextResult(result)
      isError.value = false
    } catch (e) {
      logger().error('e', JSON.stringify(e))
      if (e instanceof Error) {
        hintText.value = /* e.name + ' ' +  */ e.message
        isError.value = true
      } else {
        logger().error('e', e)
      }
    }
  },
  {
    debounce: 300,
    immediate: true
  }
)

watch(
  param,
  (newValue) => {
    if (newValue) {
      codeEditorTextUpdate((newValue as string).toString())
    }
  },
  {
    immediate: true
  }
)

const isModalDisplayed = ref(false)
const onClickInside = () => {
  isModalDisplayed.value = true
}
const onClickOutside = () => {
  isModalDisplayed.value = false
}

const onValueChanged = (newValue: string, paramKey: string) => {
  emit('update:modelValue', newValue)
}

onCodeEditorTextUpdate((value) => {
  onValueChanged(value, paramKey.value.toString())
})

const getOutputLabel = (stepUid: string, key: string) => {
  const nodeOrigin = nodes.value.find((n) => n.uid === stepUid)?.origin
  if (nodeOrigin) {
    const nodeDef = getNodeDefinition(nodeOrigin.nodeId, nodeOrigin.pluginId).node as Action
    if (nodeDef) {
      return nodeDef.outputs[key]?.label ?? key
    }
    return key
  }
  return key
}

const getOutputDescription = (stepUid: string, key: string) => {
  const nodeOrigin = nodes.value.find((n) => n.uid === stepUid)?.origin
  if (nodeOrigin) {
    const nodeDef = getNodeDefinition(nodeOrigin.nodeId, nodeOrigin.pluginId).node as Action
    if (nodeDef) {
      return nodeDef.outputs[key]?.description ?? key
    }
    return key
  }
  return key
}

const getStepLabel = (key: string) => {
  const nodeOrigin = nodes.value.find((n) => n.uid === key)?.origin
  if (nodeOrigin) {
    const nodeDef = getNodeDefinition(nodeOrigin.nodeId, nodeOrigin.pluginId)
    if (nodeDef) {
      return nodeDef.node.name
    }
    return key
  }
  return key
}

/** On path selection */
const api = useAPI()

const { logger } = useLogger()

const onChangePathClick = async (options: OpenDialogOptions) => {
  const paths = await api.execute('dialog:showOpenDialog', options, async (_, message) => {
    const { type, data } = message
    if (type === 'end') {
      logger().info('end', data)
    }
  })

  logger().info('paths', paths)
  const p = paths.filePaths[0]

  insertEditorEnd(`"${p}"`)
}

const paramType = computed(() => {
  return controlsToType(paramDefinition.value.control)
})

const paramIcon = computed(() => {
  return controlsToIcon(paramDefinition.value.control)
})

const isExpectedValid = computed(() => {
  return paramType.value === typeof resultValue.value
})

const expectedTooltip = computed(() => {
  return `Expected: ${paramType.value}, got ${typeof resultValue.value}`
})

const onParamSelectChange = (event: ListboxChangeEvent) => {
  insertEditorEnd(`"${event.value.value}"`)
}
</script>

<style scoped lang="scss">
.editor-content {
  width: 100%;
}

.param-editor {
  display: flex;
  flex-direction: row;
  gap: 8px;

  .editor {
    flex: 1;
    width: 100%;
  }
}

.code-editor {
  // border: 1px solid #BDBDBD;
  // height: 28px;
  // border-radius: 4px;
  // overflow: hidden;

  :deep(.cm-focused) {
    outline: none;
  }

  :deep(.cm-editor) {
    // height: 28px;
    border: 1px solid #bdbdbd;
    border-radius: 4px;

    .cm-gutters {
      border-radius: 4px 0 0 4px;
    }
  }
}

.hint {
  height: 20px;
  display: flex;
  align-items: baseline;
  &.error {
    color: red;
  }
}

.floating {
  border: 1px solid grey;
  min-width: 424px;
  padding: 8px;
  border-radius: 4px;
  background-color: white;
  box-shadow: 0 0 10px rgba(0, 0, 0, 0.1);
  z-index: 2 !important;
}

.label {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
}

.steps-list {
  display: flex;
  flex-direction: column;
  gap: 8px;

  .step-item {
    font-size: 1rem;
    font-size: large;

    .step-name {
      margin-bottom: 8px;
    }
  }
  .step-outputs {
    display: flex;
    flex-direction: column;
    gap: 4px;

    .step-output {
      gap: 8px;
      font-size: 0.875rem;
      border-radius: 4px;
      padding: 4px;

      &:hover {
        cursor: pointer;
        background-color: #f5f5f5;
      }

      .step {
        cursor: pointer;
      }

      .step-description {
        color: #aaa;
      }
    }
  }
}

.helpers {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.required {
  color: red;
}
</style>
