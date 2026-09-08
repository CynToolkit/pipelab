<template>
  <div class="plugins-page">
    <Toast />
    <Layout>
      <div class="main-layout">
        <!-- Sidebar Drawer (Lists installed plugins) -->
        <div class="drawer">
          <div class="drawer-header">
            <div class="drawer-header-left">
              <i class="mdi mdi-puzzle-outline mr-2"></i>
              Plugins
            </div>
            <div class="drawer-header-actions">
              <!-- Marketplace button hidden: plugin marketplace disabled in bundled mode -->
            </div>
          </div>

          <!-- Search Filter for Plugins -->
          <div class="search-wrap px-3 py-2">
            <IconField class="w-full">
              <InputIcon class="pi pi-search text-xs" />
              <InputText
                v-model="installedSearchQuery"
                placeholder="Filter plugins..."
                class="w-full"
                size="small"
              />
            </IconField>
          </div>

          <div class="plugin-list px-2 py-1 flex-grow-1 overflow-y-auto flex flex-column gap-1">
            <div
              v-for="plugin in filteredInstalledPlugins"
              :key="plugin.name"
              class="plugin-item"
              :class="{ active: selectedPluginName === plugin.name }"
              @click="selectedPluginName = plugin.name"
            >
              <div class="plugin-item-content">
                <template v-if="getPluginIcon(plugin.name)">
                  <img
                    v-if="getPluginIcon(plugin.name)?.type === 'image'"
                    :src="getPluginIconImage(plugin.name)"
                    class="plugin-icon"
                  />
                  <i
                    v-else
                    :class="getIconClass(getPluginIcon(plugin.name))"
                    class="plugin-icon-pi"
                  ></i>
                </template>
                <i v-else class="pi pi-box plugin-icon-pi"></i>
                <div class="flex flex-column gap-0.5 min-w-0">
                  <span class="plugin-label">{{ formatPluginName(plugin.name) }}</span>
                  <!-- Plugin version hidden in bundled mode — all plugins share the bundled release.
                       Re-enable: uncomment the span below. -->
                  <!-- <span
                    v-if="getPluginVersion(plugin.name)"
                    class="text-[9px] opacity-50 font-mono leading-none"
                    >v{{ getPluginVersion(plugin.name) }}</span
                  > -->
                </div>
              </div>
              <span class="status-dot" :class="{ enabled: plugin.enabled }"></span>
            </div>

            <div
              v-if="filteredInstalledPlugins.length === 0"
              class="text-center py-6 text-[11px] opacity-50"
            >
              No plugins matching filter.
            </div>
          </div>
        </div>

        <!-- Main Content Area -->
        <div class="content-area">
          <transition name="fade-fast" mode="out-in">
            <!-- Selected Plugin Detail View -->
            <div v-if="selectedPlugin" class="pane-content">
              <div class="pane-header flex justify-between items-start">
                <div class="flex items-center gap-3">
                  <div class="plugin-large-icon-wrapper">
                    <template v-if="getPluginIcon(selectedPlugin.name)">
                      <img
                        v-if="getPluginIcon(selectedPlugin.name)?.type === 'image'"
                        :src="getPluginIconImage(selectedPlugin.name)"
                        class="plugin-large-icon"
                      />
                      <i
                        v-else
                        :class="getIconClass(getPluginIcon(selectedPlugin.name))"
                        class="plugin-large-icon-pi"
                      ></i>
                    </template>
                    <i v-else class="pi pi-box plugin-large-icon-pi"></i>
                  </div>
                  <div>
                    <div class="flex items-center gap-2">
                      <h2 class="pane-title">{{ formatPluginName(selectedPlugin.name) }}</h2>
                      <!-- Plugin version hidden in bundled mode — all plugins share the bundled release.
                           Re-enable: uncomment the Tag below. -->
                      <!-- <Tag
                        v-if="selectedPluginDefinition?.version"
                        severity="secondary"
                        :value="'v' + selectedPluginDefinition.version"
                        class="text-[9px] font-mono py-0.5 px-1.5"
                      /> -->
                    </div>
                    <p class="pane-desc">
                      {{ selectedPlugin.description || "No description provided." }}
                    </p>
                  </div>
                </div>

                <div class="flex items-center gap-3">
                  <div
                    class="flex items-center gap-2 bg-surface-50 dark:bg-surface-950 border border-surface-200 dark:border-surface-800 rounded-lg px-2.5 py-1"
                  >
                    <span
                      class="text-[10px] font-bold uppercase tracking-wider text-muted-color opacity-75"
                      >Status</span
                    >
                    <ToggleSwitch
                      :model-value="selectedPlugin.enabled"
                      class="small-toggle"
                      @update:model-value="togglePlugin(selectedPlugin.name)"
                    />
                  </div>
                  <!-- Uninstall button hidden: plugin marketplace disabled in bundled mode. -->
                  </div>
                </div>

              <!-- Tabs: Blocks & Setup (Read-only) -->
              <Tabs v-model:value="activeTab" class="w-full flex-grow-1 flex flex-column mt-4">
                <TabList>
                  <Tab v-if="selectedPluginDefinition?.nodes?.length" value="blocks">
                    <i class="pi pi-box mr-2 text-[11px]"></i>Blocks
                  </Tab>
                  <Tab v-if="selectedPluginDefinition?.integrations?.length" value="schema">
                    <i class="pi pi-id-card mr-2 text-[11px]"></i>Setup
                  </Tab>
                </TabList>

                <TabPanels class="flex-grow-1 overflow-y-auto mt-2">
                  <!-- Blocks Panel -->
                  <TabPanel
                    v-if="selectedPluginDefinition?.nodes?.length"
                    value="blocks"
                    class="py-2"
                  >
                    <div class="exposed-section">
                      <div class="section-header mb-4">
                        <div class="flex flex-column gap-1">
                          <h3 class="section-title">Blocks</h3>
                          <p class="section-desc">Automation blocks provided by this plugin.</p>
                        </div>
                      </div>

                      <div class="nodes-grid">
                        <div
                          v-for="nodeDef in selectedPluginDefinition.nodes"
                          :key="nodeDef.node.id"
                          class="node-card"
                          :class="{
                            deprecated: nodeDef.node.type === 'action' && nodeDef.node.deprecated,
                          }"
                        >
                          <div class="node-card-header flex items-start justify-between mb-2">
                            <div class="flex items-center gap-2">
                              <div class="node-icon-wrapper flex items-center justify-center">
                                <i
                                  :class="getNodeIconClass(nodeDef.node.icon)"
                                  class="node-icon"
                                ></i>
                              </div>
                              <div class="flex flex-column">
                                <span class="node-title font-bold text-xs">{{
                                  nodeDef.node.name
                                }}</span>
                                <!-- Node version hidden in bundled mode — all blocks share the bundled release.
                                     Re-enable: uncomment the span below. -->
                                <!-- <span
                                  v-if="nodeDef.node.version"
                                  class="node-version text-[9px] opacity-60"
                                  >v{{ nodeDef.node.version }}</span
                                > -->
                              </div>
                            </div>
                            <div class="flex gap-1">
                              <Tag
                                v-if="nodeDef.node.type === 'action' && nodeDef.node.deprecated"
                                value="Deprecated"
                                severity="danger"
                                class="text-[9px] px-1 py-0.5 font-bold"
                                v-tooltip.top="
                                  nodeDef.node.deprecatedMessage || 'This node is deprecated.'
                                "
                              />
                              <Tag
                                v-if="nodeDef.node.advanced"
                                value="Advanced"
                                severity="secondary"
                                class="text-[9px] px-1 py-0.5"
                              />
                              <Tag
                                :value="getNodeTypeLabel(nodeDef.node.type)"
                                :severity="getNodeTypeSeverity(nodeDef.node.type)"
                                class="text-[9px] px-1.5 py-0.5"
                              />
                            </div>
                          </div>
                          <p class="node-description text-[10px] text-secondary">
                            {{ nodeDef.node.description || "No description available." }}
                          </p>
                        </div>
                      </div>
                    </div>
                  </TabPanel>

                  <!-- Setup (Read-only) Panel -->
                  <TabPanel
                    v-if="selectedPluginDefinition?.integrations?.length"
                    value="schema"
                    class="py-2"
                  >
                    <div class="exposed-section">
                      <div class="section-header mb-4">
                        <div class="flex flex-column gap-1">
                          <h3 class="section-title">Setup</h3>
                          <p class="section-desc">
                            Settings required to configure connection profiles for this plugin.
                          </p>
                        </div>
                      </div>

                      <div class="plugins-grid">
                        <div
                          v-for="integration in selectedPluginDefinition.integrations"
                          :key="integration.name"
                          class="integration-card"
                        >
                          <div class="integration-card-header flex items-center gap-2 mb-3">
                            <i class="pi pi-id-card text-primary text-sm"></i>
                            <span class="integration-title font-bold text-xs">{{
                              integration.name
                            }}</span>
                          </div>
                          <div class="integration-fields">
                            <div
                              class="fields-header text-[9px] font-bold uppercase opacity-55 mb-1"
                            >
                              Required Fields
                            </div>
                            <div
                              v-for="field in integration.fields"
                              :key="field.key"
                              class="field-row flex justify-between items-center py-1 border-b border-surface-200 dark:border-surface-800 last:border-0"
                            >
                              <div class="flex flex-column">
                                <span class="field-label text-[10px] font-medium">{{
                                  field.label
                                }}</span>
                              </div>
                              <Tag
                                :value="field.type"
                                severity="secondary"
                                class="text-[8px] uppercase px-1 py-0.5"
                              />
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </TabPanel>
                </TabPanels>
              </Tabs>
            </div>

            <!-- Fallback View -->
            <div
              v-else
              class="pane-content flex items-center justify-center text-center opacity-60"
            >
              <div>
                <i class="pi pi-box text-3xl mb-3"></i>
                <p class="text-sm">Select a plugin from the sidebar to inspect or configure.</p>
              </div>
            </div>
          </transition>
        </div>
      </div>
    </Layout>

    <!-- Explore Marketplace Dialog -->
    <Dialog
      v-model:visible="isMarketplaceVisible"
      modal
      header="Explore Plugin Marketplace"
      :style="{ width: '600px', maxWidth: '90vw' }"
    >
      <!-- Marketplace dialog hidden: plugin marketplace is disabled in bundled mode. -->
      <div class="text-center py-8 opacity-50 text-xs">
        <i class="pi pi-lock mb-2 block text-lg"></i>
        Plugin marketplace is disabled in bundled mode.<br>
        All plugins are pre-bundled with the CLI.
      </div>
    </Dialog>
  </div>
</template>

<script lang="ts" setup>
import { ref, computed, toRaw, watch } from "vue";
import { useAppSettings } from "@renderer/store/settings";
import { useAppStore } from "@renderer/store/app";
import { storeToRefs } from "pinia";
import Button from "primevue/button";
import InputText from "primevue/inputtext";
import ToggleSwitch from "primevue/toggleswitch";
import Tag from "primevue/tag";
import Toast from "primevue/toast";
import Dialog from "primevue/dialog";
import IconField from "primevue/iconfield";
import InputIcon from "primevue/inputicon";
import Tabs from "primevue/tabs";
import TabList from "primevue/tablist";
import Tab from "primevue/tab";
import TabPanels from "primevue/tabpanels";
import TabPanel from "primevue/tabpanel";
import { useToast } from "primevue/usetoast";
import { useAPI } from "@renderer/composables/api";
import { watchDebounced } from "@vueuse/core";
import Layout from "@renderer/components/Layout.vue";

const appSettings = useAppSettings();
const appStore = useAppStore();
const api = useAPI();
const toast = useToast();

const { settings: settingsRef } = storeToRefs(appSettings);
const { pluginDefinitions } = storeToRefs(appStore);

const selectedPluginName = ref("");
const activeTab = ref("blocks");
const isMarketplaceVisible = ref(false);
const installedSearchQuery = ref("");
const registrySearchQuery = ref("");
const searchingRegistry = ref(false);
const registryResults = ref<any[]>([]);
const loadingPlugins = ref<Record<string, boolean>>({});

// --- Computed ---
const allInstalledPlugins = computed(() => {
  return settingsRef.value?.plugins || [];
});

const communityPlugins = computed(() => {
  return allInstalledPlugins.value.filter((p) => !isOfficial(p.name));
});

const filteredInstalledPlugins = computed(() => {
  const query = installedSearchQuery.value.trim().toLowerCase();
  if (!query) return allInstalledPlugins.value;
  return allInstalledPlugins.value.filter((p) => {
    return (
      p.name.toLowerCase().includes(query) || formatPluginName(p.name).toLowerCase().includes(query)
    );
  });
});

const selectedPlugin = computed(() => {
  if (!selectedPluginName.value) return null;
  return allInstalledPlugins.value.find((p) => p.name === selectedPluginName.value) || null;
});

const selectedPluginDefinition = computed(() => {
  const plugin = selectedPlugin.value;
  if (!plugin) return null;
  return (
    pluginDefinitions.value.find((p) => p.packageName === plugin.name || p.id === plugin.name) ||
    null
  );
});

// --- Watches ---
watch(
  () => selectedPlugin.value?.name,
  (newPluginName) => {
    if (!newPluginName) return;
    activeTab.value = "blocks";
  },
  { immediate: true },
);

// Registry search disabled in bundled mode — plugins are statically bundled with the CLI.
// (Previously used watchDebounced to call plugin:search.)

// --- Helpers ---
const isOfficial = (packageName: string) => {
  return packageName.startsWith("@pipelab/");
};

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

const getNodeIconClass = (icon: string | undefined) => {
  const iconName = icon || "pi-box";
  if (iconName.startsWith("mdi-")) {
    return `mdi ${iconName}`;
  }
  if (iconName.startsWith("pi-")) {
    return `pi ${iconName}`;
  }
  return `pi ${iconName}`;
};

const getNodeTypeLabel = (type: string) => {
  if (type === "action") return "Action";
  if (type === "expression") return "Expression";
  if (type === "event") return "Event";
  return type.charAt(0).toUpperCase() + type.slice(1);
};

const getNodeTypeSeverity = (type: string) => {
  if (type === "action") return "info";
  if (type === "expression") return "warn";
  if (type === "event") return "success";
  return "secondary";
};

const isInstalled = (packageName: string) => {
  return allInstalledPlugins.value.some((p) => p.name === packageName);
};

const togglePlugin = async (packageName: string) => {
  const currentPlugins = allInstalledPlugins.value.map((p) => {
    if (p.name === packageName) {
      return { ...p, enabled: !p.enabled };
    }
    return p;
  });
  await appSettings.updateSettings({
    ...(toRaw(settingsRef.value) as any),
    plugins: currentPlugins,
  });

  toast.add({
    severity: "success",
    summary: "Plugin updated",
    detail: `${formatPluginName(packageName)} is now ${
      currentPlugins.find((p) => p.name === packageName)?.enabled ? "enabled" : "disabled"
    }.`,
    life: 3000,
  });
};

// [DISABLED] Plugins are statically bundled — no install/uninstall needed.
// Re-enable: uncomment + restore the plugin:install API call.
// const installPlugin = async (packageName: string, description = "") => {
//   loadingPlugins.value[packageName] = true;
//   try {
//     toast.add({
//       severity: "info",
//       summary: "Installing plugin",
//       detail: `Downloading and installing ${packageName}...`,
//       life: 3000,
//     });

//     const res = await api.execute("plugin:install", {
//       packageName,
//       version: "latest",
//     });

//     if (res.type === "success") {
//       const currentPlugins = [...allInstalledPlugins.value];
//       if (!currentPlugins.some((p) => p.name === packageName)) {
//         currentPlugins.push({
//           name: packageName,
//           enabled: true,
//           description: description || "Community plugin",
//         });
//         await appSettings.updateSettings({
//           ...(toRaw(settingsRef.value) as any),
//           plugins: currentPlugins,
//         });
//       }

//       toast.add({
//         severity: "success",
//         summary: "Plugin installed",
//         detail: `${packageName} has been installed successfully!`,
//         life: 3000,
//       });
//     } else {
//       toast.add({
//         severity: "error",
//         summary: "Installation failed",
//         detail: res.ipcError || `Could not install ${packageName}`,
//         life: 5000,
//       });
//     }
//   } catch (err: any) {
//     console.error("Plugin installation failed:", err);
//     toast.add({
//       severity: "error",
//       summary: "Installation error",
//       detail: err.message || `Could not install ${packageName}`,
//       life: 5000,
//     });
//   } finally {
//     loadingPlugins.value[packageName] = false;
//   }
// };

// [DISABLED] Plugins are statically bundled — no install/uninstall needed.
// Re-enable: uncomment + restore the plugin:uninstall API call.
// const uninstallPlugin = async (packageName: string) => {
//   loadingPlugins.value[packageName] = true;
//   try {
//     toast.add({
//       severity: "info",
//       summary: "Uninstalling plugin",
//       detail: `Removing ${packageName}...`,
//       life: 3000,
//     });

//     const res = await api.execute("plugin:uninstall", {
//       packageName,
//     });

//     if (res.type === "success") {
//       const currentPlugins = allInstalledPlugins.value.filter((p) => p.name !== packageName);
//       await appSettings.updateSettings({
//         ...(toRaw(settingsRef.value) as any),
//         plugins: currentPlugins,
//       });

//       if (selectedPluginName.value === packageName) {
//         selectedPluginName.value = "";
//       }

//       toast.add({
//         severity: "success",
//         summary: "Plugin uninstalled",
//         detail: `${packageName} has been uninstalled!`,
//         life: 3000,
//       });
//     } else {
//       toast.add({
//         severity: "error",
//         summary: "Uninstall failed",
//         detail: res.ipcError || `Could not uninstall ${packageName}`,
//         life: 5000,
//       });
//     }
//   } catch (err: any) {
//     console.error("Plugin uninstallation failed:", err);
//     toast.add({
//       severity: "error",
//       summary: "Uninstall error",
//       detail: err.message || `Could not uninstall ${packageName}`,
//       life: 5000,
//     });
//   } finally {
//     loadingPlugins.value[packageName] = false;
//   }
// };
</script>

<style lang="scss" scoped>
.plugins-page {
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

/* ─── Tabs Layout Adjustments ───────────────────────────── */
:deep(.p-tabs) {
  border-style: none;
}

:deep(.p-tablist) {
  border-bottom: 1px solid var(--p-surface-200);
  background: transparent;

  :root.dark & {
    border-bottom-color: var(--p-surface-800);
  }
}

:deep(.p-tablist-content) {
  background: transparent !important;
}

:deep(.p-tablist-tab-list) {
  background: transparent !important;
  border-style: none !important;
}

:deep(.p-tab) {
  font-size: 0.775rem;
  font-weight: 600;
  color: var(--p-text-muted-color);
  padding: 8px 16px;
  background: transparent !important;
  border: none !important;
  border-bottom: 2px solid transparent !important;
  transition: all 0.2s ease;

  &:hover {
    color: var(--p-text-color);
    background: transparent !important;
  }

  &.p-tab-active {
    color: var(--p-primary-color) !important;
    border-bottom-color: var(--p-primary-color) !important;
  }
}

:deep(.p-tabpanels) {
  background: transparent !important;
  padding: 12px 0 0 0 !important;
}

:deep(.p-tabpanel) {
  background: transparent !important;
}

/* ─── Exposed Sections & Grid ───────────────────────────── */
.exposed-section {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.section-title {
  font-size: 0.95rem;
  font-weight: 700;
  color: var(--p-text-color);
  margin: 0;
}

.section-desc {
  font-size: 0.75rem;
  color: var(--p-text-muted-color);
  margin: 0;
}

.nodes-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 16px;
  width: 100%;
}

.node-card {
  background: var(--p-surface-50);
  border: 1px solid var(--p-surface-200);
  border-radius: 12px;
  padding: 16px;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  display: flex;
  flex-direction: column;
  height: 100%;

  :root.dark & {
    background: var(--p-surface-950);
    border-color: var(--p-surface-800);
  }

  &:hover {
    border-color: var(--p-surface-300);

    :root.dark & {
      border-color: var(--p-surface-700);
    }
  }
}

.node-card-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  width: 100%;
}

.node-icon-wrapper {
  width: 28px;
  height: 28px;
  border-radius: 8px;
  background: var(--p-primary-50);
  color: var(--p-primary-600);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;

  :root.dark & {
    background: var(--p-primary-950);
    color: var(--p-primary-400);
  }
}

.node-icon {
  font-size: 14px;
}

.node-title {
  font-size: 0.825rem;
  font-weight: 700;
  color: var(--p-text-color);
}

.node-version {
  font-size: 0.65rem;
  color: var(--p-text-muted-color);
}

.node-description {
  font-size: 0.75rem;
  color: var(--p-text-muted-color);
  margin-top: 10px;
  line-height: 1.4;
  flex-grow: 1;
}

/* ─── Integrations Schema Grid ──────────────────────────── */
.plugins-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 16px;
  width: 100%;
}

.integration-card {
  background: var(--p-surface-50);
  border: 1px solid var(--p-surface-200);
  border-radius: 12px;
  padding: 16px;
  display: flex;
  flex-direction: column;

  :root.dark & {
    background: var(--p-surface-950);
    border-color: var(--p-surface-800);
  }
}

.integration-card-header {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.85rem;
  font-weight: 700;
  color: var(--p-text-color);
}

.fields-header {
  font-size: 0.65rem;
  font-weight: 700;
  color: var(--p-text-muted-color);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.field-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 0;
  border-bottom: 1px solid var(--p-surface-200);

  :root.dark & {
    border-bottom-color: var(--p-surface-800);
  }

  &:last-child {
    border-bottom: none;
  }
}

.field-label {
  font-size: 0.775rem;
  font-weight: 600;
  color: var(--p-text-color);
}

.field-key {
  font-size: 0.65rem;
  color: var(--p-text-muted-color);
}

/* ─── Deprecated & Size Adjustments ─────────────────────── */
.small-toggle {
  transform: scale(0.65);
  transform-origin: right center;
  display: inline-flex;
}

.node-card.deprecated {
  border-left: 3.5px solid var(--p-red-500);
  opacity: 0.75;
  background: var(--p-surface-100);

  :root.dark & {
    background: var(--p-surface-950);
  }

  &:hover {
    opacity: 0.95;
    border-left-color: var(--p-red-600);
  }
}

/* ─── Mobile: drawer becomes top strip, grids single column ─ */
@media (max-width: 860px) {
  .main-layout {
    flex-direction: column;
  }

  .drawer {
    width: 100%;
    flex: 0 0 auto;
    border-right: none;
    border-bottom: 1px solid var(--p-surface-200);
    max-height: 38vh;

    :root.dark & {
      border-bottom-color: var(--p-surface-700);
    }
  }

  .pane-content {
    padding: 12px;
  }

  .pane-header {
    flex-direction: column;
    align-items: stretch;
  }

  .nodes-grid,
  .integrations-grid {
    grid-template-columns: 1fr;
  }
}
</style>
