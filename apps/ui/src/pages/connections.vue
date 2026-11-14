<template>
  <div class="connections-page">
    <Toast />
    <div class="main-layout">
      <!-- Sidebar Drawer (Lists active connections) -->
      <div class="drawer">
        <div class="drawer-header">
          <h1 class="drawer-header-left">
            <i class="mdi mdi-link-variant mr-2"></i>
            Connections
          </h1>
          <div class="drawer-header-actions">
            <Button
              text
              size="small"
              class="drawer-header-icon-btn"
              :disabled="!connectionDataReady || !agent.isReady.value"
              aria-label="Add connection"
              v-tooltip.top="'Add New Connection'"
              @click="openAddConnectionDialog"
            >
              <i class="icon mdi mdi-plus fs-16"></i>
            </Button>
          </div>
        </div>

        <!-- Search Filter for Connections -->
        <div class="search-wrap px-3 py-2">
          <IconField class="w-full">
            <InputIcon class="pi pi-search text-xs" />
            <InputText
              v-model="searchQuery"
              placeholder="Filter connections..."
              class="w-full"
              size="small"
            />
          </IconField>
        </div>

        <div
          class="plugin-list px-2 py-1 flex flex-column gap-1 overflow-y-auto flex-grow-1"
          :aria-busy="
            !connectionDataReady &&
            !connectionLoadError &&
            !connectionsStore.error &&
            appStore.providerStatus !== 'error' &&
            agent.isReady.value
          "
        >
          <div
            v-for="account in filteredConnections"
            :key="account.id"
            class="plugin-item"
            :class="{ active: selectedConnectionId === account.id }"
            @click="selectedConnectionId = account.id"
          >
            <div class="plugin-item-content">
              <template v-if="getPluginIcon(account.pluginName)">
                <img
                  v-if="getPluginIcon(account.pluginName)?.type === 'image'"
                  :src="getPluginIconImage(account.pluginName)"
                  class="plugin-icon"
                />
                <i
                  v-else
                  :class="getIconClass(getPluginIcon(account.pluginName))"
                  class="plugin-icon-pi"
                ></i>
              </template>
              <i v-else class="pi pi-user plugin-icon-pi"></i>
              <span class="plugin-label">{{ account.name }}</span>
            </div>
            <span class="status-dot enabled"></span>
          </div>

          <div
            v-if="!connectionDataReady"
            class="text-center py-6 text-[11px] opacity-50"
            role="status"
          >
            {{
              !agent.isReady.value
                ? "Connections are unavailable while the agent is disconnected."
                : connectionLoadError ||
                  connectionsStore.error ||
                  appStore.providerError ||
                  "Loading connections…"
            }}
            <Button
              v-if="
                connectionLoadError ||
                connectionsStore.status === 'error' ||
                appStore.providerStatus === 'error'
              "
              label="Retry"
              text
              size="small"
              @click="loadConnectionData"
            />
          </div>
          <div v-else-if="filteredConnections.length === 0" class="empty-list">
            {{ searchQuery ? "No connections match your filter." : "No active connections." }}
          </div>
        </div>
      </div>

      <!-- Main Content Area -->
      <main class="content-area">
        <transition name="fade-fast" mode="out-in">
          <!-- Selected Connection Detail View -->
          <div v-if="selectedConnection" class="pane-content">
            <div class="pane-header flex justify-between items-start">
              <div class="flex items-center gap-3">
                <div class="plugin-large-icon-wrapper">
                  <template v-if="getPluginIcon(selectedConnection.pluginName)">
                    <img
                      v-if="getPluginIcon(selectedConnection.pluginName)?.type === 'image'"
                      :src="getPluginIconImage(selectedConnection.pluginName)"
                      class="plugin-large-icon"
                    />
                    <i
                      v-else
                      :class="getIconClass(getPluginIcon(selectedConnection.pluginName))"
                      class="plugin-large-icon-pi"
                    ></i>
                  </template>
                  <i v-else class="pi pi-user plugin-large-icon-pi"></i>
                </div>
                <div>
                  <h2 class="pane-title">{{ selectedConnection.name }}</h2>
                  <p class="pane-desc">
                    Settings for
                    {{ selectedConnectionIntegration?.name || "connection" }} on
                    {{ formatPluginName(selectedConnection.pluginName) }}
                  </p>
                </div>
              </div>

              <div class="flex items-center gap-3">
                <Button
                  label="Delete Connection"
                  severity="danger"
                  outlined
                  size="small"
                  icon="pi pi-trash"
                  @click="disconnectAccount(selectedConnection.id)"
                />
              </div>
            </div>

            <!-- Connection Edit Form -->
            <div class="connection-edit-form flex flex-column gap-4 max-w-[500px] mt-4">
              <div class="flex flex-column gap-1.5">
                <label for="edit-conn-name" class="text-xs font-bold opacity-75"
                  >Connection Name</label
                >
                <InputText
                  id="edit-conn-name"
                  v-model="editConnectionName"
                  size="small"
                  class="w-full"
                />
              </div>

              <!-- Dynamic inputs for connection properties -->
              <template v-if="selectedConnectionIntegration?.fields?.length">
                <div
                  v-for="field in selectedConnectionIntegration.fields"
                  :key="field.key"
                  class="flex flex-column gap-1.5"
                >
                  <label
                    :for="`edit-conn-field-${field.key}`"
                    class="text-xs font-bold opacity-75"
                    >{{ field.label }}</label
                  >

                  <!-- File input -->
                  <div v-if="field.type === 'file'" class="flex gap-2">
                    <InputText
                      :id="`edit-conn-field-${field.key}`"
                      v-model="editDynamicFields[field.key]"
                      :placeholder="field.placeholder"
                      size="small"
                      class="flex-grow-1"
                    />
                    <Button
                      icon="pi pi-folder-open"
                      severity="secondary"
                      outlined
                      size="small"
                      v-tooltip.top="`Browse File`"
                      @click="browseForEditFieldFile(field.key, field.label)"
                    />
                  </div>

                  <!-- Directory input -->
                  <div v-else-if="field.type === 'directory'" class="flex gap-2">
                    <InputText
                      :id="`edit-conn-field-${field.key}`"
                      v-model="editDynamicFields[field.key]"
                      :placeholder="field.placeholder"
                      size="small"
                      class="flex-grow-1"
                    />
                    <Button
                      icon="pi pi-folder-open"
                      severity="secondary"
                      outlined
                      size="small"
                      v-tooltip.top="`Browse Directory`"
                      @click="browseForEditFieldDirectory(field.key, field.label)"
                    />
                  </div>

                  <!-- Password input -->
                  <InputText
                    v-else-if="field.type === 'password'"
                    :id="`edit-conn-field-${field.key}`"
                    v-model="editDynamicFields[field.key]"
                    type="password"
                    :placeholder="field.placeholder"
                    size="small"
                    class="w-full"
                  />

                  <!-- Standard text input -->
                  <InputText
                    v-else
                    :id="`edit-conn-field-${field.key}`"
                    v-model="editDynamicFields[field.key]"
                    :placeholder="field.placeholder"
                    size="small"
                    class="w-full"
                  />
                </div>
              </template>

              <!-- Fallback standard fields if schema not explicitly declared -->
              <template v-else>
                <div class="flex flex-column gap-1.5">
                  <label for="edit-conn-email" class="text-xs font-bold opacity-75"
                    >Email / Identifier</label
                  >
                  <InputText
                    id="edit-conn-email"
                    v-model="editConnectionEmail"
                    size="small"
                    class="w-full"
                  />
                </div>
                <div class="flex flex-column gap-1.5">
                  <label for="edit-conn-key" class="text-xs font-bold opacity-75"
                    >API Key / Token</label
                  >
                  <InputText
                    id="edit-conn-key"
                    v-model="editConnectionKey"
                    type="password"
                    placeholder="••••••••••••••••"
                    size="small"
                    class="w-full"
                  />
                </div>
              </template>

              <div class="flex gap-2 mt-2">
                <Button
                  label="Save Changes"
                  icon="pi pi-check"
                  size="small"
                  class="px-4"
                  :loading="editTesting"
                  :disabled="!connectionDataReady || !agent.isReady.value || editTesting"
                  @click="saveConnectionEdits"
                />
                <Button
                  v-if="editTestable"
                  label="Test connection"
                  severity="secondary"
                  outlined
                  size="small"
                  :loading="editTesting"
                  :disabled="!connectionDataReady || !agent.isReady.value || editTesting"
                  @click="runEditTest"
                />
              </div>
              <p
                v-if="editTestResult"
                class="connection-test-result"
                :class="`connection-test-${editTestResult.status}`"
                role="status"
              >
                {{ connectionTestMessage(editTestResult) }}
              </p>
            </div>
          </div>

          <!-- Fallback View -->
          <div v-else class="empty-pane">
            <i class="mdi mdi-link-variant empty-pane-icon" aria-hidden="true"></i>
            <h2>
              {{ connectedAccounts.length ? "Select a connection" : "No connections yet" }}
            </h2>
            <p>
              {{
                connectedAccounts.length
                  ? "Pick a connection from the list to review or edit its profile."
                  : "Connect an account so workflows can publish builds to your destinations."
              }}
            </p>
            <Button
              label="Add connection"
              icon="mdi mdi-plus"
              size="small"
              :disabled="!connectionDataReady || !agent.isReady.value"
              @click="openAddConnectionDialog"
            />
          </div>
        </transition>
      </main>
    </div>

    <!-- Connect Account Dialog -->
    <Dialog
      v-model:visible="isConnectDialogVisible"
      modal
      :header="
        selectedConnectTarget ? `Connect ${selectedConnectTarget.displayName}` : 'Connect Profile'
      "
      :style="{ width: '400px' }"
    >
      <div class="flex flex-column gap-3 py-2">
        <!-- Connection Name (Common to all) -->
        <div class="flex flex-column gap-1">
          <label for="conn-name" class="text-xs font-bold opacity-70">Connection Name</label>
          <InputText
            id="conn-name"
            v-model="newConnectionName"
            placeholder="e.g., Work Account, Personal"
            size="small"
            class="w-full"
          />
        </div>

        <!-- Render dynamic fields if defined by the provider -->
        <template v-if="selectedConnectTarget?.fields?.length">
          <div
            v-for="field in selectedConnectTarget.fields"
            :key="field.key"
            class="flex flex-column gap-1"
          >
            <label :for="`conn-field-${field.key}`" class="text-xs font-bold opacity-70">{{
              field.label
            }}</label>

            <!-- File browser input -->
            <div v-if="field.type === 'file'" class="flex gap-2">
              <InputText
                :id="`conn-field-${field.key}`"
                v-model="dynamicFields[field.key]"
                :placeholder="field.placeholder"
                size="small"
                class="flex-grow-1"
              />
              <Button
                icon="pi pi-folder-open"
                severity="secondary"
                outlined
                size="small"
                v-tooltip.top="`Browse File`"
                @click="browseForFieldFile(field.key, field.label)"
              />
            </div>

            <!-- Directory browser input -->
            <div v-else-if="field.type === 'directory'" class="flex gap-2">
              <InputText
                :id="`conn-field-${field.key}`"
                v-model="dynamicFields[field.key]"
                :placeholder="field.placeholder"
                size="small"
                class="flex-grow-1"
              />
              <Button
                icon="pi pi-folder-open"
                severity="secondary"
                outlined
                size="small"
                v-tooltip.top="`Browse Directory`"
                @click="browseForFieldDirectory(field.key, field.label)"
              />
            </div>

            <!-- Password input -->
            <InputText
              v-else-if="field.type === 'password'"
              :id="`conn-field-${field.key}`"
              v-model="dynamicFields[field.key]"
              type="password"
              :placeholder="field.placeholder"
              size="small"
              class="w-full"
            />

            <!-- Standard text input -->
            <InputText
              v-else
              :id="`conn-field-${field.key}`"
              v-model="dynamicFields[field.key]"
              :placeholder="field.placeholder"
              size="small"
              class="w-full"
            />
          </div>
        </template>

        <!-- Fallback if integrations is not defined on the provider (e.g. for Google or generic) -->
        <template v-else>
          <div class="flex flex-column gap-1">
            <label for="conn-email" class="text-xs font-bold opacity-70"
              >Email Address / Identifier</label
            >
            <InputText
              id="conn-email"
              v-model="newConnectionEmail"
              placeholder="e.g., mail@example.com"
              size="small"
              class="w-full"
            />
          </div>
          <div class="flex flex-column gap-1">
            <label for="conn-key" class="text-xs font-bold opacity-70"
              >API Key / Token (Optional)</label
            >
            <InputText
              id="conn-key"
              v-model="newConnectionKey"
              type="password"
              placeholder="••••••••••••••••"
              size="small"
              class="w-full"
            />
          </div>
        </template>
      </div>

      <p
        v-if="addTestResult"
        class="connection-test-result"
        :class="`connection-test-${addTestResult.status}`"
        role="status"
      >
        {{ connectionTestMessage(addTestResult) }}
      </p>

      <template #footer>
        <div class="flex justify-end gap-2 mt-2">
          <Button
            label="Cancel"
            severity="secondary"
            outlined
            size="small"
            @click="cancelConnectDialog"
          />
          <Button
            v-if="addTestable"
            label="Test connection"
            severity="secondary"
            outlined
            size="small"
            :loading="addTesting"
            :disabled="!connectionDataReady || !agent.isReady.value || addTesting"
            @click="runAddTest"
          />
          <Button
            label="Connect & Save"
            size="small"
            :loading="connectingAccountLoader || addTesting"
            :disabled="!connectionDataReady || !agent.isReady.value || addTesting"
            @click="saveNewAccount"
          />
        </div>
      </template>
    </Dialog>

    <!-- Add New Connection Dialog -->
    <Dialog
      v-model:visible="isAddConnectionVisible"
      modal
      header="Add New Connection"
      :style="{ width: '450px', maxWidth: '90vw' }"
    >
      <div class="flex flex-column gap-3 py-2">
        <p class="text-xs text-secondary mb-1">
          Select an integration to configure a new connection profile.
        </p>

        <!-- Search bar for new connections -->
        <div class="search-wrap mb-2">
          <IconField class="w-full">
            <InputIcon class="pi pi-search text-xs" />
            <InputText
              v-model="addSearchQuery"
              placeholder="Search integrations..."
              class="w-full"
              size="small"
            />
          </IconField>
        </div>

        <div class="integrations-selection-list">
          <div
            v-for="target in filteredConnectionTargets"
            :key="target.displayName"
            class="integration-selection-row"
            @click="selectTargetToConnect(target)"
          >
            <div class="flex items-center gap-3 min-w-0 flex-grow-1">
              <div class="plugin-icon-wrapper">
                <template v-if="getPluginIcon(target.pluginName)">
                  <img
                    v-if="getPluginIcon(target.pluginName)?.type === 'image'"
                    :src="getPluginIconImage(target.pluginName)"
                    class="plugin-row-icon"
                  />
                  <i
                    v-else
                    :class="getIconClass(getPluginIcon(target.pluginName))"
                    class="text-sm text-primary"
                  ></i>
                </template>
                <i v-else class="pi pi-box text-primary text-sm"></i>
              </div>
              <div class="flex flex-column gap-0.5 min-w-0">
                <span class="plugin-row-title">{{ target.displayName }}</span>
                <span class="plugin-row-desc">
                  {{
                    cleanPluginDescription(getPluginDescription(target.pluginName)) ||
                    "Configure connection profile"
                  }}
                </span>
              </div>
            </div>
            <i class="pi pi-chevron-right plugin-row-chevron"></i>
          </div>

          <div
            v-if="filteredConnectionTargets.length === 0"
            class="text-center py-8 text-xs opacity-50 border border-dashed rounded-lg"
          >
            No integrations match your search.
          </div>
        </div>
      </div>
      <template #footer>
        <Button
          label="Cancel"
          size="small"
          severity="secondary"
          @click="isAddConnectionVisible = false"
        />
      </template>
    </Dialog>
  </div>
</template>

<script lang="ts" setup>
import { useRoute, useRouter } from "vue-router";
import { useRouteReadiness } from "@renderer/composables/useRouteReadiness";
import { buildIntegrationTargets } from "./integration-targets";
import { ref, computed, toRaw, watch } from "vue";
import { useConnectionsStore } from "@renderer/store/connections";
import { useAppStore } from "@renderer/store/app";
import { storeToRefs } from "pinia";
import Button from "primevue/button";
import InputText from "primevue/inputtext";
import ToggleSwitch from "primevue/toggleswitch";
import Toast from "primevue/toast";
import Dialog from "primevue/dialog";
import IconField from "primevue/iconfield";
import InputIcon from "primevue/inputicon";
import { useToast } from "primevue/usetoast";
import { useAPI } from "@renderer/composables/api";
import { useAgentAvailability } from "@renderer/composables/useAgentAvailability";
import {
  connectionIntegrationFieldValue,
  serializeConnectionIntegrationValues,
} from "../utils/connection-field-values";
import {
  connectionTestFingerprint,
  connectionTestMessage,
  currentConnectionTest,
  decideConnectionSave,
  type TestedConnection,
} from "../utils/connection-test";
import type { PreflightResult } from "@pipelab/shared";

interface ConnectedAccount {
  id: string;
  pluginName: string;
  integrationName?: string;
  name: string;
  email?: string;
  password?: string;
  apiKey?: string;
  path?: string;
  gameId?: string;
  createdAt: string;
  isDefault: boolean;
  [key: string]: any;
}

// Store & Composables
const connectionsStore = useConnectionsStore();
const appStore = useAppStore();
const api = useAPI();
const toast = useToast();
const agent = useAgentAvailability();

const { connections: connectionsRef } = storeToRefs(connectionsStore);
const { providerDefinitions } = storeToRefs(appStore);
const connectionDataReady = computed(
  () => connectionsStore.status === "ready" && appStore.providerStatus === "ready",
);

// State
const selectedConnectionId = ref("");
const searchQuery = ref("");
const addSearchQuery = ref("");
const isAddConnectionVisible = ref(false);
const isConnectDialogVisible = ref(false);
const selectedConnectPluginName = ref("");
const selectedConnectTarget = ref<any | null>(null);

// Add Form State
const newConnectionName = ref("");
const newConnectionEmail = ref("");
const newConnectionKey = ref("");
const newConnectionPath = ref("");
const newConnectionGameId = ref("");
const dynamicFields = ref<Record<string, string>>({});
const connectingAccountLoader = ref(false);
const connectionLoadError = ref("");
useRouteReadiness(
  computed(
    () =>
      !agent.isReady.value ||
      connectionDataReady.value ||
      !!connectionLoadError.value ||
      !!connectionsStore.error ||
      appStore.providerStatus === "error",
  ),
);
let connectionLoadGeneration = 0;

// Edit Form State
const editConnectionName = ref("");
const editConnectionEmail = ref("");
const editConnectionKey = ref("");
const editConnectionPath = ref("");
const editConnectionGameId = ref("");
const editDynamicFields = ref<Record<string, string>>({});

// Connection test state: a result only applies to the exact values it was run for.
const editTested = ref<TestedConnection>();
const editTesting = ref(false);
const addTested = ref<TestedConnection>();
const addTesting = ref(false);

const runConnectionTest = async (
  pluginName: string,
  values: Record<string, string>,
): Promise<PreflightResult> => {
  try {
    const response = await api.execute("connection:test", { pluginName, values });
    if (response.type === "error")
      return { status: "unverifiable", reason: "The connection could not be tested." };
    return response.result;
  } catch {
    return { status: "unverifiable", reason: "The connection could not be tested." };
  }
};

// --- Computed ---
const editTestable = computed(() => selectedConnectionIntegration.value?.testable === true);
const editTestFingerprint = computed(() =>
  connectionTestFingerprint(selectedConnection.value?.pluginName ?? "", editDynamicFields.value),
);
const editTestResult = computed(() =>
  currentConnectionTest(editTestFingerprint.value, editTested.value),
);
const addTestable = computed(() => selectedConnectTarget.value?.testable === true);
const addTestFingerprint = computed(() =>
  connectionTestFingerprint(selectedConnectPluginName.value, dynamicFields.value),
);
const addTestResult = computed(() =>
  currentConnectionTest(addTestFingerprint.value, addTested.value),
);

const connectedAccounts = computed((): readonly ConnectedAccount[] => {
  return connectionsRef.value?.connections || [];
});

const selectedConnection = computed(() => {
  if (!selectedConnectionId.value) return null;
  return connectedAccounts.value.find((acc) => acc.id === selectedConnectionId.value) || null;
});

const selectedConnectionPluginDefinition = computed(() => {
  if (!selectedConnection.value) return null;
  const pluginName = selectedConnection.value.pluginName;
  return (
    providerDefinitions.value.find((p) => p.packageName === pluginName || p.id === pluginName) ||
    null
  );
});

const selectedConnectPluginDefinition = computed(() => {
  if (!selectedConnectPluginName.value) return null;
  return (
    providerDefinitions.value.find(
      (p) =>
        p.packageName === selectedConnectPluginName.value ||
        p.id === selectedConnectPluginName.value,
    ) || null
  );
});

const filteredConnections = computed(() => {
  const query = searchQuery.value.trim().toLowerCase();
  if (!query) return connectedAccounts.value;
  return connectedAccounts.value.filter((acc) => {
    return (
      acc.name.toLowerCase().includes(query) ||
      formatPluginName(acc.pluginName).toLowerCase().includes(query)
    );
  });
});

const availableConnectionTargets = computed(() =>
  buildIntegrationTargets(providerDefinitions.value),
);

const filteredConnectionTargets = computed(() => {
  const query = addSearchQuery.value.trim().toLowerCase();
  if (!query) return availableConnectionTargets.value;
  return availableConnectionTargets.value.filter((target) => {
    const desc = getPluginDescription(target.pluginName);
    return (
      target.displayName.toLowerCase().includes(query) ||
      target.pluginName.toLowerCase().includes(query) ||
      desc.toLowerCase().includes(query)
    );
  });
});

const selectedConnectionIntegration = computed(() => {
  const conn = selectedConnection.value;
  const def = selectedConnectionPluginDefinition.value;
  if (!conn || !def?.integrations || def.integrations.length === 0) return null;

  if (conn.integrationName) {
    const named = def.integrations.find((integration) => integration.name === conn.integrationName);
    if (named) return named;
  }
  if (def.integrations.length === 1) return def.integrations[0];

  // Find the integration that matches the saved connection fields best
  let bestMatch = def.integrations[0];
  let maxScore = -1;

  for (const integration of def.integrations) {
    let score = 0;
    for (const field of integration.fields) {
      let hasVal = false;
      if (field.key === "username" || field.key === "email") hasVal = !!conn.email;
      else if (field.key === "apiKey" || field.key === "token" || field.key === "key")
        hasVal = !!conn.apiKey;
      else if (field.key === "path" || field.key === "sdk") hasVal = !!conn.path;
      else if (field.key === "gameId") hasVal = !!conn.gameId;

      if (hasVal) score += 1;
    }
    if (score > maxScore) {
      maxScore = score;
      bestMatch = integration;
    }
  }
  return bestMatch;
});

// --- Watches ---
watch(
  [selectedConnection, selectedConnectionIntegration],
  ([conn, integration]) => {
    if (!conn) return;
    editConnectionName.value = conn.name;
    editConnectionEmail.value = conn.email || "";
    editConnectionKey.value = conn.apiKey || "";
    editConnectionPath.value = conn.path || "";
    editConnectionGameId.value = conn.gameId || "";

    editDynamicFields.value = {};
    if (integration && integration.fields) {
      for (const field of integration.fields) {
        editDynamicFields.value[field.key] = connectionIntegrationFieldValue(conn, field.key);
      }
    }
  },
  { immediate: true, deep: true },
);

// --- Helpers ---
const formatPluginName = (name: string) => {
  const def = providerDefinitions.value.find((p) => p.packageName === name || p.id === name);
  if (def?.name) {
    return def.name;
  }
  if (name.startsWith("@pipelab/plugin-")) {
    const raw = name.replace("@pipelab/plugin-", "");
    return raw.charAt(0).toUpperCase() + raw.slice(1);
  }
  if (name.startsWith("plugin-")) {
    const raw = name.replace("plugin-", "");
    return raw.charAt(0).toUpperCase() + raw.slice(1);
  }
  return name;
};

const getPluginIcon = (packageName: string) => {
  const cleanSearched = packageName
    .replace("@pipelab/plugin-", "")
    .replace("plugin-", "")
    .toLowerCase();
  const def = providerDefinitions.value.find((p) => {
    if (!p.packageName) return false;
    const cleanDef = p.packageName
      .replace("@pipelab/plugin-", "")
      .replace("plugin-", "")
      .toLowerCase();
    return cleanDef === cleanSearched || p.packageName === packageName || p.id === packageName;
  });
  return def?.icon || null;
};

const getPluginDescription = (packageName: string) => {
  const cleanSearched = packageName
    .replace("@pipelab/plugin-", "")
    .replace("plugin-", "")
    .toLowerCase();
  const def = providerDefinitions.value.find((p) => {
    if (!p.packageName) return false;
    const cleanDef = p.packageName
      .replace("@pipelab/plugin-", "")
      .replace("plugin-", "")
      .toLowerCase();
    return cleanDef === cleanSearched || p.packageName === packageName || p.id === packageName;
  });
  return def?.description || "";
};

const cleanPluginDescription = (desc: string) => {
  if (!desc) return "";
  let clean = desc.trim();
  clean = clean.replace(
    /^(a\s+)?pipelab\s+provider\s+(for|to|specifically\s+for|designed\s+to|designed\s+for)\s+/i,
    "",
  );
  clean = clean.replace(/^pipelab\s+provider\s+/i, "");
  if (clean.length > 0) {
    clean = clean.charAt(0).toUpperCase() + clean.slice(1);
  }
  return clean;
};

const getPluginIconImage = (packageName: string) => {
  const icon = getPluginIcon(packageName);
  return icon?.type === "image" ? icon.image : undefined;
};

const getIconClass = (iconObj: any) => {
  if (!iconObj || !iconObj.icon) return "";
  const iconName = iconObj.icon;
  if (iconName.startsWith("mdi-")) {
    return `mdi ${iconName}`;
  }
  if (iconName.startsWith("pi-")) {
    return `pi ${iconName}`;
  }
  return iconName;
};

// --- Storage Persistence ---
const saveConnections = async (
  list: ConnectedAccount[],
  workflowBindings = connectionsRef.value?.workflowBindings,
) => {
  if (!agent.isReady.value || !connectionDataReady.value) return;
  await connectionsStore.updateConnections({
    version: "1.0.0",
    connections: list,
    workflowBindings,
  });
};

const disconnectAccount = async (accountId: string) => {
  const target = connectedAccounts.value.find((a) => a.id === accountId);
  if (!target) return;

  const updated = connectedAccounts.value.filter((a) => a.id !== accountId);
  const workflowBindings = connectionsRef.value?.workflowBindings?.filter(
    (binding) => binding.connectionId !== accountId,
  );

  try {
    await saveConnections(updated, workflowBindings);
  } catch (err) {
    toast.add({
      severity: "error",
      summary: "Connection Delete Failed",
      detail: err instanceof Error ? err.message : "Unable to save connections.",
      life: 5000,
    });
    return;
  }

  if (selectedConnectionId.value === accountId) {
    if (updated.length > 0) {
      selectedConnectionId.value = updated[0].id;
    } else {
      selectedConnectionId.value = "";
    }
  }

  toast.add({
    severity: "success",
    summary: "Connection Deleted",
    detail: `Successfully deleted "${target.name}".`,
    life: 2500,
  });
};

// --- Dialog Pickers ---
const browseForFieldFile = async (key: string, label: string) => {
  const paths = await api.execute("dialog:showOpenDialog", {
    title: `Select ${label}`,
    properties: ["openFile"],
  });
  if (paths.type === "success" && !paths.result.canceled && paths.result.filePaths.length > 0) {
    dynamicFields.value[key] = paths.result.filePaths[0];
  }
};

const browseForFieldDirectory = async (key: string, label: string) => {
  const paths = await api.execute("dialog:showOpenDialog", {
    title: `Select ${label}`,
    properties: ["openDirectory"],
  });
  if (paths.type === "success" && !paths.result.canceled && paths.result.filePaths.length > 0) {
    dynamicFields.value[key] = paths.result.filePaths[0];
  }
};

const browseForEditFieldFile = async (key: string, label: string) => {
  const paths = await api.execute("dialog:showOpenDialog", {
    title: `Select ${label}`,
    properties: ["openFile"],
  });
  if (paths.type === "success" && !paths.result.canceled && paths.result.filePaths.length > 0) {
    editDynamicFields.value[key] = paths.result.filePaths[0];
  }
};

const browseForEditFieldDirectory = async (key: string, label: string) => {
  const paths = await api.execute("dialog:showOpenDialog", {
    title: `Select ${label}`,
    properties: ["openDirectory"],
  });
  if (paths.type === "success" && !paths.result.canceled && paths.result.filePaths.length > 0) {
    editDynamicFields.value[key] = paths.result.filePaths[0];
  }
};

const selectTargetToConnect = (target: any) => {
  isAddConnectionVisible.value = false;
  selectedConnectTarget.value = target;
  selectedConnectPluginName.value = target.pluginName;
  openConnectDialog();
};

const cancelConnectDialog = () => {
  isConnectDialogVisible.value = false;
  isAddConnectionVisible.value = true;
};

const openAddConnectionDialog = () => {
  addSearchQuery.value = "";
  isAddConnectionVisible.value = true;
};

const openConnectDialog = () => {
  newConnectionName.value = "";
  newConnectionEmail.value = "";
  newConnectionKey.value = "";
  newConnectionPath.value = "";
  newConnectionGameId.value = "";
  dynamicFields.value = {};
  addTested.value = undefined;

  const target = selectedConnectTarget.value;
  if (target?.fields) {
    for (const field of target.fields) {
      dynamicFields.value[field.key] = "";
    }
  }

  isConnectDialogVisible.value = true;
};

const saveNewAccount = async () => {
  if (!connectionDataReady.value || !agent.isReady.value) return;
  if (!newConnectionName.value.trim()) {
    toast.add({
      severity: "error",
      summary: "Validation Error",
      detail: "Please provide a connection name.",
      life: 3000,
    });
    return;
  }

  if (addTesting.value) return;
  const addDecision = decideConnectionSave({
    testable: addTestable.value,
    fingerprint: addTestFingerprint.value,
    tested: addTested.value,
  });
  if (addDecision.action === "test") {
    await runAddTest();
    if (
      decideConnectionSave({
        testable: addTestable.value,
        fingerprint: addTestFingerprint.value,
        tested: addTested.value,
      }).action !== "save"
    )
      return;
  } else if (addDecision.action === "block") return;

  connectingAccountLoader.value = true;

  try {
    const pluginName = selectedConnectPluginName.value;
    const target = selectedConnectTarget.value;

    let email = "";
    let apiKey = "";
    let password = "";
    let path = "";
    let gameId = "";

    if (target?.fields) {
      for (const field of target.fields) {
        const val = dynamicFields.value[field.key] || "";
        if (field.key === "username" || field.key === "email") email = val;
        else if (field.key === "password") password = val;
        else if (field.key === "apiKey" || field.key === "token" || field.key === "key")
          apiKey = val;
        else if (field.key === "path" || field.key === "sdk") path = val;
        else if (field.key === "gameId") gameId = val;
      }
    } else {
      email = newConnectionEmail.value;
      apiKey = newConnectionKey.value;
    }

    const newId = Math.random().toString(36).substring(2, 9);

    const newAcc: ConnectedAccount = {
      ...(target?.fields
        ? serializeConnectionIntegrationValues(target.fields, dynamicFields.value)
        : {}),
      id: newId,
      pluginName,
      integrationName: target?.integrationName,
      name: newConnectionName.value,
      email: email || undefined,
      password: password || undefined,
      apiKey: apiKey || undefined,
      path: path || undefined,
      gameId: gameId || undefined,
      createdAt: new Date().toISOString(),
      isDefault: false,
    };

    const list = [...connectedAccounts.value, newAcc];
    await saveConnections(list);

    selectedConnectionId.value = newId;

    toast.add({
      severity: "success",
      summary: "Connection Added",
      detail: `Successfully connected "${newAcc.name}".`,
      life: 3000,
    });

    isConnectDialogVisible.value = false;
  } catch (err: any) {
    toast.add({
      severity: "error",
      summary: "Failed to Save Connection",
      detail: err.message || "An unexpected error occurred.",
      life: 5000,
    });
  } finally {
    connectingAccountLoader.value = false;
  }
};

const runEditTest = async () => {
  if (editTesting.value || !selectedConnection.value) return;
  const fingerprint = editTestFingerprint.value;
  const pluginName = selectedConnection.value.pluginName;
  editTesting.value = true;
  try {
    const result = await runConnectionTest(pluginName, { ...editDynamicFields.value });
    editTested.value = { fingerprint, result };
  } finally {
    editTesting.value = false;
  }
};

const runAddTest = async () => {
  if (addTesting.value) return;
  const fingerprint = addTestFingerprint.value;
  addTesting.value = true;
  try {
    const result = await runConnectionTest(selectedConnectPluginName.value, {
      ...dynamicFields.value,
    });
    addTested.value = { fingerprint, result };
  } finally {
    addTesting.value = false;
  }
};

const saveConnectionEdits = async () => {
  if (!connectionDataReady.value || !agent.isReady.value) return;
  if (!selectedConnection.value || editTesting.value) return;

  const decision = decideConnectionSave({
    testable: editTestable.value,
    fingerprint: editTestFingerprint.value,
    tested: editTested.value,
  });
  if (decision.action === "test") {
    await runEditTest();
    // Stale if the selection changed while testing.
    const afterTest = decideConnectionSave({
      testable: editTestable.value,
      fingerprint: editTestFingerprint.value,
      tested: editTested.value,
    });
    if (afterTest.action !== "save") return;
  } else if (decision.action === "block") return;

  const updated = connectedAccounts.value.map((conn) => {
    if (conn.id === selectedConnectionId.value) {
      const integration = selectedConnectionIntegration.value;
      const copy: ConnectedAccount = {
        ...conn,
        name: editConnectionName.value,
        integrationName: integration?.name,
      };
      if (integration?.fields) {
        copy.email = undefined;
        copy.password = undefined;
        copy.apiKey = undefined;
        copy.path = undefined;
        copy.gameId = undefined;
        for (const field of integration.fields) {
          const val = editDynamicFields.value[field.key] || "";
          copy[field.key] = val;
          if (field.key === "username" || field.key === "email") copy.email = val;
          else if (field.key === "password") copy.password = val;
          else if (field.key === "apiKey" || field.key === "token" || field.key === "key")
            copy.apiKey = val;
          else if (field.key === "path" || field.key === "sdk") copy.path = val;
          else if (field.key === "gameId") copy.gameId = val;
        }
      } else {
        copy.email = editConnectionEmail.value;
        copy.apiKey = editConnectionKey.value;
      }
      return copy;
    }
    return conn;
  });

  try {
    await saveConnections(updated);
  } catch (err) {
    toast.add({
      severity: "error",
      summary: "Connection Save Failed",
      detail: err instanceof Error ? err.message : "Unable to save connections.",
      life: 5000,
    });
    return;
  }
  toast.add({
    severity: "success",
    summary: "Connection Saved",
    detail: "Successfully updated connection settings!",
    life: 2500,
  });
};

const loadConnectionData = async () => {
  if (!agent.isReady.value) return;
  const generation = ++connectionLoadGeneration;
  connectionLoadError.value = "";
  const results = await Promise.allSettled([
    connectionsStore.init(),
    appStore.loadProviderDefinitions(),
  ]);
  const failed = results.find((result) => result.status === "rejected");
  if (generation !== connectionLoadGeneration || !agent.isReady.value) return;
  if (failed?.status === "rejected")
    connectionLoadError.value =
      failed.reason instanceof Error ? failed.reason.message : String(failed.reason);
  else if (connectionsStore.status === "error" || appStore.providerStatus === "error")
    connectionLoadError.value =
      connectionsStore.error || appStore.providerError || "Unable to load connection data.";
};
watch(
  agent.isReady,
  (ready) => {
    if (ready) void loadConnectionData();
    else {
      connectionLoadGeneration++;
      connectionLoadError.value = "";
    }
  },
  { immediate: true },
);
const route = useRoute();
const router = useRouter();
// /connections/:connectionId (for example from a failed run's Fix button) opens that connection.
watch(
  [() => connectionsStore.status, connectedAccounts, () => route.params.connectionId],
  ([status, accounts]) => {
    if (status !== "ready") return;
    const requested =
      typeof route.params.connectionId === "string" ? route.params.connectionId : "";
    if (requested && accounts.some((account) => account.id === requested)) {
      if (selectedConnectionId.value !== requested) selectedConnectionId.value = requested;
      return;
    }
    if (!selectedConnectionId.value && accounts.length) selectedConnectionId.value = accounts[0].id;
  },
  { immediate: true },
);
// Keep the address on the selected connection so it can be shared and reloaded.
watch(selectedConnectionId, (id) => {
  if (id && route.name === "Connections" && route.params.connectionId !== id)
    void router.replace({ name: "Connections", params: { connectionId: id } });
});
</script>

<style lang="scss" scoped>
.connections-page {
  width: 100%;
  height: 100%;
  overflow: hidden;
}

.main-layout {
  display: flex;
  height: 100%;
  width: 100%;
}

.drawer-header {
  padding: 12px 12px 6px;
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
}

.drawer-header-left {
  margin: 0;
  font-size: 0.8rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--p-text-muted-color);
  display: flex;
  align-items: center;
}

.drawer-header-actions {
  display: flex;
  gap: 4px;
}

.drawer-header-icon-btn {
  width: 28px;
  height: 28px;
  padding: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
}

/* ─── Drawer ────────────────────────────────────────────── */
.drawer {
  width: 256px;
  flex: 0 0 256px;
  border-right: 1px solid var(--pl-border);
  background: var(--pl-sunken);
  display: flex;
  flex-direction: column;

  .plugin-list {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 6px 12px;
    overflow-y: auto;
  }

  .plugin-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px 10px;
    border-radius: var(--pl-radius-sm);
    font-size: 0.84rem;
    font-weight: 500;
    color: var(--p-text-muted-color);
    cursor: pointer;
    transition: all 0.15s ease;
    user-select: none;

    &:hover {
      background: var(--pl-hover);
      color: var(--p-text-color);
    }

    &.active {
      background: var(--pl-card);
      color: var(--p-text-color);
      font-weight: 600;
      box-shadow:
        0 0 0 1px var(--pl-border),
        var(--pl-shadow-xs);
    }

    .plugin-item-content {
      display: flex;
      align-items: center;
      gap: 10px;
      min-width: 0;
      flex: 1;
    }

    .plugin-icon {
      width: 18px;
      height: 18px;
      object-fit: contain;
      flex-shrink: 0;
    }

    .plugin-icon-pi {
      font-size: 16px;
      color: var(--p-primary-color);
      flex-shrink: 0;
      width: 18px;
      text-align: center;
    }

    .plugin-label {
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      font-size: 0.8rem;
    }
  }
}

/* ─── Main Content Pane ─────────────────────────────────── */
.content-area {
  flex: 1;
  height: 100%;
  overflow-y: auto;
  background: var(--p-surface-0);

  :root.dark & {
    background: var(--p-surface-900);
  }
}

.empty-pane {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  height: 100%;
  min-height: 320px;
  padding: 24px;
  text-align: center;
}

.empty-pane h2 {
  margin: 0;
  font-size: 1.1rem;
  font-weight: 600;
}

.empty-pane p {
  max-width: 340px;
  margin: 0 0 8px;
  color: var(--p-text-muted-color);
  font-size: 0.875rem;
  line-height: 1.5;
}

.empty-pane-icon {
  display: grid;
  place-items: center;
  width: 56px;
  height: 56px;
  border-radius: 14px;
  background: var(--p-surface-100);
  color: var(--p-text-muted-color);
  font-size: 1.6rem;

  :root.dark & {
    background: var(--p-surface-800);
  }
}

.empty-list {
  padding: 32px 12px;
  color: var(--p-text-muted-color);
  font-size: 0.8rem;
  text-align: center;
}

.pane-content {
  box-sizing: border-box;
  width: 100%;
  max-width: 760px;
  margin: 0 auto;
  padding: 32px clamp(16px, 3vw, 40px);
  display: flex;
  flex-direction: column;
  height: 100%;
}

.pane-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 20px;
  gap: 12px;
  flex-shrink: 0;

  .pane-title {
    font-size: 1.2rem;
    font-weight: 650;
    letter-spacing: -0.025em;
    color: var(--p-text-color);
    margin: 0;
  }

  .pane-desc {
    font-size: 0.8rem;
    font-weight: 500;
    color: var(--p-text-muted-color);
    margin: 0;
  }
}

.plugin-large-icon-wrapper {
  width: 44px;
  height: 44px;
  border: 1px solid var(--pl-border);
  border-radius: 12px;
  background: linear-gradient(
    145deg,
    var(--pl-card),
    color-mix(in srgb, var(--p-text-color) 5%, var(--pl-card))
  );
  box-shadow: var(--pl-shadow-xs);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;

  .plugin-large-icon {
    width: 24px;
    height: 24px;
    object-fit: contain;
  }

  .plugin-large-icon-pi {
    font-size: 20px;
    color: var(--p-primary-color);
  }
}

.connection-test-result {
  margin: 0;
  font-size: 0.8rem;
  &.connection-test-verified {
    color: var(--p-green-500, #22c55e);
  }
  &.connection-test-failed {
    color: var(--p-red-500, #ef4444);
  }
  &.connection-test-unverifiable {
    color: var(--p-amber-500, #f59e0b);
  }
}

.status-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--p-surface-400);

  &.enabled {
    background: var(--p-green-500);
  }
}

.connection-edit-form {
  background: var(--pl-card);
  border: 1px solid var(--pl-border);
  border-radius: var(--pl-radius);
  box-shadow: var(--pl-shadow-xs);
  padding: 24px;
}

.integrations-selection-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
  max-height: 360px;
  overflow-y: auto;
  padding-right: 4px;
}

.integration-selection-row {
  background: var(--pl-card);
  border: 1px solid var(--pl-border);
  border-radius: 12px;
  padding: 12px 14px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  cursor: pointer;
  transition: all 0.12s ease;

  &:hover {
    background: var(--pl-sunken);
    border-color: var(--pl-border-strong);
  }

  &:active {
    background: var(--p-surface-100);
    transform: scale(0.995);

    :root.dark & {
      background: var(--p-surface-800);
    }
  }
}

.plugin-icon-wrapper {
  width: 36px;
  height: 36px;
  border-radius: 10px;
  background: var(--pl-card);
  border: 1px solid var(--pl-border);
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;

  :root.dark & {
    background: var(--p-surface-950);
    border-color: var(--p-surface-800);
  }
}

.plugin-row-icon {
  width: 22px;
  height: 22px;
  object-fit: contain;
}

.plugin-row-title {
  font-size: 0.775rem;
  font-weight: 600;
  color: var(--p-text-color);
}

.plugin-row-desc {
  font-size: 0.675rem;
  color: var(--p-text-muted-color);
  line-height: 1.35;
  font-weight: 400;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.plugin-row-chevron {
  font-size: 0.7rem;
  color: var(--p-text-muted-color);
  opacity: 0.55;
  transition:
    transform 0.15s ease,
    color 0.15s ease;
  flex-shrink: 0;
  margin-left: auto;
  padding-left: 8px;
}

.integration-selection-row:hover .plugin-row-chevron {
  transform: translateX(2px);
  color: var(--p-primary-color);
  opacity: 0.95;
}
</style>
