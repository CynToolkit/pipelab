<template>
  <div class="card">
    <Tabs value="0" class="tabs">
      <TabList :pt="{ tabList: { class: 'tablist' } }">
        <Tab value="0">General</Tab>
        <Tab value="1">Storage</Tab>
        <Tab value="2">Integrations</Tab>
        <Tab value="3">Advanced</Tab>
      </TabList>
      <TabPanels>
        <!-- General Tab -->
        <TabPanel value="0">
          <p class="m-0">No settings yet</p>
        </TabPanel>

        <!-- Storage Tab -->
        <TabPanel value="1">
          <div class="storage-settings">
            <h3>Cache Folder</h3>
            <p>Manage where the app stores temporary and cache files.</p>
            <div class="field">
              <label for="cache-folder" class="label">Current Cache Folder:</label>
              <InputGroup>
                <InputText
                  id="cache-folder"
                  v-model="cacheFolder"
                  readonly
                  type="text"
                  class="input"
                  placeholder="Enter or browse for a folder"
                />
                <Button class="btn" @click="browseCacheFolder">Browse</Button>
              </InputGroup>
            </div>
            <div class="actions">
              <Button class="btn danger" @click="clearCache">Clear Cache</Button>
              <Button class="btn" @click="resetCacheFolder">Reset to Default</Button>
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
import { ref } from 'vue'
import { useAppSettings } from '@main/configuration'
import { onMounted } from 'vue'

const appSettings = useAppSettings()

const settingsRef = ref({})

const cacheFolder = ref('/tmp') // Default cache folder

onMounted(async () => {
  const settingsResult = await appSettings.load()
  if (settingsResult.type === 'success') {
    settingsRef.value = settingsResult.result.result
    console.log('settings', settingsRef.value)
  }
})

const browseCacheFolder = () => {
  console.log('Browse for a new cache folder')
  // Add logic to open a file picker or directory chooser
}
const clearCache = () => {
  console.log('Cache cleared')
  // Add logic to clear the cache
}
const resetCacheFolder = () => {
  cacheFolder.value = '/tmp'
  console.log('Cache folder reset to default: /tmp')
}
</script>

<style lang="scss" scoped>
.field {
  margin-bottom: 1rem;
  display: flex;
  align-items: center;

  .label {
    margin-right: 1rem;
    font-weight: bold;
  }
}

.actions {
  margin-top: 1rem;

  .btn {
    margin-right: 0.5rem;
  }
}
</style>
