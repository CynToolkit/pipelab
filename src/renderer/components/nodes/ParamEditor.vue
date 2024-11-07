<template>
  <div v-on-click-outside="onClickOutside" class="param-editor" @click="onClickInside">
    <div class="editor">
      <div class="flex flex-column gap-1 editor-content">
        <div class="label">
          <!-- Label -->
          <label :for="`data-${paramKey}`">
            <span>{{ paramDefinition.label }}</span>
            <!-- Required -->
            <span
              v-if="!('required' in paramDefinition) || paramDefinition.required === true"
              class="required"
            >
              *
            </span>
            <!-- Tooltip -->
            <span v-if="paramDefinition.description" class="tooltip">
              <i v-tooltip="paramDefinition.description" class="mdi mdi-help-circle tooltip-icon" />
            </span>
            <!-- Platforms -->
            <Chip
              v-for="platform in paramDefinition.platforms"
              :key="platform"
              v-tooltip="`This field is only applicable to the ${platform} platform`"
              class="platform"
              :label="platform"
            >
            </Chip>
          </label>

          <!-- <div class="debug">
            <pre>editorTextValue: {{ editorTextValue }}</pre>
            <pre>simpleInputValue: {{ simpleInputValue }}</pre>
            <pre>param.value.value: {{ param.value }}</pre>
          </div> -->

          <div class="infos">
            <!-- Is valid button -->
            <Button
              v-tooltip="expectedTooltip"
              text
              size="small"
              class="type-btn"
              rounded
              :severity="isExpectedValid ? 'success' : 'danger'"
            >
              <template #icon>
                <i class="mdi" :class="{ [paramIcon]: true }"></i>
              </template>
            </Button>
          </div>
        </div>

        <div v-if="param === undefined">
          Oops
        </div>

        <!-- Code editor -->
        <div class="code-editor-wrapper">
          <div class="code-editor-wrapper-inner">
            <div v-show="param.editor === 'editor'" ref="$codeEditorText" class="code-editor"></div>
            <ParamEditorBody
              v-show="param.editor === 'simple'"
              :model-value="simpleInputValue"
              :param-definition="paramDefinition"
              @update:model-value="onParamEditorUpdate"
              @switch="toggleMode"
            ></ParamEditorBody>
          </div>
          <ConfirmPopup></ConfirmPopup>
          <Button
            v-if="param.editor === 'editor'"
            v-tooltip="'Switch to simple mode'"
            text
            aria-label="Toggle mode"
            @click="toggleMode"
          >
            <template #icon>
              <i class="icon mdi mdi-text fs-16"></i>
            </template>
          </Button>
          <Button
            v-else
            v-tooltip="'Switch to editor mode'"
            text
            aria-label="Toggle mode"
            @click="toggleMode"
          >
            <template #icon>
              <i class="icon mdi mdi-code-block-braces fs-16"></i>
            </template>
          </Button>
        </div>

        <!-- Hint text -->
        <template v-if="param.editor === 'editor'">
          <Skeleton v-if="hintText === undefined" height="20px"></Skeleton>
          <div v-else v-dompurify-html="hintText" class="hint" :class="{ error: isError }"></div>
        </template>

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
            <clipPath id=":r8:">
              <rect x="0" y="0" width="14" height="14"></rect>
            </clipPath>
          </svg>

          <div class="helpers">
            <!--<!~~ Value ~~>
            <Panel header="Value" toggleable>
              <ParamEditorBody
                :model-value="simpleInputValue"
                :param-definition="paramDefinition"
                @update:model-value="onParamEditorUpdate"
              ></ParamEditorBody>
            </Panel>-->
            <!-- Outputs -->
            <Panel header="Outputs" toggleable>
              <div class="steps-list">
                <template v-for="(step, stepUid) in steps" :key="stepUid">
                  <div v-if="Object.keys(step.outputs).length > 0" class="step-item">
                    <div class="step-name">{{ getStepLabel(stepUid) }}</div>

                    <div class="step-outputs">
                      <div
                        v-for="(_output, outputKey) in step.outputs"
                        :key="outputKey"
                        class="step-output"
                      >
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
            <Panel header="Variables" toggleable>
              <div class="variables-list">
                <div
                  v-for="(variable, variableIndex) in variables"
                  :key="variableIndex"
                  class="variable"
                  @click="insertEditorEnd(`variables['${variable.id}']`)"
                >
                  <div class="variable-name">{{ variable.name }}</div>
                  <div class="variable-description">
                    {{ variable.description }}
                  </div>
                </div>
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
import { computed, ref, toRefs, watch } from 'vue'
import type { ValueOf } from 'type-fest'
import { Action, Condition, Event } from '@pipelab/plugin-core'
import { createCodeEditor } from '@renderer/utils/code-editor'
import { createQuickJs } from '@renderer/utils/quickjs'
import { BlockAction, BlockCondition, BlockEvent, BlockLoop, Steps } from '@@/model'
import { controlsToIcon, controlsToType } from '@renderer/models/controls'
import { Completion, CompletionContext } from '@codemirror/autocomplete'
import { javascriptLanguage } from '@codemirror/lang-javascript'
import vTooltip from 'primevue/tooltip'
import { throttle } from 'es-toolkit'
import { arrow, autoUpdate, flip, offset, shift, useFloating } from '@floating-ui/vue'
import { vOnClickOutside } from '@vueuse/components'
import { useEditor } from '@renderer/store/editor'
import { storeToRefs } from 'pinia'
import { useLogger } from '@@/logger'
import ParamEditorBody from './ParamEditorBody.vue'
import { Variable } from '@@/libs/core-app'
import { variableToFormattedVariable } from '@renderer/composables/variables'
import { useConfirm } from 'primevue/useconfirm'
import { klona } from 'klona'
import { stepsPlaceholders } from '@renderer/utils/code-editor/step-plugin'

// @ts-expect-error tsconfig
const vm = await createQuickJs()

type Params = (Action | Condition | Event)['params']
type Param = ValueOf<BlockAction['params']>

const props = defineProps<{
  param: Param | undefined;
  paramDefinition: ValueOf<Params>,
  paramKey: string | number

  value: BlockAction | BlockEvent | BlockCondition | BlockLoop
  steps: Steps
  variables: Variable[]
}>()

// const props = defineProps({
//   param: {
//     type: Object as PropType<Param>,
//     required: false,
//     default: undefined,
//   },
//   paramDefinition: {
//     type: Object as PropType<ValueOf<Params>>,
//     required: true
//   },
//   paramKey: {
//     type: [String, Number],
//     required: true
//   },

//   value: {
//     type: Object as PropType<BlockAction | BlockEvent | BlockCondition | BlockLoop>,
//     required: true
//   },
//   steps: {
//     type: Object as PropType<Steps>,
//     required: true
//   },
//   variables: {
//     type: Object as PropType<Variable[]>,
//     required: true
//   }
// })

const { paramKey, paramDefinition, steps, variables, param } = toRefs(props)

const confirm = useConfirm()

const editor = useEditor()
const { getNodeDefinition } = editor
const { nodes } = storeToRefs(editor)

const confirmSwitchMode = (event: MouseEvent) => {
  return new Promise<boolean>((resolve) => {
    confirm.require({
      target: event.currentTarget,
      message:
        'Switching back to simple mode will delete all your changes. Are you sure you want to continue?',
      icon: 'pi pi-exclamation-triangle',
      rejectProps: {
        label: 'Cancel',
        severity: 'secondary',
        outlined: true
      },
      acceptProps: {
        label: 'Switch to simple mode'
      },
      accept: () => {
        return resolve(true) // Resolve the promise with true when the user accepts
      },
      reject: () => {
        return resolve(false) // Resolve the promise with false when the user rejects
      }
    })
  })
}

const toggleMode = async (event: MouseEvent) => {
  const target = param.value?.editor === 'simple' ? 'editor' : 'simple'
  let answer = true
  let targetValue = klona(param.value?.value)
  if (target === 'simple') {
    event.preventDefault()

    answer = await confirmSwitchMode(event)
    targetValue = paramDefinition.value.value
  }

  if (answer === true) {
    emit('update:modelValue', {
      editor: target,
      value: targetValue
    })
  }
}

const emit = defineEmits<{
  (event: 'update:modelValue', data: Param): void
}>()

const isError = ref(false)
const hintText = ref<string>()

const $codeEditorText = ref<HTMLDivElement>()
const $floating = ref<HTMLDivElement>()
const $arrow = ref<HTMLElement>()

const { logger } = useLogger()

const formattedVariables = () => {
  return variableToFormattedVariable(vm, variables.value)
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

// const regexpLinter = linter((view) => {
//   const diagnostics: Diagnostic[] = []
//   syntaxTree(view.state)
//     .cursor()
//     .iterate((node) => {
//       if (node.name == 'RegExp')
//         diagnostics.push({
//           from: node.from,
//           to: node.to,
//           severity: 'warning',
//           message: 'Regular expressions are FORBIDDEN',
//           actions: [
//             {
//               name: 'Remove',
//               apply(view, from, to) {
//                 view.dispatch({ changes: { from, to } })
//               }
//             }
//           ]
//         })
//     })
//   return diagnostics
// })

const {
  update: codeEditorTextUpdate,
  onUpdate: onCodeEditorTextUpdate,
  value: editorTextValue
} = createCodeEditor($codeEditorText, [
  javascriptLanguage.data.of({
    autocomplete: myCompletions
  }),
  stepsPlaceholders({
    param,
    steps,
    variables,
  }),
])

const doCodeEditorUpdate = throttle(async (newValue) => {
  const displayString = newValue ?? ''

  try {
    const variables = await formattedVariables()
    console.log('displayString', displayString)
    console.log('variables', variables)
    const result = await vm.run(displayString, {
      params: {},
      // params: resolvedParams.value,
      steps: steps.value,
      variables
    })
    simpleInputValue.value = result
    hintText.value = resolveHintTextResult(result)
    isError.value = false

    // update on code editor text change
    emit('update:modelValue', {
      editor: param.value?.editor,
      value: newValue
    })
  } catch (e) {
    console.error(e)
    logger().error('e', JSON.stringify(e))
    if (e instanceof Error) {
      hintText.value = /* e.name + ' ' +  */ e.message
      isError.value = true
    } else {
      logger().error('e', e)
    }
  }
}, 500)

// near definition to be the first to trigger
onCodeEditorTextUpdate(async (newValue) => {
  doCodeEditorUpdate(newValue)
})

watch(
  () => param.value,
  () => {
    // initial value setting
    const newValue = klona(param.value)
    if (newValue) {
      if (newValue.value === undefined || newValue.value === null) {
        codeEditorTextUpdate('')
      } else {
        codeEditorTextUpdate((newValue.value as string).toString())
      }
    }
  },
  {
    immediate: true
  }
)

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

// const debounce = <T extends (...args: any[]) => void>(
//   func: T,
//   delay: number
// ): ((...args: Parameters<T>) => void) => {
//   let timeoutId: ReturnType<typeof setTimeout>

//   return (...args: Parameters<T>): void => {
//     clearTimeout(timeoutId)
//     timeoutId = setTimeout(() => func(...args), delay)
//   }
// }

const resolveHintTextResult = (result: unknown) => {
  console.log('result', result)
  if (paramDefinition.value.control.type === 'select') {
    const label = paramDefinition.value.control.options.options.find(
      (o) => o.value === result
    )?.label
    if (label) {
      return label
    }
  }
  return ((result as string | undefined) ?? '').toString()
}

const simpleInputValue = ref<unknown>()

const onParamEditorUpdate = (value: unknown) => {
  insertEditorReplace(value !== undefined ? value.toString() : '')
}

const isModalDisplayed = ref(false)
const onClickInside = () => {
  if (param.value?.editor === 'editor') {
    isModalDisplayed.value = true
  }
}
const onClickOutside = () => {
  isModalDisplayed.value = false
}

watch(
  () => param.value?.editor,
  (newValue) => {
    if (newValue === 'editor') {
      isModalDisplayed.value = true
    } else {
      isModalDisplayed.value = false
    }
  }
)

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

const paramType = computed(() => {
  return controlsToType(paramDefinition.value.control)
})

const paramIcon = computed(() => {
  return controlsToIcon(paramDefinition.value.control)
})

const isExpectedValid = computed(() => {
  return paramType.value === typeof simpleInputValue.value
})

const expectedTooltip = computed(() => {
  return `Expected: ${paramType.value}, got ${typeof simpleInputValue.value}`
})
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

.code-editor-wrapper {
  display: flex;
  flex-direction: row;
  gap: 8px;

  .code-editor-wrapper-inner {
    width: 100%;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
}

.type-btn {
  height: 18px !important;
}

.variable-list {
  .variable {
    &:hover {
      cursor: pointer;
      background-color: #f5f5f5;
    }
  }
}

.tooltip-icon {
  font-size: 12px;
  color: grey;
  margin-left: 4px;
}
</style>
