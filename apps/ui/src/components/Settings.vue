<template>
  <div
    v-if="!settingsLoaded && !isBrowser"
    class="settings-loading"
    role="status"
    aria-live="polite"
  >
    <p>
      {{
        !isReady
          ? "Settings will be available when the agent connects."
          : settingsError || "Loading settings…"
      }}
    </p>
    <Button v-if="isReady && settingsStatus === 'error'" label="Retry" text @click="loadSettings" />
  </div>
  <div v-else class="settings-container" :inert="!isBrowser && !isReady">
    <!-- Left Sidebar -->
    <div class="settings-sidebar">
      <!-- Options Group -->
      <div class="sidebar-group">
        <div class="sidebar-group-header">Options</div>
        <button
          type="button"
          class="sidebar-item"
          :class="{ active: currentSection === 'general' }"
          @click="currentSection = 'general'"
        >
          <i class="mdi mdi-tune mr-2"></i>
          <span>{{ t("settings.tabs.general") }}</span>
        </button>
        <button
          type="button"
          class="sidebar-item"
          :class="{ active: currentSection === 'advanced' }"
          @click="currentSection = 'advanced'"
        >
          <i class="mdi mdi-server mr-2"></i>
          <span>{{ t("settings.tabs.advanced") }}</span>
        </button>
        <!-- Versions tab hidden in bundled mode — one bundle, one version; connection
             and update status already live in the sidebar. Re-enable: uncomment. -->
        <!-- <div
          class="sidebar-item"
          :class="{ active: currentSection === 'versions' }"
          @click="currentSection = 'versions'"
        >
          <i class="mdi mdi-information mr-2"></i>
          <span>{{ t("settings.tabs.versions") }}</span>
        </div> -->
      </div>

      <!-- Account Group -->
      <div v-if="user" class="sidebar-group">
        <div class="sidebar-group-header">Account</div>
        <div
          class="sidebar-item"
          :class="{ active: currentSection === 'profile' }"
          @click="currentSection = 'profile'"
        >
          <i class="mdi mdi-account-outline mr-2"></i>
          <span>Profile</span>
        </div>
        <div
          class="sidebar-item"
          :class="{ active: currentSection === 'billing' }"
          @click="currentSection = 'billing'"
        >
          <i class="mdi mdi-credit-card mr-2"></i>
          <span>Billing</span>
        </div>
        <!-- <div
          class="sidebar-item"
          :class="{ active: currentSection === 'team' }"
          @click="currentSection = 'team'"
        >
          <i class="mdi mdi-account-multiple-outline mr-2"></i>
          <span>Team</span>
        </div> -->
      </div>
    </div>

    <!-- Right Content Panel -->
    <div class="settings-content">
      <!-- General Tab Content -->
      <div v-if="currentSection === 'general'" class="settings-panel">
        <div class="section-header">
          <h3>{{ t("settings.tabs.general") }}</h3>
          <p class="description">Configure primary application behaviors and settings.</p>
        </div>

        <div class="settings-group">
          <div class="setting-item">
            <div class="setting-content">
              <label for="app-theme" class="setting-title">{{ t("settings.darkTheme") }}</label>
              <div class="setting-description">
                {{
                  isBrowser
                    ? "Stored in this browser."
                    : "Toggle between light and dark mode for the application interface."
                }}
              </div>
            </div>
            <div class="setting-action">
              <ToggleSwitch
                :disabled="!isBrowser && !settingsRef"
                aria-label="Toggle dark mode"
                input-id="app-theme"
                :model-value="
                  isBrowser ? browserPreferences.theme === 'dark' : settingsRef?.theme === 'dark'
                "
                @update:model-value="updateTheme"
              />
            </div>
          </div>

          <div class="setting-item">
            <div class="setting-content">
              <label for="language-select" class="setting-title">{{
                $t("settings.language")
              }}</label>
              <div class="setting-description">
                {{
                  isBrowser
                    ? "Stored in this browser."
                    : "Select your preferred language for the application UI."
                }}
              </div>
            </div>
            <div class="setting-action">
              <Select
                input-id="language-select"
                v-model="currentLocale"
                :options="$i18n.availableLocales"
                :disabled="!isBrowser && !settingsRef"
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
              <div class="setting-title">Dashboard Guide</div>
              <div class="setting-description">Restart the interactive dashboard guide.</div>
            </div>
            <div class="setting-action flex gap-2">
              <Button
                outlined
                severity="secondary"
                size="small"
                :label="t('settings.restart-dashboard-tour')"
                :disabled="!canRestartTour"
                :title="
                  canRestartTour ? undefined : 'Connect an agent to restart the dashboard guide.'
                "
                @click="restartTour"
              >
                <template #icon>
                  <i class="mdi mdi-refresh mr-2"></i>
                </template>
              </Button>
            </div>
          </div>
          <p v-if="browserPreferenceError" class="settings-preference-error" role="alert">
            {{ browserPreferenceError }}
          </p>
        </div>
      </div>

      <div v-else-if="currentSection === 'advanced' && !isReady" class="settings-panel">
        <div class="section-header">
          <h3>{{ t("settings.tabs.advanced") }}</h3>
          <p class="description" role="status">
            Machine storage, cache, and filesystem settings require a connected Desktop agent.
          </p>
        </div>
      </div>

      <!-- Advanced Tab Content -->
      <div v-else-if="currentSection === 'advanced'" class="settings-panel">
        <div class="section-header">
          <h3>{{ t("settings.tabs.advanced") }}</h3>
          <p class="description">
            {{ t("settings.manage-where-the-app-stores-temporary-and-cache-files") }}
          </p>
        </div>

        <div v-if="storageInfo && storageInfo.disk" class="storage-card mb-4">
          <div class="card-header mb-3">
            <div class="card-header-left">
              <div class="card-header-title">
                <i class="pi pi-database"></i>
                <span>{{ t("settings.disk-usage") }}</span>
              </div>
              <Button
                v-tooltip.top="'Refresh storage info'"
                text
                severity="secondary"
                size="small"
                class="card-header-icon-btn"
                @click="refreshStorageInfo"
              >
                <i class="pi pi-refresh"></i>
              </Button>
            </div>
            <div class="card-header-right">
              {{ formatSize(storageInfo.disk.total - storageInfo.disk.free) }} /
              {{ formatSize(storageInfo.disk.total) }}
            </div>
          </div>

          <div class="usage-bar-container mb-4">
            <div class="usage-bar">
              <div
                class="usage-segment pipelab-segment"
                :style="{
                  width: (storageInfo.disk.pipelab / storageInfo.disk.total) * 100 + '%',
                }"
                v-tooltip="
                  t('settings.storage-pipelab') + ': ' + formatSize(storageInfo.disk.pipelab)
                "
              ></div>
              <div
                class="usage-segment other-segment"
                :style="{
                  width:
                    ((storageInfo.disk.total - storageInfo.disk.free - storageInfo.disk.pipelab) /
                      storageInfo.disk.total) *
                      100 +
                    '%',
                }"
                v-tooltip="
                  t('settings.storage-other') +
                  ': ' +
                  formatSize(
                    storageInfo.disk.total - storageInfo.disk.free - storageInfo.disk.pipelab,
                  )
                "
              ></div>
            </div>
          </div>

          <div class="usage-details grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div class="detail-item">
              <div class="flex items-center gap-1.5 mb-0.5 dot-container">
                <div class="dot pipelab-dot"></div>
                <span class="detail-label">{{ t("settings.storage-pipelab") }}</span>
              </div>
              <div class="detail-value text-sm">{{ formatSize(storageInfo.disk.pipelab) }}</div>
            </div>
            <div class="detail-item">
              <div class="flex items-center gap-1.5 mb-0.5 dot-container">
                <div class="dot other-dot"></div>
                <span class="detail-label">{{ t("settings.storage-other") }}</span>
              </div>
              <div class="detail-value text-sm">
                {{
                  formatSize(
                    storageInfo.disk.total - storageInfo.disk.free - storageInfo.disk.pipelab,
                  )
                }}
              </div>
            </div>
            <div class="detail-item">
              <div class="flex items-center gap-1.5 mb-0.5 dot-container">
                <div class="dot free-dot"></div>
                <span class="detail-label">{{ t("settings.storage-free") }}</span>
              </div>
              <div class="detail-value text-sm">{{ formatSize(storageInfo.disk.free) }}</div>
            </div>
          </div>

          <!-- Sandbox Subfolders Breakdown -->
          <div
            v-if="storageInfo?.disk?.folders && storageInfo.disk.folders.length > 0"
            class="sandbox-breakdown-container mt-4"
          >
            <h4 class="text-sm font-semibold mb-3 opacity-90">
              {{ t("settings.storage-breakdown", "Pipelab Sandbox Directory Breakdown") }}
            </h4>
            <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div
                v-for="folder in storageInfo?.disk?.folders"
                :key="folder.name"
                class="detail-item"
              >
                <div class="flex items-center gap-1.5 mb-0.5 dot-container">
                  <div class="dot pipelab-dot"></div>
                  <span class="detail-label">{{ getFolderLabel(folder) }}</span>
                </div>
                <div class="detail-value text-sm">{{ formatSize(folder.size) }}</div>
              </div>
            </div>
          </div>
        </div>

        <div v-else class="storage-card mb-4 dummy-storage-card">
          <div class="card-header mb-3">
            <div class="card-header-left">
              <div class="card-header-title opacity-60">
                <i class="pi pi-database"></i>
                <span>{{ t("settings.disk-usage") }}</span>
              </div>
            </div>
            <div class="card-header-right opacity-60">-- / --</div>
          </div>

          <div class="usage-bar-container mb-4">
            <div class="usage-bar">
              <div
                class="usage-segment"
                style="width: 100%; opacity: 0.1; background: var(--p-surface-400)"
              ></div>
            </div>
          </div>

          <div class="usage-details grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div class="detail-item opacity-60">
              <div class="flex items-center gap-1.5 mb-0.5 dot-container">
                <div class="dot" style="background: var(--p-surface-400)"></div>
                <span class="detail-label">{{ t("settings.storage-pipelab") }}</span>
              </div>
              <div class="detail-value text-sm">--</div>
            </div>
            <div class="detail-item opacity-60">
              <div class="flex items-center gap-1.5 mb-0.5 dot-container">
                <div class="dot" style="background: var(--p-surface-300)"></div>
                <span class="detail-label">{{ t("settings.storage-other") }}</span>
              </div>
              <div class="detail-value text-sm">--</div>
            </div>
            <div class="detail-item opacity-60">
              <div class="flex items-center gap-1.5 mb-0.5 dot-container">
                <div class="dot" style="background: var(--p-surface-200)"></div>
                <span class="detail-label">{{ t("settings.storage-free") }}</span>
              </div>
              <div class="detail-value text-sm">--</div>
            </div>
          </div>
        </div>

        <!-- Cache Cleanup Group -->
        <div class="settings-group mt-4">
          <div class="setting-item">
            <div class="setting-content">
              <span class="setting-title">{{
                t("settings.clean-packages-title", "Clean Package Cache")
              }}</span>
              <span class="setting-description">
                {{
                  t(
                    "settings.clean-packages-desc",
                    "Deletes all downloaded packages and cached runner dependencies. Force-reinstalls them cleanly on the next run.",
                  )
                }}
              </span>
            </div>
            <div class="setting-action">
              <Button
                :label="t('settings.clean-packages-btn', 'Clean Packages')"
                severity="danger"
                size="small"
                outlined
                icon="pi pi-trash"
                :loading="cleaningPackages"
                @click="cleanPackagesCache"
              />
            </div>
          </div>
        </div>

        <!-- Custom Paths Settings Group -->
        <div class="settings-group mt-4">
          <div class="setting-item flex-column align-items-stretch">
            <div class="setting-content mb-2">
              <span class="setting-title">{{
                t("settings.package-cache-folder", "Package Cache Folder")
              }}</span>
              <span class="setting-description">
                Change the directory where downloaded dependencies are cached. Leave blank to use
                default workspace storage.
              </span>
            </div>
            <div class="flex gap-2 align-items-center">
              <InputText
                :model-value="settingsRef?.cacheFolder || ''"
                class="flex-grow-1"
                size="small"
                readonly
                placeholder="Default sandboxed cache folder"
              />
              <Button label="Browse" size="small" severity="secondary" @click="browseCacheFolder" />
              <Button
                icon="pi pi-folder-open"
                size="small"
                severity="secondary"
                outlined
                v-tooltip.top="'Open folder'"
                @click="openCacheFolder"
              />
              <Button
                v-if="settingsRef?.cacheFolder"
                icon="pi pi-refresh"
                size="small"
                severity="danger"
                outlined
                v-tooltip.top="'Reset to default'"
                @click="resetCacheFolder"
              />
            </div>
          </div>

          <div class="setting-item flex-column align-items-stretch mt-3">
            <div class="setting-content mb-2">
              <span class="setting-title">Workflow Temporary Folder</span>
              <span class="setting-description">
                Change the directory where temporary build and intermediate files are processed.
                Leave blank to use default workspace storage.
              </span>
            </div>
            <div class="flex gap-2 align-items-center">
              <InputText
                :model-value="settingsRef?.tempFolder || ''"
                class="flex-grow-1"
                size="small"
                readonly
                placeholder="Default sandboxed temp folder"
              />
              <Button label="Browse" size="small" severity="secondary" @click="browseTempFolder" />
              <Button
                icon="pi pi-folder-open"
                size="small"
                severity="secondary"
                outlined
                v-tooltip.top="'Open folder'"
                @click="openTempFolder"
              />
              <Button
                v-if="settingsRef?.tempFolder"
                icon="pi pi-refresh"
                size="small"
                severity="danger"
                outlined
                v-tooltip.top="'Reset to default'"
                @click="resetTempFolder"
              />
            </div>
          </div>
        </div>
      </div>

      <!-- Versions Tab Content (hidden in bundled mode — see sidebar-item above).
      <div v-if="currentSection === 'versions'" class="settings-panel">
        <div class="section-header">
          <h3>{{ t("settings.tabs.versions") }}</h3>
          <p class="description">
            Information about the application components and runtime versions.
          </p>
        </div>

        <div class="settings-group">
          <div class="setting-item">
            <div class="setting-content">
              <span class="setting-title">Application Version</span>
              <span class="setting-description">The core version of the Pipelab desktop app.</span>
            </div>
            <div class="setting-action flex items-center gap-2">
              <span class="font-mono text-sm mr-2">{{ formatVersion(appVersion) }}</span>
              <Button
                icon="pi pi-copy"
                severity="secondary"
                text
                size="small"
                v-tooltip.top="'Copy version'"
                @click="copyToClipboard(appVersion)"
              />
            </div>
          </div>

          <div class="setting-item">
            <div class="setting-content">
              <span class="setting-title">Agent Version</span>
              <span class="setting-description">The version of the workflow execution engine.</span>
            </div>
            <div class="setting-action flex items-center gap-2">
              <span class="font-mono text-sm mr-2">{{ formatVersion(agentVersion) }}</span>
              <Button
                icon="pi pi-copy"
                severity="secondary"
                text
                size="small"
                v-tooltip.top="'Copy version'"
                @click="copyToClipboard(agentVersion)"
              />
            </div>
          </div>

          <div class="setting-item">
            <div class="setting-content">
              <span class="setting-title">UI Version</span>
              <span class="setting-description">The version of the frontend user interface.</span>
            </div>
            <div class="setting-action flex items-center gap-2">
              <span class="font-mono text-sm mr-2">{{ formatVersion(uiVersion) }}</span>
              <Button
                icon="pi pi-copy"
                severity="secondary"
                text
                size="small"
                v-tooltip.top="'Copy version'"
                @click="copyToClipboard(uiVersion)"
              />
            </div>
          </div>

          <div v-if="isElectron" class="setting-item">
            <div class="setting-content">
              <span class="setting-title">Electron Version</span>
              <span class="setting-description"
                >The underlying Electron runtime framework version.</span
              >
            </div>
            <div class="setting-action flex items-center gap-2">
              <span class="font-mono text-sm mr-2">{{ formatVersion(electronVersion) }}</span>
              <Button
                icon="pi pi-copy"
                severity="secondary"
                text
                size="small"
                v-tooltip.top="'Copy version'"
                @click="copyToClipboard(electronVersion)"
              />
            </div>
          </div>
        </div>
      </div>
      -->

      <!-- Billing Tab Content -->
      <div v-if="currentSection === 'billing'" class="settings-panel">
        <div class="section-header">
          <h3>Billing</h3>
          <p class="description">Manage your account billing details and premium subscriptions.</p>
        </div>

        <div v-if="subscriptionStatus !== 'ready'" role="status">
          <p>
            {{ subscriptionStatus === "error" ? "Unable to check your plan." : "Checking plan…" }}
          </p>
          <Button
            v-if="subscriptionStatus === 'error'"
            label="Retry"
            text
            @click="authStore.fetchSubscription()"
          />
        </div>
        <div v-else-if="subscriptions.length > 0" class="billing-container">
          <div
            v-for="subscription in subscriptions"
            :key="subscription.id"
            class="settings-group mb-4"
          >
            <div v-if="subscription.status === 'active'">
              <!-- Row 1: Plan Name -->
              <div class="setting-item">
                <div class="setting-content">
                  <span class="setting-title">Subscription Plan</span>
                  <span class="setting-description">Your current active subscription.</span>
                </div>
                <div class="setting-action flex items-center gap-2">
                  <span class="font-bold text-sm text-color mr-2">{{
                    subscription.product.name
                  }}</span>
                  <span class="installed-badge">Active</span>
                </div>
              </div>

              <!-- Row 2: Price -->
              <div class="setting-item">
                <div class="setting-content">
                  <span class="setting-title">Pricing</span>
                  <span class="setting-description"
                    >The billing amount and frequency of your plan.</span
                  >
                </div>
                <div class="setting-action">
                  <span class="font-semibold text-sm text-color">
                    {{ subscription.currency?.toUpperCase() ?? "" }}
                    {{
                      subscription.amount !== undefined
                        ? (subscription.amount / 100).toFixed(2)
                        : "0.00"
                    }}
                    /
                    {{ subscription.recurringInterval ?? "" }}
                  </span>
                </div>
              </div>

              <!-- Row 3: Start Date -->
              <div class="setting-item">
                <div class="setting-content">
                  <span class="setting-title">{{ $t("settings.start-date") }}</span>
                  <span class="setting-description">When your subscription started.</span>
                </div>
                <div class="setting-action">
                  <span class="text-sm font-medium text-color">{{
                    subscription.currentPeriodStart
                      ? format(subscription.currentPeriodStart, "MMM dd, yyyy")
                      : ""
                  }}</span>
                </div>
              </div>

              <!-- Row 4: Renewal Date -->
              <div class="setting-item">
                <div class="setting-content">
                  <span class="setting-title">{{ $t("settings.renewal-date") }}</span>
                  <span class="setting-description"
                    >When your subscription will automatically renew.</span
                  >
                </div>
                <div class="setting-action">
                  <span class="text-sm font-medium text-color">{{
                    subscription.currentPeriodEnd
                      ? format(subscription.currentPeriodEnd, "MMM dd, yyyy")
                      : ""
                  }}</span>
                </div>
              </div>
            </div>
          </div>

          <Button
            class="manage-portal-btn w-full py-2"
            severity="secondary"
            outlined
            :loading="isBillingPortalUrlLoading"
            @click="openBillingPortal"
          >
            <template #icon>
              <i class="pi pi-external-link mr-2"></i>
            </template>
            {{ $t("settings.manage-subscription") }}
          </Button>
        </div>

        <UpgradeDialog v-else />
      </div>

      <!-- Profile Tab Content -->
      <div v-if="currentSection === 'profile'" class="settings-panel">
        <div class="section-header">
          <h3>Profile</h3>
          <p class="description">Your account information and subscription tier.</p>
        </div>

        <div class="settings-group">
          <div class="setting-item">
            <div class="setting-content">
              <span class="setting-title">Email Address</span>
              <span class="setting-description">The email associated with your account.</span>
            </div>
            <div class="setting-action">
              <span class="text-sm font-semibold">{{ user?.email }}</span>
            </div>
          </div>

          <div class="setting-item">
            <div class="setting-content">
              <span class="setting-title">User ID</span>
              <span class="setting-description">Your unique identifier.</span>
            </div>
            <div class="setting-action flex items-center gap-2">
              <span class="font-mono text-xs mr-2">{{ user?.id }}</span>
              <Button
                icon="pi pi-copy"
                severity="secondary"
                text
                size="small"
                v-tooltip.top="'Copy User ID'"
                @click="copyToClipboard(user?.id || '')"
              />
            </div>
          </div>

          <div class="setting-item">
            <div class="setting-content">
              <span class="setting-title">Date Joined</span>
              <span class="setting-description">When you registered your account.</span>
            </div>
            <div class="setting-action">
              <span class="text-sm font-medium text-color">
                {{ user?.created_at ? format(new Date(user.created_at), "MMMM dd, yyyy") : "N/A" }}
              </span>
            </div>
          </div>

          <div class="setting-item">
            <div class="setting-content">
              <span class="setting-title">Status</span>
              <span class="setting-description">Your subscription plan status.</span>
            </div>
            <div class="setting-action flex items-center gap-2">
              <span class="text-sm font-semibold">
                {{
                  subscriptions.length > 0 && subscriptions[0].status === "active"
                    ? subscriptions[0].product.name
                    : "Free Tier"
                }}
              </span>
              <span
                class="installed-badge"
                :class="{ 'bg-green-100 text-green-800': subscriptions.length > 0 }"
              >
                {{
                  subscriptions.length > 0 && subscriptions[0].status === "active"
                    ? "Premium"
                    : "Free"
                }}
              </span>
            </div>
          </div>
        </div>

        <div class="mt-4 flex justify-end">
          <Button
            label="Sign Out"
            severity="danger"
            outlined
            size="small"
            icon="pi pi-sign-out"
            @click="logout"
          />
        </div>
      </div>

      <!-- Team Tab Content -->
      <div v-if="currentSection === 'team'" class="settings-panel">
        <div class="section-header">
          <h3>Team Management</h3>
          <p class="description">Collaborate with other developers on your Release workflows.</p>
        </div>

        <div
          class="flex flex-column items-center justify-center py-8 text-center border border-dashed rounded-lg bg-surface-50 dark:bg-surface-950 border-surface-200 dark:border-surface-800 p-6"
        >
          <i class="mdi mdi-account-multiple text-4xl mb-2 text-primary"></i>
          <span class="text-sm font-bold block mb-1">Teams Coming Soon</span>
          <span class="text-xs text-muted max-w-[320px]">
            Manage team billing, roles, shared variables, and run workflows in a collaborative
            workspace.
          </span>
        </div>
      </div>
    </div>
  </div>
</template>

<script lang="ts" setup>
import { computed, ref, toRaw, watch, inject } from "vue";
import { useAppSettings } from "@renderer/store/settings";
import { storeToRefs } from "pinia";
import Button from "primevue/button";
import Card from "primevue/card";
import InputNumber from "primevue/inputnumber";
import ToggleSwitch from "primevue/toggleswitch";
import Select from "primevue/select";
import { supabase } from "@pipelab/shared";
import { useAuth } from "@renderer/store/auth";
import { useBuildHistory } from "../store/build-history";
import { SandboxFolder } from "@pipelab/constants";
import UpgradeDialog from "@renderer/components/UpgradeDialog.vue";
import { useAPI } from "@renderer/composables/api";
import { websocketManager } from "@renderer/composables/websocket-manager";
import { useShell } from "@renderer/composables/use-shell";

import { format } from "date-fns";
import { useI18n } from "vue-i18n";
import { Locales, MessageSchema } from "@pipelab/shared";
import { watchDebounced } from "@vueuse/core";
import InputText from "primevue/inputtext";
import { useToast } from "primevue/usetoast";
import { useConfirm } from "primevue/useconfirm";
import { useAgentAvailability } from "@renderer/composables/useAgentAvailability";
import {
  browserPreferences,
  saveBrowserPreference,
} from "@renderer/composables/browser-preferences";
import { uiEnvironment } from "@renderer/composables/ui-runtime";

const { t, locale } = useI18n<{ message: MessageSchema }, Locales>();

const confirm = useConfirm();
const appSettings = useAppSettings();
const authStore = useAuth();
const buildHistoryStore = useBuildHistory();
const api = useAPI();
const shell = useShell();
const { isReady } = useAgentAvailability();
const isBrowser = uiEnvironment === "browser";
const currentSection = ref("general");
const browserPreferenceError = ref("");

const openCacheFolder = () => {
  const path =
    settingsRef.value?.cacheFolder ||
    (storageInfo.value?.userDataPath ? `${storageInfo.value.userDataPath}/cache` : null);
  if (path) {
    shell.openExternal(`file://${path}`);
  }
};

const openTempFolder = () => {
  const path =
    settingsRef.value?.tempFolder ||
    (storageInfo.value?.userDataPath ? `${storageInfo.value.userDataPath}/temp` : null);
  if (path) {
    shell.openExternal(`file://${path}`);
  }
};

const browseCacheFolder = async () => {
  const result = await api.execute("dialog:showOpenDialog", {
    properties: ["openDirectory"],
    title: t("settings.select-cache-folder", "Select Cache Folder"),
  });
  if (result.type === "success" && !result.result.canceled && result.result.filePaths.length > 0) {
    appSettings.updateSettings({
      ...(toRaw(settingsRef.value) as any),
      cacheFolder: result.result.filePaths[0],
    });
  }
};

const browseTempFolder = async () => {
  const result = await api.execute("dialog:showOpenDialog", {
    properties: ["openDirectory"],
    title: t("settings.select-temp-folder", "Select Temporary Folder"),
  });
  if (result.type === "success" && !result.result.canceled && result.result.filePaths.length > 0) {
    appSettings.updateSettings({
      ...(toRaw(settingsRef.value) as any),
      tempFolder: result.result.filePaths[0],
    });
  }
};

const resetCacheFolder = () => {
  appSettings.updateSettings({
    ...(toRaw(settingsRef.value) as any),
    cacheFolder: undefined,
  });
};

const resetTempFolder = () => {
  appSettings.updateSettings({
    ...(toRaw(settingsRef.value) as any),
    tempFolder: undefined,
  });
};

const {
  settings: settingsRef,
  loaded: settingsLoaded,
  status: settingsStatus,
  error: settingsError,
} = storeToRefs(appSettings);
const { subscriptions, user, subscriptionStatus } = storeToRefs(authStore);
const { storageInfo } = storeToRefs(buildHistoryStore);

const loadSettings = () => appSettings.load().catch(() => {});
watch(
  isReady,
  (ready) => {
    if (ready) void loadSettings();
  },
  { immediate: true },
);
watch(
  [isReady, currentSection],
  ([ready, section]) => {
    if (ready && section === "advanced")
      void buildHistoryStore.refreshStorageInfo().catch(() => {});
  },
  { immediate: true },
);

const currentLocale = computed({
  get: () =>
    isBrowser ? browserPreferences.locale : (settingsRef.value?.locale as string) || "en-US",
  set: (value: string) => {
    browserPreferenceError.value = "";
    if (isBrowser) {
      if (!saveBrowserPreference("locale", value as Locales)) {
        browserPreferenceError.value =
          "Browser storage is unavailable. Your language was not changed.";
      }
      return;
    }
    appSettings.updateSettings({
      ...(toRaw(settingsRef.value) as any),
      locale: value as Locales,
    });
  },
});

// Update i18n locale when settings change
watch(
  () => (isBrowser ? undefined : settingsRef.value?.locale),
  (newLocale) => {
    if (newLocale) {
      locale.value = newLocale;
    }
  },
  { immediate: true },
);

const updateTheme = (value: boolean) => {
  browserPreferenceError.value = "";
  if (isBrowser) {
    if (!saveBrowserPreference("theme", value ? "dark" : "light")) {
      browserPreferenceError.value = "Browser storage is unavailable. Your theme was not changed.";
    }
    return;
  }
  return appSettings.updateSettings({
    ...(toRaw(settingsRef.value) as any),
    theme: value ? "dark" : "light",
  });
};

const isBillingPortalUrlLoading = ref(false);

const openBillingPortal = async () => {
  isBillingPortalUrlLoading.value = true;
  try {
    const result: any = await api.execute("auth:invoke", { name: "customer-portal" });
    console.log("result", result);
    if (result.type === "success" && result.result.data?.customerPortal) {
      window.open(result.result.data.customerPortal);
    } else if (result.type === "error") {
      console.error("Error from auth:invoke:", result.ipcError);
    } else if (result.result.error) {
      console.error("Error from Edge Function:", result.result.error);
    }
  } catch (error) {
    console.error("Error opening billing portal:", error);
  }
  isBillingPortalUrlLoading.value = false;
};

const formatSize = (bytes: number): string => {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
};

const getFolderLabel = (folder: { name: SandboxFolder; label: string }) => {
  const key = `settings.storage-${folder.name}`;
  const translated = t(key as any);
  return translated === key ? folder.label : translated;
};

const refreshStorageInfo = async () => {
  try {
    await buildHistoryStore.refreshStorageInfo();
  } catch (error) {
    console.error("Failed to refresh storage info:", error);
  }
};

const cleaningPackages = ref(false);

const cleanPackagesCache = () => {
  confirm.require({
    message: t(
      "settings.clean-packages-confirm-msg",
      "Are you sure you want to clean the package cache? The application will restart automatically to complete the operation.",
    ),
    header: t("settings.clean-packages-confirm-header", "Clean Package Cache"),
    icon: "pi pi-exclamation-triangle",
    rejectClass: "p-button-secondary p-button-outlined",
    acceptClass: "p-button-danger",
    accept: async () => {
      cleaningPackages.value = true;
      try {
        const result = await api.execute("system:packages:cleanup");
        if (result.type === "success") {
          toast.add({
            severity: "success",
            summary: t("base.success", "Success"),
            detail: t(
              "settings.packages-cleaned-restarting",
              "Package cache cleared. Relaunching the application...",
            ),
            life: 2000,
          });
          setTimeout(async () => {
            await shell.relaunch();
            cleaningPackages.value = false;
          }, 1500);
        } else {
          toast.add({
            severity: "error",
            summary: t("base.error", "Error"),
            detail: result.ipcError || "Failed to clear package cache.",
            life: 3000,
          });
          cleaningPackages.value = false;
        }
      } catch (e: any) {
        toast.add({
          severity: "error",
          summary: t("base.error", "Error"),
          detail: e.message || "Failed to clear package cache.",
          life: 3000,
        });
        cleaningPackages.value = false;
      }
    },
    reject: () => {
      // do nothing
    },
  });
};

const canRestartTour = computed(() => isReady.value && Boolean(settingsRef.value));

const restartTour = async () => {
  if (!canRestartTour.value || !settingsRef.value) return;
  const tours = { ...settingsRef.value.tours };
  tours.dashboard = { step: 0, completed: false };
  try {
    await appSettings.updateSettings({
      ...(toRaw(settingsRef.value) as any),
      tours,
    });
    toast.add({
      severity: "success",
      summary: t("base.success", "Success"),
      detail: t("settings.tour-reset-success"),
      life: 3000,
    });
  } catch (error) {
    toast.add({
      severity: "error",
      summary: t("base.error", "Error"),
      detail: error instanceof Error ? error.message : "Unable to restart the dashboard guide.",
      life: 3000,
    });
  }
};

const toast = useToast();

// [DISABLED] Versions tab hidden in bundled mode — one bundle, one version.
// Connection/update status already live in the sidebar. Re-enable: uncomment.
// (App/UI versions resolve real values, no pseudo-versions: window.version via
// preload --app-version, UI_VERSION define-injected from npm_package_version.)
// const appVersion = ref(window.version || "1.0.0");
// const agentVersion = ref("...");
// const uiVersion = process.env.UI_VERSION || "1.0.0";
// const electronVersion = window.pipelab?.versions?.electron || "N/A";
// const isElectron = !!window.electron;

// const formatVersion = (version: string) => {
//   if (!version || version === "N/A" || version === "..." || version === "Unknown") {
//     return version;
//   }
//   return version.startsWith("v") ? version : `v${version}`;
// };

// const updateVersions = async () => {
//   if (websocketManager.isConnected()) {
//     try {
//       const response = await websocketManager.send("agent:version:get");
//       if (response.type === "success") {
//         agentVersion.value = response.result.version;
//       }
//     } catch (error) {
//       console.error("Failed to fetch agent version in Settings:", error);
//       agentVersion.value = "Unknown";
//     }
//   } else {
//     agentVersion.value = "...";
//   }
// };

// websocketManager.onStateChange((state) => {
//   if (state === "connected") {
//     updateVersions();
//   } else {
//     agentVersion.value = "...";
//   }
// });

// if (websocketManager.isConnected()) {
//   updateVersions();
// }

const copyToClipboard = (text: string) => {
  navigator.clipboard.writeText(text);
  toast.add({
    severity: "success",
    summary: "Copied",
    detail: `Version ${text} copied to clipboard`,
    life: 2000,
  });
};

// Obsidian refactoring additions

const logout = async () => {
  await authStore.logout();
};
</script>

<style lang="scss" scoped>
.settings-loading {
  padding: 2rem;
}

.settings-container {
  display: flex;
  width: 100%;
  height: 65vh;
  border-radius: 12px;
  background: var(--surface-card);
  border: 1px solid var(--surface-border);
  overflow: hidden;
}

.settings-sidebar {
  width: 250px;
  min-width: 250px;
  background: var(--surface-section);
  border-right: 1px solid var(--surface-border);
  display: flex;
  flex-direction: column;
  padding: 1rem 0.6rem;
  overflow-y: auto;
  gap: 0.85rem;

  /* Custom scrollbar for sidebar */
  &::-webkit-scrollbar {
    width: 6px;
  }
  &::-webkit-scrollbar-track {
    background: transparent;
  }
  &::-webkit-scrollbar-thumb {
    background: var(--surface-border);
    border-radius: 3px;
  }
}

.sidebar-group {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.sidebar-group-header {
  font-size: 0.72rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--text-color-secondary);
  opacity: 0.6;
  padding: 0 0.5rem 0.35rem 0.5rem;
}

.sidebar-item {
  display: flex;
  align-items: center;
  width: 100%;
  padding: 0.4rem 0.6rem;
  border: 0;
  border-radius: 8px;
  background: transparent;
  font-weight: 500;
  font-size: 0.85rem;
  font-family: inherit;
  color: var(--text-color-secondary);
  text-align: left;
  cursor: pointer;
  transition: all 0.2s ease;
  user-select: none;
  white-space: nowrap;

  i {
    font-size: 1rem;
    opacity: 0.85;
    transition: transform 0.2s ease;
  }

  &:hover:not(.active) {
    background: var(--surface-hover);
    color: var(--text-color);
  }

  &.active {
    background: var(--primary-color);
    color: var(--primary-color-text);
    font-weight: 600;
  }
}

.settings-preference-error {
  margin: 0.5rem 0;
  color: var(--p-red-500, #ef4444);
  font-size: 0.8rem;
}

.settings-content {
  flex: 1;
  padding: 1rem 1.5rem;
  overflow-y: auto;
  background: var(--surface-card);

  /* Custom scrollbar for content */
  &::-webkit-scrollbar {
    width: 8px;
  }
  &::-webkit-scrollbar-track {
    background: transparent;
  }
  &::-webkit-scrollbar-thumb {
    background: var(--surface-border);
    border-radius: 4px;
  }
}

.settings-panel {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

/* Clear, subtle delimitations in groups */
.settings-group {
  display: flex;
  flex-direction: column;
  border: 1px solid var(--surface-border);
  border-radius: 8px;
  background: var(--surface-card);
  overflow: hidden;
}

.setting-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.65rem 0.85rem;
  background: transparent;
  border: none;
  border-bottom: 1px solid var(--surface-border);
  border-radius: 0;
  transition: all 0.2s ease;

  &:last-child {
    border-bottom: none;
  }

  &:hover {
    background: var(--surface-hover);
  }
}

.setting-item {
  .setting-content {
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
    flex: 1;
    padding-right: 2rem;
  }

  .setting-title {
    font-size: 0.92rem;
    font-weight: 600;
    color: var(--text-color);
    cursor: default;
    margin: 0;
  }

  .setting-description {
    font-size: 0.8rem;
    color: var(--text-color-secondary);
    line-height: 1.4;
    opacity: 0.85;
  }

  .setting-action {
    display: flex;
    align-items: center;
    flex-shrink: 0;
  }
}

/* Billing Layout */
.billing-container {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.storage-card {
  background: var(--surface-card);
  border: 1px solid var(--surface-border);
  border-radius: 12px;
  padding: 1rem;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.02);

  .card-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
  }

  .card-header-left {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
  }

  .card-header-title {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
    font-size: 0.9rem;
    font-weight: 700;
    letter-spacing: -0.01em;
    color: var(--text-color);

    i {
      font-size: 14px;
      line-height: 1;
      color: var(--primary-color);
    }

    span {
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
  }

  .card-header-icon-btn {
    width: 28px;
    height: 28px;
    padding: 0;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 8px;
    flex-shrink: 0;

    i {
      font-size: 12px;
      line-height: 1;
    }
  }

  .card-header-right {
    font-size: 0.75rem;
    font-weight: 700;
    color: var(--text-color-secondary);
    opacity: 0.8;
    white-space: nowrap;
  }

  .usage-bar-container {
    background: #cbd5e1;
    height: 12px;
    border-radius: 100px;
    position: relative;
    padding: 0;
    overflow: hidden;
    border: 1px solid rgba(0, 0, 0, 0.05);
  }

  .usage-bar {
    display: flex;
    height: 100%;
    width: 100%;
    gap: 0;
  }

  .usage-segment {
    height: 100%;
    transition: width 0.6s cubic-bezier(0.34, 1.56, 0.64, 1);
    border-right: 2px solid #cbd5e1;
  }

  .pipelab-segment {
    background: linear-gradient(135deg, #a855f7 0%, #8b5cf6 100%);
    min-width: 8px;
  }

  .other-segment {
    background: #3b82f6;
  }

  .detail-item {
    padding: 0.55rem 0.75rem;
    background: var(--surface-card);
    border-radius: 12px;
    border: 1px solid var(--surface-border);
    transition: all 0.2s ease;
    cursor: default;

    &:hover {
      border-color: var(--surface-border);
      background: var(--surface-hover);
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
    font-size: 0.95rem;
    font-weight: 700;
  }

  .dot {
    width: 9px;
    height: 9px;
    border-radius: 3px;
    flex-shrink: 0;
    position: relative;
    top: 0.5px;
  }

  .sandbox-breakdown-container {
    padding-top: 0.85rem;
    border-top: 1px solid var(--surface-border);
  }

  .pipelab-dot {
    background: linear-gradient(135deg, #8b5cf6 0%, #6366f1 100%);
  }
  .other-dot {
    background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
  }
  .free-dot {
    background: #cbd5e1;
  }
}

.section-header {
  margin-bottom: 1rem;
  padding-bottom: 0.6rem;
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

.dot-container {
  display: flex;
  align-items: center;
  gap: 8px;
}
</style>
