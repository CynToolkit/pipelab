<template>
  <div class="card">
    <Tabs value="0">
      <TabList>
        <Tab value="0">General</Tab>
        <Tab value="1">Storage</Tab>
        <Tab value="2">Integrations</Tab>
        <Tab value="3">Advanced</Tab>
      </TabList>
      <TabPanels>
        <!-- General Tab -->
        <TabPanel value="0">
          <div class="general-settings">
            <div class="field">
              <div class="field-switch">
                <ToggleSwitch :disabled="!settingsRef" aria-label="asdsdsd" input-id="app-theme" :model-value="false" />
                <label for="app-theme" class="label">Dark theme</label>
              </div>
            </div>
          </div>
        </TabPanel>

        <!-- Storage Tab -->
        <TabPanel value="1">
          <div class="storage-settings">
            <div class="field">
              <label for="cache-folder" class="label">Pipeline Cache Folder:</label>
              <InputGroup>
                <InputText
                :disabled="!settingsRef"
                  :model-value="cacheFolder"
                  @update:model-value="updateCacheFolder"
                  input-id="cache-folder"
                  readonly
                  type="text"
                  class="input"
                  placeholder="Enter or browse for a folder"
                />
                <Button :disabled="!settingsRef" class="btn" @click="browseCacheFolder">Browse</Button>
              </InputGroup>
              <p class="description">Manage where the app stores temporary and cache files.</p>
            </div>
            <div class="actions">
              <Button :disabled="!settingsRef" class="btn danger" @click="clearCache">Clear Cache</Button>
              <Button :disabled="!settingsRef" class="btn" @click="resetCacheFolder">Reset to Default</Button>
            </div>
          </div>
        </TabPanel>

        <!-- Integration Tab -->
        <TabPanel value="2">
          <p class="m-0">No settings yet</p>
        </TabPanel>

        <!-- Advanced Tab -->
        <TabPanel value="3">
          <p class="m-0">No settings yet</p>
        </TabPanel>
      </TabPanels>
    </Tabs>
  </div>
</template>

<script lang="ts" setup>
import Tabs from 'primevue/tabs'
import TabList from 'primevue/tablist'
import Tab from 'primevue/tab'
import TabPanels from 'primevue/tabpanels'
import TabPanel from 'primevue/tabpanel'
import { computed } from 'vue'
import { useAppSettings } from '@renderer/store/settings'
import { useAPI } from '@renderer/composables/api'
import { storeToRefs } from 'pinia'

const appSettings = useAppSettings()
const api = useAPI()

const { settings: settingsRef } = storeToRefs(appSettings)

const cacheFolder = computed(() => {
  return settingsRef.value?.cacheFolder
})

const updateCacheFolder = (value: string) => {
  return appSettings.updateSettings({
    ...settingsRef.value,
    cacheFolder: value
  })
}

const browseCacheFolder = async () => {
  const newPath = await api.execute('dialog:showOpenDialog', {
    title: 'Select Cache Folder',
    defaultPath: cacheFolder.value,
    properties: ['openDirectory']
  })

  console.log('newPath', newPath)

  if (newPath.type === 'success') {
    await updateCacheFolder(newPath.result.filePaths[0])
  } else {
    console.log('Error selecting cache folder', newPath)
  }
}
const clearCache = () => {
  console.log('Cache cleared')
}
const resetCacheFolder = () => {
  console.log('Cache folder reset to default: /tmp')
}
</script>

<style lang="scss" scoped>
.field {
  .label {
    margin-right: 1rem;
    font-weight: bold;
  }

  .description {
    opacity: 0.8;
    margin-top: 0.5rem;
    font-size: 0.8rem;
  }

  .field-switch {
    display: flex;
    align-items: center;

    .label {
      margin-left: 0.5rem;
    }
  }
}

.actions {
  margin-top: 1rem;

  .btn {
    margin-right: 0.5rem;
  }
}
</style>
