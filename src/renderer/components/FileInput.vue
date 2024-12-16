<template>
  <div class="file-input">
    <InputText
      :model-value="modelValue"
      :readonly="true"
      class="input"
      placeholder="Select a location"
      @click="pickLocation"
    />
  </div>
</template>

<script lang="ts" setup>
import { useLogger } from '@@/logger'
import { useAPI } from '@renderer/composables/api'
import InputText from 'primevue/inputtext'
import { extname } from 'path-browserify'
import { PROJECT_EXTENSION } from '@renderer/models/constants'

const { logger } = useLogger()
const api = useAPI()

defineProps<{
  modelValue: string | undefined
}>()

const emit = defineEmits<{
  'update:model-value': [data: string]
}>()

const hasExtension = (path: string) => {
  return extname(path) === `.${PROJECT_EXTENSION}`
}

const pickLocation = async () => {
  const paths = await api.execute(
    'dialog:showSaveDialog',
    {
      title: 'Choose a new path',
      properties: ['createDirectory', 'showOverwriteConfirmation'],
      filters: [{ name: 'Pipelab Project', extensions: [PROJECT_EXTENSION] }]
    },
    async (_, message) => {
      const { type } = message
      if (type === 'end') {
        //
      }
    }
  )

  if (paths.type === 'error') {
    throw new Error(paths.ipcError)
  }

  if (paths.result.canceled) {
    logger().error('Save cancelled')
    return
  }

  let saveLocation = paths.result.filePath
  if (!hasExtension(saveLocation)) {
    saveLocation = saveLocation + '.' + PROJECT_EXTENSION
  }

  emit('update:model-value', saveLocation)
}
</script>

<style lang="scss" scoped>
.file-input {
  margin: 4px 0;
  width: 100%;

  .input {
    width: 100%;
  }
}
</style>
