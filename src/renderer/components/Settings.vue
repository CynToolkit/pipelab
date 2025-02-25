<template>
  <div class="card">
    <Tabs value="0">
      <TabList>
        <Tab value="0">General</Tab>
        <Tab value="1">Storage</Tab>
        <Tab value="2">Integrations</Tab>
        <Tab value="3">Advanced</Tab>
        <Tab v-if="user.is_anonymous === false" value="4">Billing</Tab>
      </TabList>
      <TabPanels>
        <!-- General Tab -->
        <TabPanel value="0">
          <div class="general-settings">
            <div class="field">
              <div class="field-switch">
                <ToggleSwitch
                  :disabled="!settingsRef"
                  aria-label="asdsdsd"
                  input-id="app-theme"
                  :model-value="false"
                />
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
                  input-id="cache-folder"
                  readonly
                  type="text"
                  class="input"
                  placeholder="Enter or browse for a folder"
                  @update:model-value="updateCacheFolder"
                />
                <Button :disabled="!settingsRef" class="btn" @click="browseCacheFolder"
                  >Browse</Button
                >
              </InputGroup>
              <p class="description">Manage where the app stores temporary and cache files.</p>
            </div>
            <div class="actions">
              <Button :disabled="!settingsRef" class="btn danger" @click="clearCache"
                >Clear Cache</Button
              >
              <Button :disabled="!settingsRef" class="btn" @click="resetCacheFolder"
                >Reset to Default</Button
              >
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

        <!-- Billing Tab -->
        <TabPanel value="4">
          <template v-for="subscription in subscriptions" :key="subscription.id">
            <div v-if="subscription.status === 'active'" :key="subscription.id">
              <Card class="subscription">
                <template #title>{{ subscription.product.name }}</template>
                <template #content>
                  <div>
                    <div class="subscription-price">
                      <span class="currency">{{ subscription.price.priceCurrency }}</span>
                      {{ subscription.price.priceAmount / 100 }} /
                      {{ subscription.price.recurringInterval }}
                    </div>
                    <div class="subscription-period-start">
                      Start: {{ format(subscription.currentPeriodStart, 'yyyy-MM-dd') }}
                    </div>
                    <div class="subscription-period-end">
                      Renew: {{ format(subscription.currentPeriodEnd, 'yyyy-MM-dd') }}
                    </div>
                  </div>
                </template>
              </Card>
            </div>
          </template>

          <Button v-if="subscriptions.length > 0" class="btn" @click="openBillingPortal"
            >Manage Subscription</Button
          >
          <Button v-if="subscriptions.length === 0" class="btn" @click="startCheckout"
            >Subscribe</Button
          >
        </TabPanel>
      </TabPanels>
    </Tabs>
  </div>
</template>

<script lang="ts" setup>
import Tabs from 'primevue/tabs'
import TabList from 'primevue/tablist'
import Tab from 'primevue/tab'
import Card from 'primevue/card'
import TabPanels from 'primevue/tabpanels'
import TabPanel from 'primevue/tabpanel'
import { computed } from 'vue'
import { useAppSettings } from '@renderer/store/settings'
import { useAPI } from '@renderer/composables/api'
import { storeToRefs } from 'pinia'
import Button from 'primevue/button'
import { supabase } from '@@/supabase'
import { useAuth } from '@renderer/store/auth'

import { format } from 'date-fns'

const appSettings = useAppSettings()
const api = useAPI()
const authStore = useAuth()

const { settings: settingsRef } = storeToRefs(appSettings)
const { subscriptions, user } = storeToRefs(authStore)

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

const openBillingPortal = async () => {
  const result = await supabase.functions.invoke('customer-portal')
  console.log('result', result)
  window.open(result.data.customerPortal)
}
const startCheckout = async () => {
  const result = await supabase.functions.invoke('checkout')
  console.log('result', result)
  window.open(result.data.checkoutURL)
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

.subscription-price {
  .currency {
    text-transform: uppercase;
  }
}
</style>
