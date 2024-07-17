<template>
  <div class="param-editor">
    <div class="editor">
      <div v-if="paramDefinition.control.type === 'input'" class="string">
        <div class="flex flex-column gap-2">
          <div class="label">
            <label :for="`data-${paramKey}`">{{ paramDefinition.label }}</label>

            <div class="infos">
              <Button
                text
                size="small"
                rounded
                v-tooltip.top="
                  `Expected: ${controlsToType(paramDefinition.control)}, got ${typeof param}`
                "
              >
                <template #icon>
                  <i class="mdi mdi-format-list-bulleted-type"></i>
                </template>
              </Button>
              <Button text size="small" rounded>
                <template #icon>
                  <i class="mdi mdi-code-block-braces"></i>
                </template>
              </Button>
            </div>
          </div>
          <div class="code-editor" ref="$codeEditorText"></div>
          <div class="hint" :class="{ error: isError }">{{ hintText }}</div>
        </div>
      </div>
      <div v-else-if="paramDefinition.control.type === 'boolean'" class="boolean">
        <div class="flex flex-align-items-center gap-2">
          <div v-if="isExpressionMode">
            <label :for="`data-${paramKey}`">{{ paramDefinition.label }}</label>
            <div ref="$codeEditorBoolean"></div>
            <div class="expected-type">
              Expected: {{ controlsToType(paramDefinition.control) }}, got {{ typeof param }}
            </div>
          </div>
          <div v-else>
            <Checkbox
              :name="`data-${paramKey}`"
              :model-value="param"
              binary
              @update:model-value="onValueChanged($event, paramKey.toString())"
            ></Checkbox>
            <label :for="`data-${paramKey}`">{{ paramDefinition.label }}</label>
            <div class="expected-type">
              Expected: {{ controlsToType(paramDefinition.control) }}, got {{ typeof param }}
            </div>
          </div>
        </div>
      </div>
      <div v-else-if="paramDefinition.control.type === 'path'" class="path">
        <div class="flex flex-column gap-2">
          <label :for="`data-${paramKey}`">{{ paramDefinition.label }}</label>
          <!-- @vue-expect-error ignore -->
          <InputText
            :name="`data-${paramKey}`"
            :model-value="param"
            readonly
            @update:model-value="onValueChanged($event, paramKey.toString())"
            @click="onChangePathClick"
          ></InputText>
          <div class="expected-type">
            Expected: {{ controlsToType(paramDefinition.control) }}, got {{ typeof param }}
          </div>
        </div>
      </div>
      <div v-else-if="paramDefinition.control.type === 'json'" class="json">
        <div class="flex flex-align-items-center gap-2">
          <label :for="`data-${paramKey}`">{{ paramDefinition.label }}</label>
          <pre :name="`data-${paramKey}`">
            {{ param }}
          </pre>
          <div class="expected-type">
            Expected: {{ controlsToType(paramDefinition.control) }}, got {{ typeof param }}
          </div>
        </div>
      </div>
      <div v-else-if="paramDefinition.control.type === 'select'" class="select">
        <div class="flex flex-align-items-center gap-2">
          <div class="flex flex-column flex-1" v-if="isExpressionMode">
            <label :for="`data-${paramKey}`">{{ paramDefinition.label }}</label>
            <div class="code-editor" ref="$codeEditorSelect"></div>
            <div class="hint" :class="{ error: isError }">{{ hintText }}</div>
            <div class="expected-type">
              Expected: {{ controlsToType(paramDefinition.control) }}, got {{ typeof param }}
            </div>
          </div>
          <div class="flex flex-1" v-else>
            <Select
              :name="`data-${paramKey}`"
              :model-value="param"
              :options="paramDefinition.control.options.options"
              optionLabel="label"
              option-value="value"
              :placeholder="paramDefinition.control.options.placeholder"
              class="w-full md:w-56"
              @update:model-value="onValueChanged($event, paramKey.toString())"
            />
            <label :for="`data-${paramKey}`">{{ paramDefinition.label }}</label>
            <div class="expected-type">
              Expected: {{ controlsToType(paramDefinition.control) }}, got {{ typeof param }}
            </div>
          </div>
        </div>
      </div>
      <div v-else class="other">other: {{ paramDefinition.control.type }}</div>
    </div>
    <div class="debug">
      <pre>paramDefinition.value: {{ paramDefinition }}</pre>
      <pre>params: {{ param }}</pre>
    </div>
  </div>
</template>

<script setup lang="ts">
import { PropType, ref, toRefs, watch, watchEffect } from 'vue'
import type { ValueOf } from 'type-fest'
import { Action, Condition, Event } from '@cyn/plugin-core'
import Checkbox from 'primevue/checkbox'
import { useAPI } from '@renderer/composables/api'
import { createCodeEditor } from '@renderer/utils/code-editor'
import { createQuickJs } from '@renderer/utils/quickjs'
import { computedAsync, watchDebounced } from '@vueuse/core'
import { makeResolvedParams } from '@renderer/utils/evaluator'
import {
  Block,
  BlockAction,
  BlockComment,
  BlockCondition,
  BlockEvent,
  BlockLoop,
  Steps
} from '@@/model'
import DOMPurify from 'dompurify'
import { controlsToType } from '@renderer/models/controls'
import { CompletionContext } from '@codemirror/autocomplete'
import { javascriptLanguage } from '@codemirror/lang-javascript'
import { defineComponent } from 'vue'
import vTooltip from 'primevue/tooltip'

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

const isExpressionMode = ref(true)

const vm = await createQuickJs()

console.log('on start', param)

const emit = defineEmits<{
  (event: 'update:modelValue', data: any): void
}>()

// const resolvedParams = computedAsync(
//   async () => {
//     return makeResolvedParams({ params: value.value.params, steps: steps.value })
//   },
//   {},
//   {
//     onError: (error) => {
//       console.error('error', error)
//     }
//   }
// )

const isError = ref(false)
const hintText = ref('')

const useExpressionEditor = ref(false)

const $codeEditorText = ref<HTMLDivElement>()
const $codeEditorBoolean = ref<HTMLDivElement>()
const $codeEditorSelect = ref<HTMLDivElement>()

function myCompletions(context: CompletionContext) {
  let word = context.matchBefore(/\w*/)
  if (word) {
    if (word.from == word.to && !context.explicit) return null
    return {
      from: word.from,
      options: [
        { label: 'match', type: 'keyword' },
        { label: 'hello', type: 'variable', info: '(World)' },
        { label: 'magic', type: 'text', apply: '⠁⭒*.✩.*⭒⠁', detail: 'macro' }
      ]
    }
  }
}

const {
  update: codeEditorTextUpdate,
  onUpdate: onCodeEditorTextUpdate,
  value: editorTextValue
} = createCodeEditor($codeEditorText, [
  javascriptLanguage.data.of({
    autocomplete: myCompletions
  })
])
const { update: codeEditorBooleanUpdate, onUpdate: onCodeEditorBooleanUpdate } =
  createCodeEditor($codeEditorBoolean)
const {
  update: codeEditorSelectUpdate,
  onUpdate: onCodeEditorSelectUpdate,
  value: editorSelectValue
} = createCodeEditor($codeEditorSelect)

// :name="`data-${paramKey}`"
// :model-value="param"
// @update:model-value="onValueChanged($event, paramKey.toString())"

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

watchDebounced(
  editorTextValue,
  async () => {
    const displayString = editorTextValue.value

    console.log('---> ', displayString)

    if (!displayString) {
      return
    }

    try {
      const result = await vm.run(displayString, {
        params: {},
        // params: resolvedParams.value,
        steps: steps.value
      })
      console.log('result', result)
      hintText.value = DOMPurify.sanitize(result)
      isError.value = false
    } catch (e) {
      console.error('e', JSON.stringify(e))
      if (e instanceof Error) {
        hintText.value = /* e.name + ' ' +  */ e.message
        isError.value = true
      } else {
        console.error('e', e)
      }
    }
  },
  {
    debounce: 1000
  }
)

watch(
  param,
  (newValue) => {
    if (newValue) {
      console.log('param new value', newValue)
      codeEditorTextUpdate((newValue as string).toString())
      codeEditorSelectUpdate((newValue as string).toString())
      codeEditorBooleanUpdate((newValue as string).toString())
    }
  },
  {
    immediate: true
  }
)

const onValueChanged = debounce((newValue: string, paramKey: string) => {
  console.log('param.value', param.value)
  console.log('newValue', newValue)
  console.log('paramKey', paramKey)

  emit('update:modelValue', newValue)
}, 1000)

onCodeEditorTextUpdate((value) => {
  onValueChanged(value, paramKey.toString())
})

onCodeEditorBooleanUpdate((value) => {
  onValueChanged(value, paramKey.toString())
})

onCodeEditorSelectUpdate((value) => {
  onValueChanged(value, paramKey.toString())
})

/** On path selection */
const api = useAPI()

const onChangePathClick = async () => {
  const paths = await api.execute(
    'dialog:showOpenDialog',
    { title: 'Choose a new path', properties: ['openDirectory'] },
    async (_, message) => {
      const { type, data } = message
      if (type === 'end') {
        console.log('end', data)
      }
    }
  )

  console.log('paths', paths)
  const p = paths.filePaths[0]

  onValueChanged(p, paramKey.value.toString())
}
</script>

<style scoped lang="scss">
.param-editor {
  display: flex;
  flex-direction: row;
  gap: 8px;

  .editor {
    flex: 1;
  }
}

.code-editor {
  border: 1px solid var(--p-inputtext-border-color);
  // height: 28px;
  border-radius: var(--p-inputtext-border-radius);
  // overflow: hidden;

  :deep(.cm-focused) {
    outline: none;
  }

  :deep(.cm-editor) {
    // height: 28px;
  }
}

.hint {
  &.error {
    color: red;
  }
}

.label {
  display: flex;
  justify-content: space-between;
}
</style>
