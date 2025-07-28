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
    <div v-else-if="paramDefinition.control.type === 'netlify-site'" class="netlify-site">
      <pre>{{ currentNodeParams[paramDefinition.control.options.tokenKey] }}</pre>
      <!-- An input with a button to ask to create a new website -->
      <Select
        :placeholder="paramDefinition.control.options.placeholder"
        :model-value="modelValue"
        @update:model-value="onParamNetlifySiteChange"
        :options="items"
        optionLabel="name"
        optionValue="id"
        :loading="netlifySelectLoading"
        :disabled="
          netlifySelectLoading || !currentNodeParams[paramDefinition.control.options.tokenKey]
        "
        class="w-full"
      >
        <!-- <template #option="slotProps">
          <div>{{ slotProps.option.name }}</div>
        </template>
        <template #chip="slotProps">
          <div>{{ slotProps.value.name }}</div>
        </template> -->
      </Select>
      <Message v-if="!currentNodeParams[paramDefinition.control.options.tokenKey]" severity="error"
        >No token found</Message
      >
      <!-- <Button class="w-full" @click="onChangeNetlifySiteClick(paramDefinition.control.options)">
        {{ modelValue ? modelValue : (paramDefinition.control.label ?? 'Browse path') }}
      </Button> -->
    </div>
    <Button v-else class="w-full" @click="onSwitch">Switch to editor to edit value</Button>
  </div>
</template>

<script lang="ts" setup>
import { Action, Condition, Event } from '@pipelab/plugin-core'
import type { ValueOf } from 'type-fest'
import { computed, PropType, toRefs, ref, onMounted } from 'vue'
import { useAPI } from '@renderer/composables/api'
import { useLogger } from '@@/logger'
import type { OpenDialogOptions } from 'electron'
import { SelectButtonChangeEvent } from 'primevue/selectbutton'
import { ListboxChangeEvent } from 'primevue/listbox'
import { InputNumberInputEvent } from 'primevue/inputnumber'
import { BlockAction, BlockCondition, BlockEvent, BlockLoop } from '@@/model'
import { useEditor } from '@renderer/store/editor'
import { storeToRefs } from 'pinia'

type Params = (Action | Condition | Event)['params']

const props = defineProps<{
  paramDefinition: ValueOf<Params>
  modelValue?: unknown
  value: BlockAction | BlockEvent | BlockCondition | BlockLoop
}>()

const { modelValue } = toRefs(props)

const emit = defineEmits<{
  (event: 'update:modelValue', data: any): void
  (event: 'switch'): void
}>()

const api = useAPI()

const { logger } = useLogger()
const editor = useEditor()
const { resolvedParams } = storeToRefs(editor)

const currentNodeParams = computed(() => {
  return resolvedParams.value[props.value.uid]
})

/** Netlify */
const netlifySelectLoading = ref(false)
const search = async (event: { query: string }) => {
  netlifySelectLoading.value = true
  try {
    // const response = await fetch(`https://api.netlify.com/api/v1/sites?search=${event.query}`, {
    const response = await fetch(`https://api.netlify.com/api/v1/sites`, {
      headers: {
        Authorization: `Bearer ${currentNodeParams.value[props.paramDefinition.control.options.tokenKey]}`
      }
    })
    const data = await response.json()

    console.log('data', data)

    items.value = data
  } catch (error) {
    console.error(error)
  } finally {
    netlifySelectLoading.value = false
  }
}
const items = ref()

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

const onParamNetlifySiteChange = (event: string) => {
  console.log('event', event)
  emit('update:modelValue', `"${event}"`)
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

onMounted(() => {
  if (props.paramDefinition.control.type === 'netlify-site') {
    search({ query: '' })
  }
})
</script>

<style lang="scss" scoped></style>
