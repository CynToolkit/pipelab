<template>
  <div class="card">
    <Tabs value="0">
      <TabList>
        <Tab value="0">{{ t("settings.tabs.general") }}</Tab>
        <Tab value="2">{{ t("settings.tabs.advanced") }}</Tab>
        <Tab v-if="user" value="3">{{ t("settings.tabs.billing") }}</Tab>
      </TabList>
      <TabPanels>
        <!-- General Tab -->
        <TabPanel value="0">
          <div class="settings-group">
            <div class="setting-item">
              <div class="setting-content">
                <label for="autosave" class="setting-title">{{ t("settings.autosave") }}</label>
                <div class="setting-description">{{ t("settings.autosaveDescription") }}</div>
              </div>
              <div class="setting-action">
                <ToggleSwitch
                  :disabled="!settingsRef"
                  input-id="autosave"
                  :model-value="settingsRef?.autosave ?? true"
                  @update:model-value="updateAutosave"
                />
              </div>
            </div>
            
            <div class="setting-item">
              <div class="setting-content">
                <label for="app-theme" class="setting-title">{{ t("settings.darkTheme") }}</label>
                <div class="setting-description">Toggle between light and dark mode for the application interface.</div>
              </div>
              <div class="setting-action">
                <ToggleSwitch
                  :disabled="!settingsRef"
                  aria-label="Toggle dark mode"
                  input-id="app-theme"
                  :model-value="false"
                />
              </div>
            </div>

            <div class="setting-item">
              <div class="setting-content">
                <label for="language-select" class="setting-title">{{ $t("settings.language") }}</label>
                <div class="setting-description">Select your preferred language for the application UI.</div>
              </div>
              <div class="setting-action">
                <Select
                  input-id="language-select"
                  v-model="currentLocale"
                  :options="$i18n.availableLocales"
                  class="w-[200px]"
                >
                  <template #option="slotProps">
                    <div class="flex items-center">
                      <div>{{ $t("settings.languageOptions." + slotProps.option) }}</div>
                    </div>
                  </template>
                  <template #value="slotProps">
                    <div class="flex items-center">
                      <div>{{ $t("settings.languageOptions." + slotProps.value) }}</div>
                    </div>
                  </template>
                </Select>
              </div>
            </div>

            <div class="setting-item">
              <div class="setting-content">
                <div class="setting-title">Onboarding Tours</div>
                <div class="setting-description">Restart the interactive guides for different sections of the app.</div>
              </div>
              <div class="setting-action flex gap-2">
                <Button
                  outlined
                  severity="secondary"
                  size="small"
                  :label="t('settings.restart-dashboard-tour')"
                  @click="restartTour('dashboard')"
                >
                  <template #icon>
                    <i class="mdi mdi-refresh mr-2"></i>
                  </template>
                </Button>
                <Button
                  outlined
                  severity="secondary"
                  size="small"
                  :label="t('settings.restart-editor-tour')"
                  @click="restartTour('editor')"
                >
                  <template #icon>
                    <i class="mdi mdi-refresh mr-2"></i>
                  </template>
                </Button>
              </div>
            </div>
          </div>
        </TabPanel>

        <!-- Advanced Tab -->
        <TabPanel value="2">
          <div class="settings-group mb-8">
            <div class="section-header">
              <h3>{{ t("settings.retentionPolicy") }}</h3>
              <p class="description">{{ t("settings.retentionPolicyDescription") }}</p>
            </div>

            <div v-if="storageInfo && storageInfo.disk" class="storage-card mb-6 mt-4">
              <div class="card-header mb-4">
                <div class="flex items-center gap-2">
                  <i class="pi pi-database text-primary text-xl"></i>
                  <span class="text-lg font-bold tracking-tight">{{ t('settings.disk-usage') }}</span>
                  <Button
                    v-tooltip.top="'Refresh storage info'"
                    text
                    severity="secondary"
                    size="small"
                    class="ml-2"
                    @click="refreshStorageInfo"
                  >
                    <i class="pi pi-refresh"></i>
                  </Button>
                </div>
                <div class="text-sm font-medium opacity-60">
                  {{ formatSize(storageInfo.disk.total - storageInfo.disk.free) }} / {{ formatSize(storageInfo.disk.total) }}
                </div>
              </div>

              <!-- Main Progress Bar -->
              <div class="usage-bar-container mb-6">
                <div class="usage-bar">
                  <div 
                    class="usage-segment pipelab-segment" 
                    :style="{ width: (storageInfo.disk.pipelab / storageInfo.disk.total * 100) + '%' }"
                    v-tooltip="t('settings.storage-pipelab') + ': ' + formatSize(storageInfo.disk.pipelab)"
                  ></div>
                  <div 
                    class="usage-segment other-segment" 
                    :style="{ width: ((storageInfo.disk.total - storageInfo.disk.free - storageInfo.disk.pipelab) / storageInfo.disk.total * 100) + '%' }"
                    v-tooltip="t('settings.storage-other') + ': ' + formatSize(storageInfo.disk.total - storageInfo.disk.free - storageInfo.disk.pipelab)"
                  ></div>
                </div>
              </div>

              <!-- Legend / Details -->
              <div class="usage-details grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div class="detail-item">
                  <div class="flex items-center gap-2 mb-1">
                    <div class="dot pipelab-dot"></div>
                    <span class="detail-label">{{ t('settings.storage-pipelab') }}</span>
                  </div>
                  <div class="detail-value">{{ formatSize(storageInfo.disk.pipelab) }}</div>
                </div>
                <div class="detail-item">
                  <div class="flex items-center gap-2 mb-1">
                    <div class="dot other-dot"></div>
                    <span class="detail-label">{{ t('settings.storage-other') }}</span>
                  </div>
                  <div class="detail-value">{{ formatSize(storageInfo.disk.total - storageInfo.disk.free - storageInfo.disk.pipelab) }}</div>
                </div>
                <div class="detail-item">
                  <div class="flex items-center gap-2 mb-1">
                    <div class="dot free-dot"></div>
                    <span class="detail-label">{{ t('settings.storage-free') }}</span>
                  </div>
                  <div class="detail-value">{{ formatSize(storageInfo.disk.free) }}</div>
                </div>
              </div>
            </div>

            <div class="setting-item">
              <div class="setting-content">
                <label for="retention-enabled" class="setting-title">{{ t("settings.retentionEnabled") }}</label>
                <div class="setting-description">Automatically delete old pipelines builds to save space.</div>
              </div>
              <div class="setting-action">
                <ToggleSwitch
                  :disabled="!settingsRef"
                  input-id="retention-enabled"
                  :model-value="settingsRef?.buildHistory?.retentionPolicy?.enabled ?? false"
                  @update:model-value="updateRetentionEnabled"
                />
              </div>
            </div>

            <div class="setting-item" :class="{ 'opacity-50 pointer-events-none': !settingsRef?.buildHistory?.retentionPolicy?.enabled }">
              <div class="setting-content">
                <label for="max-entries" class="setting-title">{{ t("settings.retentionMaxEntries") }}</label>
                <div class="setting-description">{{ t("settings.retentionMaxEntriesDescription") }}</div>
              </div>
              <div class="setting-action">
                <InputNumber
                  v-model="retentionMaxEntries"
                  :disabled="!settingsRef || !settingsRef?.buildHistory?.retentionPolicy?.enabled"
                  input-id="max-entries"
                  show-buttons
                  :min="1"
                  :max="1000"
                  class="w-[120px]"
                />
              </div>
            </div>

            <div class="setting-item" :class="{ 'opacity-50 pointer-events-none': !settingsRef?.buildHistory?.retentionPolicy?.enabled }">
              <div class="setting-content">
                <label for="max-age" class="setting-title">{{ t("settings.retentionMaxAge") }}</label>
                <div class="setting-description">{{ t("settings.retentionMaxAgeDescription") }}</div>
              </div>
              <div class="setting-action">
                <InputNumber
                  v-model="retentionMaxAge"
                  :disabled="!settingsRef || !settingsRef?.buildHistory?.retentionPolicy?.enabled"
                  input-id="max-age"
                  show-buttons
                  :min="1"
                  :max="365"
                  class="w-[120px]"
                />
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
                        <span class="date-label">{{ $t("settings.start-date") }}</span>
                        <span class="date-value">{{
                          format(subscription.currentPeriodStart, "MMM dd, yyyy")
                        }}</span>
                      </div>
                      <div class="subscription-date-item">
                        <span class="date-label">{{ $t("settings.renewal-date") }}</span>
                        <span class="date-value">{{
                          format(subscription.currentPeriodEnd, "MMM dd, yyyy")
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
            {{ $t("settings.manage-subscription") }}
          </Button>
          <UpgradeDialog v-if="subscriptions.length === 0" />
        </TabPanel>
      </TabPanels>
    </Tabs>
  </div>
</template>

<script lang="ts" setup>
import Tabs from "primevue/tabs";
import TabList from "primevue/tablist";
import Tab from "primevue/tab";
import Card from "primevue/card";
import TabPanels from "primevue/tabpanels";
import TabPanel from "primevue/tabpanel";
import { computed, ref, onMounted, toRaw } from "vue";
import { useAppSettings } from "@renderer/store/settings";
import { storeToRefs } from "pinia";
import Button from "primevue/button";
import InputNumber from "primevue/inputnumber";
import { supabase } from "@pipelab/shared";
import { useAuth } from "@renderer/store/auth";
import { useBuildHistory } from "../store/build-history";
import UpgradeDialog from "@renderer/components/UpgradeDialog.vue";
import { useAPI } from "@renderer/composables/api";

import { format } from "date-fns";
import { useI18n } from "vue-i18n";
import { Locales, MessageSchema } from "@pipelab/shared";
import { watch } from "vue";

const { t, locale } = useI18n<
  {
    message: MessageSchema;
  },
  Locales
>();

const appSettings = useAppSettings();
const authStore = useAuth();
const buildHistoryStore = useBuildHistory();
const api = useAPI();

const { settings: settingsRef } = storeToRefs(appSettings);
const { subscriptions, user } = storeToRefs(authStore);
const { canUseHistory, storageInfo } = storeToRefs(buildHistoryStore);

onMounted(async () => {
  await buildHistoryStore.refreshStorageInfo();
});


const currentLocale = computed({
  get: () => (settingsRef.value?.locale as string) || "en-US",
  set: (value: string) => {
    appSettings.updateSettings({
      ...(toRaw(settingsRef.value) as any),
      locale: value as Locales,
    });
  },
});

// Update i18n locale when settings change
watch(
  () => settingsRef.value?.locale,
  (newLocale) => {
    if (newLocale) {
      locale.value = newLocale;
    }
  },
  { immediate: true },
);


const updateAutosave = (value: boolean) => {
  return appSettings.updateSettings({
    ...(toRaw(settingsRef.value) as any),
    autosave: value,
  });
};



const updateRetentionEnabled = (value: boolean) => {
  const currentBuildHistory = settingsRef.value.buildHistory || {};
  const currentPolicy = currentBuildHistory.retentionPolicy || {
    enabled: false,
    maxEntries: 50,
    maxAge: 30,
  };

  return appSettings.updateSettings({
    ...(toRaw(settingsRef.value) as any),
    buildHistory: {
      ...currentBuildHistory,
      retentionPolicy: {
        ...currentPolicy,
        enabled: value,
      },
    },
  });
};

const retentionMaxEntries = computed({
  get: () => settingsRef.value?.buildHistory?.retentionPolicy?.maxEntries ?? 50,
  set: (value: number) => {
    const currentBuildHistory = settingsRef.value.buildHistory || {};
    const currentPolicy = currentBuildHistory.retentionPolicy || {
      enabled: false,
      maxEntries: 50,
      maxAge: 30,
    };

    appSettings.updateSettings({
      ...(toRaw(settingsRef.value) as any),
      buildHistory: {
        ...currentBuildHistory,
        retentionPolicy: {
          ...currentPolicy,
          maxEntries: value,
        },
      },
    });
  },
});

const retentionMaxAge = computed({
  get: () => settingsRef.value?.buildHistory?.retentionPolicy?.maxAge ?? 30,
  set: (value: number) => {
    const currentBuildHistory = settingsRef.value.buildHistory || {};
    const currentPolicy = currentBuildHistory.retentionPolicy || {
      enabled: false,
      maxEntries: 50,
      maxAge: 30,
    };

    appSettings.updateSettings({
      ...(toRaw(settingsRef.value) as any),
      buildHistory: {
        ...currentBuildHistory,
        retentionPolicy: {
          ...currentPolicy,
          maxAge: value,
        },
      },
    });
  },
});


const isBillingPortalUrlLoading = ref(false);

const openBillingPortal = async () => {
  isBillingPortalUrlLoading.value = true;
  try {
    const result = await supabase().functions.invoke("customer-portal");
    console.log("result", result);
    window.open(result.data.customerPortal);
  } catch (error) {
    console.error("Error opening billing portal:", error);
  }
  isBillingPortalUrlLoading.value = false;
};

const formatDate = (timestamp: number): string => {
  return new Date(timestamp).toLocaleDateString();
};

const formatSize = (bytes: number): string => {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
};

const refreshStorageInfo = async () => {
  try {
    await buildHistoryStore.refreshStorageInfo();
  } catch (error) {
    console.error("Failed to refresh storage info:", error);
  }
};

const restartTour = (tourId: "dashboard" | "editor") => {
  const tours = { ...settingsRef.value.tours };
  tours[tourId] = {
    step: 0,
    completed: false,
  };
  appSettings.updateSettings({
    ...(toRaw(settingsRef.value) as any),
    tours,
  });
  alert(t("settings.tour-reset-success"));
};
</script>

<style lang="scss" scoped>
.settings-group {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.setting-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1.5rem;
  background: var(--surface-card);
  border: 1px solid var(--surface-border);
  border-radius: 12px;
  transition: all 0.2s ease;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.02);

  &:hover {
    border-color: var(--primary-color);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05);
    transform: translateY(-1px);
  }

  .setting-content {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    flex: 1;
    padding-right: 2rem;
  }

  .setting-title {
    font-size: 1.05rem;
    font-weight: 600;
    color: var(--text-color);
    cursor: default;
    margin: 0;
  }

  .setting-description {
    font-size: 0.85rem;
    color: var(--text-color-secondary);
    line-height: 1.5;
    opacity: 0.85;
  }

  .setting-action {
    display: flex;
    align-items: center;
    flex-shrink: 0;
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

.storage-card {
  background: var(--surface-card);
  border: 1px solid var(--surface-border);
  border-radius: 16px;
  padding: 1.5rem;
  box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);

  .card-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .usage-bar-container {
    background: #cbd5e1; /* Much darker slate to ensure visibility */
    height: 12px;
    border-radius: 100px;
    position: relative;
    padding: 0;
    overflow: hidden;
    border: 1px solid rgba(0,0,0,0.05);
  }

  .usage-bar {
    display: flex;
    height: 100%;
    width: 100%;
    gap: 0; /* No gaps for a unified look */
  }

  .usage-segment {
    height: 100%;
    transition: width 0.6s cubic-bezier(0.34, 1.56, 0.64, 1);
    border-right: 2px solid #cbd5e1; /* Matches the empty track for a "slotted" effect */
  }

  .pipelab-segment {
    background: linear-gradient(135deg, #a855f7 0%, #8b5cf6 100%);
    min-width: 8px;
  }

  .other-segment {
    background: #3b82f6;
    box-shadow: 0 2px 4px rgba(59, 130, 246, 0.15);
  }

  .free-segment {
    background: var(--surface-300); /* Darker gray to distinguish from card */
    opacity: 0.8;
  }

  .detail-item {
    padding: 1rem;
    background: var(--surface-card);
    border-radius: 12px;
    border: 1px solid var(--surface-border);
    transition: all 0.2s ease;
    cursor: default;

    &:hover {
      border-color: var(--primary-color);
      transform: translateY(-2px);
      background: var(--surface-section);
    }
  }

  .detail-label {
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    font-weight: 700;
    opacity: 0.6;
  }

  .detail-value {
    font-size: 1.25rem;
    font-weight: 800;
    font-family: 'Inter', sans-serif;
  }

  .dot {
    width: 10px;
    height: 10px;
    border-radius: 3px;
    box-shadow: 0 0 8px rgba(0,0,0,0.1);
  }

  .pipelab-dot { background: linear-gradient(135deg, #8b5cf6 0%, #6366f1 100%); }
  .other-dot { background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%); }
  .free-dot { background: #cbd5e1; }
}

.section-header {
  margin-bottom: 1.5rem;
  padding-bottom: 1rem;
  border-bottom: 1px solid var(--surface-border);

  h3 {
    margin: 0 0 0.35rem 0;
    font-size: 1.25rem;
    font-weight: 700;
    color: var(--text-color);
    letter-spacing: -0.01em;
  }

  .description {
    margin: 0;
    font-size: 0.9rem;
    color: var(--text-color-secondary);
  }
}

.input-small {
  width: 150px;
}
/* Modern Tab Styling */
:deep(.p-tabs) {
  background: transparent;
}

:deep(.p-tablist-tab-list) {
  border-bottom: 1px solid var(--surface-border) !important;
  gap: 1.5rem;
  background: transparent !important;
  border-top: none !important;
}

:deep(.p-tablist-content) {
  background: transparent !important;
}

:deep(.p-tab) {
  padding: 1rem 0.5rem !important;
  font-weight: 600 !important;
  color: var(--text-color-secondary) !important;
  background: transparent !important;
  border-bottom: 2px solid transparent !important;
  transition: all 0.2s ease !important;
  min-width: 80px;
  display: flex;
  justify-content: center;
  border-top: none !important;

  &:not(.p-disabled):hover {
    color: var(--text-color) !important;
    background: transparent !important;
  }

  &.p-tab-active {
    color: var(--primary-color) !important;
    border-bottom-color: var(--primary-color) !important;
    background: transparent !important;
  }
}

:deep(.p-tabpanels) {
  padding: 2rem 0 !important;
  background: transparent !important;
}
</style>
