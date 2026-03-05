<template>
  <Dialog
    v-model:visible="uiStore.isFilePickerVisible"
    modal
    :header="options?.title || (options?.mode === 'open' ? 'Open File' : 'Save File')"
    :style="{ width: '70vw', height: '80vh' }"
    :closable="true"
    @hide="onCancel"
  >
    <div class="web-file-picker">
      <div class="toolbar mb-3 flex gap-2 align-items-center">
        <Button icon="pi pi-home" text @click="goToHome" v-tooltip.top="'Home'" />
        <Button
          icon="pi pi-arrow-up"
          text
          @click="goUp"
          :disabled="isAtRoot"
          v-tooltip.top="'Up'"
        />
        <InputText v-model="currentPath" class="flex-grow-1" @keydown.enter="loadDirectory" />
        <Button icon="pi pi-refresh" text @click="loadDirectory" v-tooltip.top="'Refresh'" />
      </div>

      <div class="file-list-container flex-grow-1 overflow-auto border-1 border-300 border-round">
        <DataTable
          :value="files"
          v-model:selection="selectedFile"
          selectionMode="single"
          dataKey="name"
          class="p-datatable-sm"
          @row-dblclick="onRowDblClick"
          :loading="isLoading"
        >
          <Column field="name" header="Name" sortable>
            <template #body="{ data }">
              <div class="flex align-items-center gap-2">
                <i :class="getFileIcon(data)" />
                <span>{{ data.name }}</span>
              </div>
            </template>
          </Column>
          <Column field="size" header="Size" sortable>
            <template #body="{ data }">
              {{ data.isDirectory ? '--' : formatSize(data.size) }}
            </template>
          </Column>
          <Column field="mtime" header="Modified" sortable>
            <template #body="{ data }">
              {{ formatDate(data.mtime) }}
            </template>
          </Column>
        </DataTable>
      </div>

      <div class="footer mt-3 flex justify-content-between align-items-center">
        <div class="selected-name flex-grow-1 mr-3">
          <InputText
            v-if="options?.mode === 'save'"
            v-model="saveFileName"
            placeholder="File name"
            class="w-full"
          />
          <div v-else class="text-sm text-600 truncate">
            {{ selectedFile ? selectedFile.name : 'No file selected' }}
          </div>
        </div>
        <div class="actions flex gap-2">
          <Button label="Cancel" text severity="secondary" @click="onCancel" />
          <Button
            :label="options?.mode === 'open' ? 'Open' : 'Save'"
            @click="onConfirm"
            :disabled="!canConfirm"
          />
        </div>
      </div>
    </div>
  </Dialog>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { useUIStore } from '../store/ui'
import { useAPI } from '../composables/api'
import { useLogger } from '@pipelab/shared/logger'

const uiStore = useUIStore()
const api = useAPI()
const { logger } = useLogger()

const options = computed(() => uiStore.filePickerOptions)
const currentPath = ref('')
const files = ref([])
const selectedFile = ref(null)
const saveFileName = ref('')
const isLoading = ref(false)

const isAtRoot = computed(() => {
  // Simple check for Unix/Windows roots
  return currentPath.value === '/' || /^[a-zA-Z]:\$/.test(currentPath.value)
})

const canConfirm = computed(() => {
  if (options.value?.mode === 'save') {
    return saveFileName.value.length > 0
  }
  return selectedFile.value !== null
})

const loadDirectory = async () => {
  isLoading.value = true
  try {
    const result = await api.execute('fs:listDirectory', { path: currentPath.value })
    if (result.type === 'success') {
      files.value = result.result.files
      selectedFile.value = null
    } else {
      logger().error('Failed to load directory:', result.ipcError)
    }
  } catch (error) {
    logger().error('Error loading directory:', error)
  } finally {
    isLoading.value = false
  }
}

const goToHome = async () => {
  try {
    const result = await api.execute('fs:getHomeDirectory')
    if (result.type === 'success') {
      currentPath.value = result.result.path
      await loadDirectory()
    }
  } catch (error) {
    logger().error('Error getting home directory:', error)
  }
}

const goUp = async () => {
  const parts = currentPath.value.split(/[\/]/).filter(Boolean)
  if (parts.length > 0) {
    // If Windows path like C:
    if (parts.length === 1 && currentPath.value.includes(':')) {
      return // Already at root
    }
    parts.pop()
    currentPath.value = currentPath.value.startsWith('/') ? '/' + parts.join('/') : parts.join('')
    if (currentPath.value === '') currentPath.value = '/'
    await loadDirectory()
  }
}

const onRowDblClick = async (event: any) => {
  const data = event.data
  if (data.isDirectory) {
    const sep = currentPath.value.includes('') ? '' : '/'
    currentPath.value = currentPath.value.endsWith(sep)
      ? currentPath.value + data.name
      : currentPath.value + sep + data.name
    await loadDirectory()
  } else {
    onConfirm()
  }
}

const onConfirm = () => {
  if (options.value?.mode === 'open') {
    if (selectedFile.value) {
      const sep = currentPath.value.includes('') ? '' : '/'
      const fullPath = currentPath.value.endsWith(sep)
        ? currentPath.value + selectedFile.value.name
        : currentPath.value + sep + selectedFile.value.name

      uiStore.resolveFilePicker({
        canceled: false,
        filePaths: [fullPath],
        filePath: fullPath
      })
    }
  } else {
    if (saveFileName.value) {
      const sep = currentPath.value.includes('') ? '' : '/'
      const fullPath = currentPath.value.endsWith(sep)
        ? currentPath.value + saveFileName.value
        : currentPath.value + sep + saveFileName.value

      uiStore.resolveFilePicker({
        canceled: false,
        filePath: fullPath
      })
    }
  }
}

const onCancel = () => {
  uiStore.resolveFilePicker({ canceled: true })
}

const getFileIcon = (file: any) => {
  if (file.isDirectory) return 'pi pi-folder text-primary'
  if (file.isSymbolicLink) return 'pi pi-link'
  return 'pi pi-file text-600'
}

const formatSize = (bytes: number) => {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

const formatDate = (timestamp: number) => {
  return new Date(timestamp).toLocaleString()
}

// Initial load
watch(
  () => uiStore.isFilePickerVisible,
  (visible) => {
    if (visible && currentPath.value === '') {
      goToHome()
    }
  }
)

onMounted(() => {
  if (uiStore.isFilePickerVisible) {
    goToHome()
  }
})
</script>

<style scoped>
.web-file-picker {
  display: flex;
  flex-direction: column;
  height: 100%;
}
.truncate {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
