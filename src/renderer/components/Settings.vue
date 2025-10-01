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
          <p class="m-0">No settings yet</p>
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
import { computed } from 'vue'
import { useAppSettings } from '@renderer/store/settings'
import { storeToRefs } from 'pinia'
import Button from 'primevue/button'
import { supabase } from '@@/supabase'
import { useAuth } from '@renderer/store/auth'
import UpgradeDialog from '@renderer/components/UpgradeDialog.vue'

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

const { settings: settingsRef } = storeToRefs(appSettings)
const { subscriptions, user } = storeToRefs(authStore)

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

const openBillingPortal = async () => {
  const result = await supabase.functions.invoke('customer-portal')
  console.log('result', result)
  window.open(result.data.customerPortal)
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
</style>
