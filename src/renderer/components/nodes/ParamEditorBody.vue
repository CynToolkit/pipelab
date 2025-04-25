<template>
  <div class="editor">
    <div v-if="paramDefinition.control.type === 'input'" class="input">
      <template v-if="paramDefinition.control.options.kind === 'text'">
        <Password
          v-if="paramDefinition.control.options.password"
          :model-value="modelValueString"
          :placeholder="paramDefinition.control.options.placeholder"
          :toggle-mask="true"
          :feedback="false"
          :class="{
            'w-full': true
          }"
          input-class="w-full"
          @update:model-value="onParamInputTextChange"
        >
        </Password>
        <InputText
          v-else
          :model-value="modelValueString"
          filter
          :placeholder="paramDefinition.control.options.placeholder"
          multiple
          option-label="label"
          class="w-full"
          @update:model-value="onParamInputTextChange"
        />
      </template>
      <InputNumber
        v-else-if="paramDefinition.control.options.kind === 'number'"
        :model-value="modelValueNumber"
        show-buttons
        option-label="label"
        class="w-full"
        :format="false"
        @input="onParamInputNumberChange"
      />
    </div>
    <div v-else-if="paramDefinition.control.type === 'boolean'" class="boolean">
      <SelectButton
        :model-value="modelValue"
        option-label="text"
        option-value="value"
        :options="booleanOptions"
        aria-labelledby="basic"
        @change="onSelectChange"
      >
        <template #option="slotProps">
          <span>{{ slotProps.option.text }}</span>
        </template>
      </SelectButton>
    </div>
    <div v-else-if="paramDefinition.control.type === 'path'" class="path">
      <Button class="w-full" @click="onChangePathClick(paramDefinition.control.options)">
        {{ modelValue ? modelValue : (paramDefinition.control.label ?? 'Browse path') }}
      </Button>
    </div>
    <div
      v-else-if="paramDefinition.control.type === 'electron:configure:v2'"
      class="electron:configure:v2"
    >
      <div class="body">
        <div class="label">Electron version</div>
        <InputText />
        <div class="label">Custom main code</div>
        <InputText />
        <div class="label">Enable steam support</div>
        <Checkbox />
      </div>
    </div>
    <div v-else-if="paramDefinition.control.type === 'select'" class="select">
      <Listbox
        :model-value="modelValue"
        :options="paramDefinition.control.options.options"
        filter
        option-value="value"
        option-label="label"
        class="w-full"
        @change="onParamSelectChange"
      />
    </div>
    <div v-else-if="paramDefinition.control.type === 'multi-select'" class="multi-select">
      <Listbox
        :model-value="modelValue"
        :options="paramDefinition.control.options.options"
        filter
        multiple
        option-label="label"
        class="w-full"
        @change="onParamMultiSelectChange"
      />
    </div>
    <Button v-else class="w-full" @click="onSwitch">Switch to editor to edit value</Button>
  </div>
</template>

<script lang="ts" setup>
import { Action, Condition, Event } from '@pipelab/plugin-core'
import type { ValueOf } from 'type-fest'
import { computed, PropType, toRefs } from 'vue'
import { useAPI } from '@renderer/composables/api'
import { useLogger } from '@@/logger'
import type { OpenDialogOptions } from 'electron'
import { SelectButtonChangeEvent } from 'primevue/selectbutton'
import { ListboxChangeEvent } from 'primevue/listbox'
import { InputNumberInputEvent } from 'primevue/inputnumber'

type Params = (Action | Condition | Event)['params']

const props = defineProps({
  paramDefinition: {
    type: Object as PropType<ValueOf<Params>>,
    required: true
  },
  modelValue: {
    type: [String, Number, Boolean, Array, undefined] as PropType<unknown>,
    required: false
  }
})

const { modelValue } = toRefs(props)

const emit = defineEmits<{
  (event: 'update:modelValue', data: any): void
  (event: 'switch'): void
}>()

const api = useAPI()

const { logger } = useLogger()

const onChangePathClick = async (options: OpenDialogOptions) => {
  const pathsResponse = await api.execute('dialog:showOpenDialog', options, async (_, message) => {
    const { type, data } = message
    if (type === 'end') {
      logger().info('end', data)
    }
  })

  if (pathsResponse.type === 'error') {
    throw new Error(pathsResponse.ipcError)
  }

  const paths = pathsResponse.result

  logger().info('paths', paths)
  const p = paths.filePaths[0]

  emit('update:modelValue', `"${p}"`)
}

const onParamSelectChange = (event: ListboxChangeEvent) => {
  console.log('event', event)
  emit('update:modelValue', `"${event.value}"`)
}

const onParamInputTextChange = (event: string) => {
  emit('update:modelValue', `"${event}"`)
}

// const onParamInputNumberChange = (event: number) => {
//   console.log('event', event)
//   emit('update:modelValue', event)
// }
const onParamInputNumberChange = (event: InputNumberInputEvent) => {
  console.log('event', event)
  emit('update:modelValue', event.value)
}

const onParamMultiSelectChange = (
  event: Omit<ListboxChangeEvent, 'value'> & { value: { label: string; value: string }[] }
) => {
  const data = event.value.map((v) => v.value)

  emit('update:modelValue', `${JSON.stringify(data)}`)
}

const onSelectChange = (event: SelectButtonChangeEvent) => {
  emit('update:modelValue', event.value)
}

const booleanOptions = [
  { text: 'True', value: true },
  { text: 'False', value: false }
]

const modelValueString = computed(() => {
  if (modelValue.value === undefined) {
    return ''
  }
  return modelValue.value.toString()
})

const modelValueNumber = computed<number | undefined>(() => {
  return Number.parseInt(modelValueString.value)
})

const onSwitch = () => {
  emit('switch')
}
</script>

<style lang="scss" scoped></style>
