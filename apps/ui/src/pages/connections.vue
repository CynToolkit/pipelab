<template>
  <div class="connections-page">
    <Toast />
    <Layout>
      <div class="main-layout">
        <!-- Sidebar Drawer (Lists active connections) -->
        <div class="drawer">
          <div
            class="drawer-header flex justify-between items-center px-3 py-2 border-b border-surface-200 dark:border-surface-800"
          >
            <span class="drawer-title font-bold text-xs uppercase tracking-wider opacity-75"
              >Connections</span
            >
            <Button
              icon="pi pi-plus"
              severity="secondary"
              text
              rounded
              size="small"
              class="!w-7 !h-7 !flex !items-center !justify-center !p-0 scale-90"
              v-tooltip.top="'Add New Connection'"
              @click="openAddConnectionDialog"
            />
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

          <div class="plugin-list px-2 py-1 flex flex-column gap-1 overflow-y-auto flex-grow-1">
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
              v-if="filteredConnections.length === 0"
              class="text-center py-6 text-[11px] opacity-50"
            >
              No active connections.
            </div>
          </div>
        </div>

        <!-- Main Content Area -->
        <div class="content-area">
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
                      Settings for {{ selectedConnectionIntegration?.name || "connection" }} on
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
                    @click="saveConnectionEdits"
                  />
                </div>
              </div>
            </div>

            <!-- Fallback View -->
            <div
              v-else
              class="pane-content flex items-center justify-center text-center opacity-60"
            >
              <div>
                <i class="pi pi-user text-3xl mb-3"></i>
                <p class="text-sm">
                  Select a connection from the sidebar or click '+' to configure a new profile.
                </p>
              </div>
            </div>
          </transition>
        </div>
      </div>
    </Layout>

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

        <!-- Render dynamic fields if defined by the plugin -->
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

        <!-- Fallback if integrations is not defined on the plugin (e.g. for Google or generic) -->
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
            label="Connect & Save"
            size="small"
            :loading="connectingAccountLoader"
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
          Select a plugin below to configure a new connection profile.
        </p>

        <!-- Search bar for new connections -->
        <div class="search-wrap mb-2">
          <IconField class="w-full">
            <InputIcon class="pi pi-search text-xs" />
            <InputText
              v-model="addSearchQuery"
              placeholder="Search plugins & integrations..."
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
            No active plugins or integrations match your search.
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
import { ref, computed, onMounted, toRaw, watch } from "vue";
import { useAppSettings } from "@renderer/store/settings";
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
import Layout from "@renderer/components/Layout.vue";

interface ConnectedAccount {
  id: string;
  pluginName: string;
  name: string;
  email?: string;
  apiKey?: string;
  path?: string;
  gameId?: string;
  createdAt: string;
  isDefault: boolean;
  [key: string]: any;
}

// Store & Composables
const appSettings = useAppSettings();
const connectionsStore = useConnectionsStore();
const appStore = useAppStore();
const api = useAPI();
const toast = useToast();

const { settings: settingsRef } = storeToRefs(appSettings);
const { connections: connectionsRef } = storeToRefs(connectionsStore);
const { pluginDefinitions } = storeToRefs(appStore);

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

// Edit Form State
const editConnectionName = ref("");
const editConnectionEmail = ref("");
const editConnectionKey = ref("");
const editConnectionPath = ref("");
const editConnectionGameId = ref("");
const editDynamicFields = ref<Record<string, string>>({});

// --- Computed ---
const allInstalledPlugins = computed(() => {
  return settingsRef.value?.plugins || [];
});

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
    pluginDefinitions.value.find((p) => p.packageName === pluginName || p.id === pluginName) || null
  );
});

const selectedConnectPluginDefinition = computed(() => {
  if (!selectedConnectPluginName.value) return null;
  return (
    pluginDefinitions.value.find(
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

const availableConnectionTargets = computed(() => {
  const list: {
    pluginName: string;
    integrationName: string;
    displayName: string;
    icon: any;
    fields: any[];
  }[] = [];

  for (const plugin of allInstalledPlugins.value) {
    const def = pluginDefinitions.value.find(
      (p) => p.packageName === plugin.name || p.id === plugin.name,
    );
    if (def?.integrations && def.integrations.length > 0) {
      for (const integration of def.integrations) {
        list.push({
          pluginName: plugin.name,
          integrationName: integration.name,
          displayName:
            def.integrations.length > 1
              ? `${formatPluginName(plugin.name)} - ${integration.name}`
              : formatPluginName(plugin.name),
          icon: def.icon,
          fields: integration.fields,
        });
      }
    } else if (pluginSupportsAccounts(plugin.name)) {
      list.push({
        pluginName: plugin.name,
        integrationName: "Account",
        displayName: formatPluginName(plugin.name),
        icon: getPluginIcon(plugin.name),
        fields: [],
      });
    }
  }
  return list;
});

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
        let val = "";
        if (field.key === "username" || field.key === "email") val = conn.email || "";
        else if (field.key === "apiKey" || field.key === "token" || field.key === "key")
          val = conn.apiKey || "";
        else if (field.key === "path" || field.key === "sdk") val = conn.path || "";
        else if (field.key === "gameId") val = conn.gameId || "";

        editDynamicFields.value[field.key] = val;
      }
    }
  },
  { immediate: true, deep: true },
);

// --- Helpers ---
const formatPluginName = (name: string) => {
  const def = pluginDefinitions.value.find((p) => p.packageName === name || p.id === name);
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
  const def = pluginDefinitions.value.find((p) => {
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
  const def = pluginDefinitions.value.find((p) => {
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
    /^(a\s+)?pipelab\s+plugin\s+(for|to|specifically\s+for|designed\s+to|designed\s+for)\s+/i,
    "",
  );
  clean = clean.replace(/^pipelab\s+plugin\s+/i, "");
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

const pluginSupportsAccounts = (pluginName: string) => {
  const def = pluginDefinitions.value.find(
    (p) => p.packageName === pluginName || p.id === pluginName,
  );
  if (def?.integrations && def.integrations.length > 0) {
    return true;
  }
  const pluginsWithAccounts = [
    "@pipelab/plugin-google",
    "@pipelab/plugin-discord",
    "@pipelab/plugin-steam",
    "@pipelab/plugin-itch",
    "@pipelab/plugin-netlify",
    "@pipelab/plugin-poki",
    "@pipelab/plugin-construct",
  ];
  return pluginsWithAccounts.some((p) => {
    const cleanP = p.replace("@pipelab/plugin-", "").replace("plugin-", "");
    const cleanPluginName = pluginName.replace("@pipelab/plugin-", "").replace("plugin-", "");
    return cleanP === cleanPluginName;
  });
};

// --- Storage Persistence ---
const saveConnections = async (list: ConnectedAccount[]) => {
  await connectionsStore.updateConnections({
    version: "1.0.0",
    connections: list,
  });
};

const disconnectAccount = async (accountId: string) => {
  const target = connectedAccounts.value.find((a) => a.id === accountId);
  if (!target) return;

  const updated = connectedAccounts.value.filter((a) => a.id !== accountId);

  await saveConnections(updated);

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

  const target = selectedConnectTarget.value;
  if (target?.fields) {
    for (const field of target.fields) {
      dynamicFields.value[field.key] = "";
    }
  }

  isConnectDialogVisible.value = true;
};

const saveNewAccount = async () => {
  if (!newConnectionName.value.trim()) {
    toast.add({
      severity: "error",
      summary: "Validation Error",
      detail: "Please provide a connection name.",
      life: 3000,
    });
    return;
  }

  connectingAccountLoader.value = true;

  try {
    const pluginName = selectedConnectPluginName.value;
    const target = selectedConnectTarget.value;

    let email = "";
    let apiKey = "";
    let path = "";
    let gameId = "";

    if (target?.fields) {
      for (const field of target.fields) {
        const val = dynamicFields.value[field.key] || "";
        if (field.key === "username" || field.key === "email") email = val;
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
      id: newId,
      pluginName,
      name: newConnectionName.value,
      email: email || undefined,
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

const saveConnectionEdits = async () => {
  if (!selectedConnection.value) return;

  const updated = connectedAccounts.value.map((conn) => {
    if (conn.id === selectedConnectionId.value) {
      const copy = { ...conn, name: editConnectionName.value };

      const integration = selectedConnectionIntegration.value;
      if (integration?.fields) {
        copy.email = undefined;
        copy.apiKey = undefined;
        copy.path = undefined;
        copy.gameId = undefined;
        for (const field of integration.fields) {
          const val = editDynamicFields.value[field.key] || "";
          if (field.key === "username" || field.key === "email") copy.email = val;
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

  await saveConnections(updated);
  toast.add({
    severity: "success",
    summary: "Connection Saved",
    detail: "Successfully updated connection settings!",
    life: 2500,
  });
};

onMounted(() => {
  if (connectedAccounts.value.length > 0) {
    selectedConnectionId.value = connectedAccounts.value[0].id;
  }
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

/* ─── Drawer ────────────────────────────────────────────── */
.drawer {
  width: 240px;
  flex: 0 0 240px;
  border-right: 1px solid var(--p-surface-200);
  background: var(--p-surface-0);
  display: flex;
  flex-direction: column;

  :root.dark & {
    border-right-color: var(--p-surface-700);
    background: var(--p-surface-950);
  }

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
    padding: 6px 10px;
    border-radius: 8px;
    font-size: 0.825rem;
    font-weight: 500;
    color: var(--p-text-muted-color);
    cursor: pointer;
    transition: all 0.15s ease;
    user-select: none;

    &:hover {
      background: var(--p-surface-200);
      color: var(--p-text-color);

      :root.dark & {
        background: var(--p-surface-800);
      }
    }

    &.active {
      background: var(--p-surface-200);
      color: var(--p-text-color);
      font-weight: 600;

      :root.dark & {
        background: var(--p-surface-800);
      }
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

.pane-content {
  padding: 16px;
  display: flex;
  flex-direction: column;
  height: 100%;
}

.pane-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 16px;
  gap: 12px;
  flex-shrink: 0;

  .pane-title {
    font-size: 1.05rem;
    font-weight: 700;
    letter-spacing: -0.02em;
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
  width: 40px;
  height: 40px;
  border-radius: 8px;
  background: var(--p-surface-100);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;

  :root.dark & {
    background: var(--p-surface-800);
  }

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
  background: var(--p-surface-0);
  border: 1px solid var(--p-surface-200);
  border-radius: 12px;
  padding: 20px;

  :root.dark & {
    background: var(--p-surface-900);
    border-color: var(--p-surface-800);
  }
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
  background: var(--p-surface-0);
  border: 1px solid var(--p-surface-200);
  border-radius: 8px;
  padding: 12px 14px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  cursor: pointer;
  transition: all 0.12s ease;

  :root.dark & {
    background: var(--p-surface-900);
    border-color: var(--p-surface-800);
  }

  &:hover {
    background: var(--p-surface-50);
    border-color: var(--p-surface-300);

    :root.dark & {
      background: var(--p-surface-850);
      border-color: var(--p-surface-700);
    }
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
  width: 32px;
  height: 32px;
  border-radius: 6px;
  background: var(--p-surface-50);
  border: 1px solid var(--p-surface-100);
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
