<template>
  <div class="card">
    <Tabs value="0">
      <TabList>
        <Tab value="0">{{ t('settings.tabs.general') }}</Tab>
        <Tab value="1">{{ t('settings.tabs.integrations') }}</Tab>
        <Tab value="2">{{ t('settings.tabs.advanced') }}</Tab>
        <Tab v-if="user" value="3">{{ t('settings.tabs.billing') }}</Tab>
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
                <label for="app-theme" class="label">{{ t('settings.darkTheme') }}</label>
              </div>
            </div>
            <div class="field">
              <label for="app-theme" class="label">{{ $t('settings.language') }}</label>
              <div class="field-switch">
                <div class="locale-changer">
                  <Select
                    v-model="currentLocale"
                    :options="$i18n.availableLocales"
                    class="w-full p-2 border rounded"
                  >
                    <template #option="slotProps">
                      <div class="flex items-center">
                        <div>{{ $t('settings.languageOptions.' + slotProps.option) }}</div>
                      </div>
                    </template>

                    <template #value="slotProps">
                      <div class="flex items-center">
                        <div>{{ $t('settings.languageOptions.' + slotProps.value) }}</div>
                      </div>
                    </template>
                  </Select>
                </div>
              </div>
            </div>
          </div>
        </TabPanel>

        <!-- Integration Tab -->
        <TabPanel value="1">
          <p class="m-0">No settings yet</p>
        </TabPanel>

        <!-- Advanced Tab -->
        <TabPanel value="2">
          <div class="storage-settings">
            <div class="field">
              <label for="cache-folder" class="label">{{
                $t('settings.pipeline-cache-folder')
              }}</label>
              <InputGroup>
                <InputText
                  :disabled="!settingsRef"
                  :model-value="cacheFolder"
                  input-id="cache-folder"
                  readonly
                  type="text"
                  class="input"
                  :placeholder="$t('settings.enter-or-browse-for-a-folder')"
                  @update:model-value="updateCacheFolder"
                />
                <Button :disabled="!settingsRef" class="btn" @click="browseCacheFolder">{{
                  $t('settings.browse')
                }}</Button>
              </InputGroup>
              <p class="description">
                {{ $t('settings.manage-where-the-app-stores-temporary-and-cache-files') }}
              </p>
            </div>
            <div class="field actions">
              <Button :disabled="!settingsRef || true" class="btn danger" @click="clearCache">{{
                $t('settings.clear-cache')
              }}</Button>
              <Button :disabled="!settingsRef" class="btn" @click="resetCacheFolder">{{
                $t('settings.reset-to-default')
              }}</Button>
            </div>
            <div class="field">
              <div class="field-switch">
                <ToggleSwitch
                  :disabled="!settingsRef"
                  input-id="clear-temp-folders"
                  :model-value="settingsRef?.clearTemporaryFoldersOnPipelineEnd || false"
                  @update:model-value="updateClearTemporaryFoldersOnPipelineEnd"
                />
                <label for="clear-temp-folders" class="label">
                  {{ t('settings.clearTempFolders') }}
                </label>
              </div>
              <p class="description">
                {{ t('settings.clearTempFoldersDescription') }}
              </p>
            </div>

            <!-- Storage Information -->
            <div v-if="buildHistoryStore.storageInfo" class="storage-info">
              <div class="storage-header">
                <h3>Storage Information</h3>
                <Button
                  v-tooltip.top="'Refresh storage info'"
                  text
                  severity="secondary"
                  size="small"
                  @click="refreshStorageInfo"
                >
                  <i class="pi pi-refresh"></i>
                </Button>
              </div>
              <div class="storage-stats">
                <div class="stat-item">
                  <label>Total Entries:</label>
                  <span>{{ buildHistoryStore.storageInfo.totalEntries.toLocaleString() }}</span>
                </div>
                <div class="stat-item">
                  <label>Storage Size:</label>
                  <span>{{ formatSize(buildHistoryStore.storageInfo.totalSize) }}</span>
                </div>
                <div v-if="buildHistoryStore.storageInfo.oldestEntry" class="stat-item">
                  <label>Oldest Entry:</label>
                  <span>{{ formatDate(buildHistoryStore.storageInfo.oldestEntry) }}</span>
                </div>
                <div v-if="buildHistoryStore.storageInfo.newestEntry" class="stat-item">
                  <label>Newest Entry:</label>
                  <span>{{ formatDate(buildHistoryStore.storageInfo.newestEntry) }}</span>
                </div>
              </div>
            </div>
          </div>
        </TabPanel>

        <!-- Billing Tab -->
        <TabPanel value="3">
          <template v-for="subscription in subscriptions" :key="subscription.id">
            <div v-if="subscription.status === 'active'" :key="subscription.id">
              <Card class="subscription">
                <template #title>{{ subscription.product.name }}</template>
                <template #content>
                  <div class="subscription-details">
                    <div class="subscription-price">
                      <span class="currency">{{ subscription.currency }}</span>
                      {{ (subscription.amount / 100).toFixed(2) }} /
                      {{ subscription.recurringInterval }}
                    </div>
                    <div class="subscription-dates">
                      <div class="subscription-date-item">
                        <span class="date-label">{{ $t('settings.start-date') }}</span>
                        <span class="date-value">{{
                          format(subscription.currentPeriodStart, 'MMM dd, yyyy')
                        }}</span>
                      </div>
                      <div class="subscription-date-item">
                        <span class="date-label">{{ $t('settings.renewal-date') }}</span>
                        <span class="date-value">{{
                          format(subscription.currentPeriodEnd, 'MMM dd, yyyy')
                        }}</span>
                      </div>
                    </div>
                  </div>
                </template>
              </Card>
            </div>
          </template>

          <Button
            v-if="subscriptions.length > 0"
            class="btn manage-subscription-btn"
            :loading="isBillingPortalUrlLoading"
            @click="openBillingPortal"
          >
            {{ $t('settings.manage-subscription') }}
          </Button>
          <UpgradeDialog v-if="subscriptions.length === 0" />
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
import { computed, ref } from 'vue'
import { useAppSettings } from '@renderer/store/settings'
import { storeToRefs } from 'pinia'
import Button from 'primevue/button'
import { supabase } from '@@/supabase'
import { useAuth } from '@renderer/store/auth'
import { useBuildHistory } from '../store/build-history'
import UpgradeDialog from '@renderer/components/UpgradeDialog.vue'
import { useAPI } from '@renderer/composables/api'

import { format } from 'date-fns'
import { useI18n } from 'vue-i18n'
import { Locales, MessageSchema } from '@@/i18n-utils'
import { watch } from 'vue'

const { t, locale } = useI18n<
  {
    message: MessageSchema
  },
  Locales
>()

const appSettings = useAppSettings()
const authStore = useAuth()
const buildHistoryStore = useBuildHistory()
const api = useAPI()

const { settings: settingsRef } = storeToRefs(appSettings)
const { subscriptions, user } = storeToRefs(authStore)
const { canUseHistory, storageInfo } = storeToRefs(buildHistoryStore)

const currentLocale = computed({
  get: () => (settingsRef.value?.locale as string) || 'en-US',
  set: (value: string) => {
    appSettings.updateSettings({
      ...settingsRef.value,
      locale: value as Locales
    })
  }
})

// Update i18n locale when settings change
watch(
  () => settingsRef.value?.locale,
  (newLocale) => {
    if (newLocale) {
      locale.value = newLocale
    }
  },
  { immediate: true }
)

const cacheFolder = computed(() => {
  return settingsRef.value?.cacheFolder
})

const updateCacheFolder = (value: string) => {
  return appSettings.updateSettings({
    ...settingsRef.value,
    cacheFolder: value
  })
}

const updateClearTemporaryFoldersOnPipelineEnd = (value: boolean) => {
  return appSettings.updateSettings({
    ...settingsRef.value,
    clearTemporaryFoldersOnPipelineEnd: value
  })
}

const browseCacheFolder = async () => {
  const newPath = await api.execute('dialog:showOpenDialog', {
    title: t('settings.select-cache-folder'),
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
const clearCache = async () => {
  if (!settingsRef.value?.cacheFolder) return

  try {
    // Clear the cache folder contents
    await api.execute('fs:rm', {
      path: settingsRef.value.cacheFolder,
      recursive: true,
      force: true
    })

    // Show success message
    // You might want to replace this with a toast notification component if available
    alert(t('settings.cache-cleared-successfully'))
  } catch (error) {
    console.error('Failed to clear cache:', error)
    alert(t('settings.failed-to-clear-cache-error-message', [error.message]))
  }
}

const resetCacheFolder = async () => {
  try {
    // Reset to default cache folder (system temp directory)
    await appSettings.reset('cacheFolder')

    // Show success message
    // You might want to replace this with a toast notification component if available
    alert(`Cache folder reset to default`)
  } catch (error) {
    console.error('Failed to reset cache folder:', error)
    alert(t('settings.failed-to-reset-cache-folder-error-message', [error.message]))
  }
}

const isBillingPortalUrlLoading = ref(false)

const openBillingPortal = async () => {
  isBillingPortalUrlLoading.value = true
  try {
    const result = await supabase.functions.invoke('customer-portal')
    console.log('result', result)
    window.open(result.data.customerPortal)
  } catch (error) {
    console.error('Error opening billing portal:', error)
  }
  isBillingPortalUrlLoading.value = false
}

const formatDate = (timestamp: number): string => {
  return new Date(timestamp).toLocaleDateString()
}

const formatSize = (bytes: number): string => {
  const units = ['B', 'KB', 'MB', 'GB']
  let size = bytes
  let unitIndex = 0

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024
    unitIndex++
  }

  return `${size.toFixed(1)} ${units[unitIndex]}`
}

const refreshStorageInfo = async () => {
  try {
    await buildHistoryStore.refreshStorageInfo()
  } catch (error) {
    console.error('Failed to refresh storage info:', error)
  }
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

.subscription-details {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;

  .subscription-price {
    font-size: 1.1rem;
    font-weight: 600;

    .currency {
      text-transform: uppercase;
      margin-right: 0.25rem;
    }
  }

  .subscription-dates {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    font-size: 0.9rem;

    .subscription-date-item {
      display: flex;
      justify-content: space-between;

      .date-label {
        font-weight: 500;
        color: #666;
      }

      .date-value {
        font-weight: 600;
        color: #333;
      }
    }
  }
}

.manage-subscription-btn {
  margin-top: 1rem;
  width: 100%;
}

.storage-info {
  background: #f8f9fa;
  border: 1px solid #e9ecef;
  border-radius: 8px;
  padding: 1.5rem;
  margin-top: 1rem;
}

.storage-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1rem;
}

.storage-header h3 {
  margin: 0;
  color: #495057;
  font-size: 1.25rem;
}

.storage-stats {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 1rem;
}

.stat-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.75rem;
  background: #fff;
  border-radius: 6px;
  border: 1px solid #e9ecef;
}

.stat-item label {
  font-weight: 600;
  color: #6c757d;
}

.stat-item span {
  color: #495057;
  font-weight: 500;
}

/* Responsive adjustments */
@media (max-width: 768px) {
  .storage-stats {
    grid-template-columns: 1fr;
  }
}
</style>
