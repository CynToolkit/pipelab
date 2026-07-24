<template>
  <div class="add-button-wrapper">
    <div class="vl"></div>
    <Button
      :disabled="isRunning"
      v-bind="buttonProps"
      class="add-btn"
      size="small"
      :pt="{
        root: { style: { fontSize: '10px', width: '24px', height: '24px' } },
        icon: { style: { fontSize: '10px' } },
      }"
      @click="addNode"
    ></Button>
    <!-- <pre>{{ path }}</pre> -->
    <div class="vl"></div>

    <Dialog
      v-model:visible="visible"
      :closable="false"
      modal
      header=""
      :style="{ width: '60%', maxWidth: '800px' }"
      :content-style="{ padding: '1rem' }"
      :breakpoints="{ '960px': '75vw', '641px': '90vw' }"
    >
      <template #header>
        <div class="flex flex-column w-full">
          <div class="text-xl">Add plugin</div>
          <div class="search w-full">
            <IconField class="search-field w-full" icon-position="left">
              <InputIcon class="pi pi-search"> </InputIcon>
              <InputText
                ref="$searchInput"
                v-model="search"
                placeholder="Search..."
                class="w-full"
              />
            </IconField>
          </div>
        </div>
      </template>

      <div class="list flex flex-column gap-3">
        <!-- Loader when searching registry -->
        <div
          v-if="searchingRegistry"
          class="flex justify-content-center align-items-center py-3 gap-2 border-bottom border-surface"
        >
          <i class="pi pi-spin pi-spinner text-primary"></i>
          <span class="text-sm text-secondary">Searching registry...</span>
        </div>

        <div
          v-for="plugin in displayPlugins"
          :key="plugin.id"
          class="plugin-item-wrapper border border-surface rounded-lg bg-card p-3"
        >
          <!-- Plugin Row Header -->
          <div
            class="plugin-header flex align-items-center justify-content-between cursor-pointer transition-all gap-3"
            @click="handlePluginClick(plugin)"
          >
            <div class="flex align-items-center gap-3">
              <i
                v-if="isPluginLoadedWithSelectedVersion(plugin)"
                class="pi text-secondary text-sm"
                :class="expandedPlugins[plugin.id] ? 'pi-chevron-down' : 'pi-chevron-right'"
              ></i>
              <i v-else class="pi pi-download text-secondary text-sm"></i>

              <span class="flex align-items-center">
                <PluginIcon width="32px" :icon="plugin.icon" v-if="plugin.icon" />
                <div
                  v-else
                  class="flex align-items-center justify-content-center w-8 h-8 rounded bg-secondary"
                >
                  <i :class="getFallbackIcon(plugin.id)" class="text-secondary text-base"></i>
                </div>
              </span>

              <div class="flex flex-column">
                <div class="flex align-items-center gap-2 flex-wrap">
                  <span class="font-bold text-sm text-color">{{ plugin.name }}</span>
                  <span class="text-xs text-secondary font-mono">{{ plugin.id }}</span>
                  <!-- Badges -->
                  <span v-if="isPluginLoadedWithSelectedVersion(plugin)" class="badge active-badge">
                    Active
                  </span>
                  <span v-else-if="isPluginCached(plugin.id)" class="badge cached-badge">
                    Cached
                  </span>
                  <span v-else class="badge registry-badge"> Registry </span>
                </div>
                <span class="text-xs text-secondary mt-1">
                  {{ plugin.description || "No description available." }}
                </span>
              </div>
            </div>

            <!-- Loader/Install Button -->
            <div class="flex align-items-center gap-3" @click.stop>
              <!-- Button or loading indicator -->
              <div style="min-width: 90px" class="flex justify-content-end">
                <template v-if="installingPlugins[plugin.id]">
                  <Button
                    icon="pi pi-spin pi-spinner"
                    label="Loading..."
                    size="small"
                    outlined
                    disabled
                  />
                </template>
                <template v-else-if="!isPluginLoadedWithSelectedVersion(plugin)">
                  <Button
                    icon="pi pi-plus"
                    label="Activate"
                    size="small"
                    outlined
                    @click="handlePluginClick(plugin)"
                  />
                </template>
              </div>
            </div>
          </div>

          <!-- Nodes of the plugin (expanded view) -->
          <div
            v-if="isPluginLoadedWithSelectedVersion(plugin) && expandedPlugins[plugin.id]"
            class="plugin-nodes mt-3 pt-3 border-top border-surface"
          >
            <ul class="node list-none p-0 m-0">
              <template v-for="node in plugin.nodes" :key="node.node.id">
                <li
                  v-if="shouldShowNode(node)"
                  class="flex node-item"
                  @click="selected = { nodeId: node.node.id, pluginId: plugin.id }"
                >
                  <a
                    class="element"
                    :class="{
                      selected:
                        selected?.nodeId === node.node.id && selected?.pluginId === plugin.id,
                    }"
                  >
                    <i class="pi" :class="node.node.icon || 'pi-box'"></i>
                    <div class="node-details">
                      <span class="node-name">
                        {{ node.node.name }}
                        <span v-if="node.node.version" class="version"
                          >v{{ node.node.version }}</span
                        >
                      </span>
                      <p v-if="node.node.description" class="node-description">
                        {{ node.node.description }}
                      </p>
                      <span
                        v-if="typeof node.node.disabled === 'string'"
                        class="text-xs text-warning mt-1 block"
                      >
                        {{ node.node.disabled }}
                      </span>
                    </div>
                  </a>
                </li>
              </template>
            </ul>
            <div
              v-if="!plugin.nodes || plugin.nodes.length === 0"
              class="p-2 text-xs text-secondary italic"
            >
              No actions available for this plugin.
            </div>
          </div>
        </div>
      </div>

      <template #footer>
        <div class="footer pt-4">
          <div class="flex justify-content-start gap-2">
            <Checkbox id="advanced-nodes-checkbox" v-model="displayAdvancedNodes" :binary="true" />
            <label for="advanced-nodes-checkbox"> {{ $t("editor.display-advanced-nodes") }} </label>
          </div>

          <div class="flex justify-content-end gap-2">
            <Button
              type="button"
              :label="$t('base.cancel')"
              severity="secondary"
              @click="visible = false"
            ></Button>
            <Button type="button" :label="$t('base.add')" @click="onAdd"></Button>
          </div>
        </div>
      </template>
    </Dialog>
    <!-- <TieredMenu ref="$menu" :model="nodeMenuItems" :popup="true"></TieredMenu> -->
  </div>
</template>

<script lang="ts" setup>
import { useEditor } from "@renderer/store/editor";
import { PropType, computed, ref, toRefs, watchEffect, watch } from "vue";

import { storeToRefs } from "pinia";
import Button from "primevue/button";
import InputText from "primevue/inputtext";
import Select from "primevue/select";
import { useAppStore } from "@renderer/store/app";
import { PipelabNode, RendererNodeDefinition } from "@pipelab/shared";
import { useLogger } from "@pipelab/shared";
import PluginIcon from "./nodes/PluginIcon.vue";
import { useAPI } from "@renderer/composables/api";
import { useToast } from "primevue/usetoast";
import { watchDebounced } from "@vueuse/core";
import semver from "semver";

type ButtonProps = InstanceType<typeof Button>["$props"];

const props = defineProps({
  buttonProps: {
    type: Object as PropType<ButtonProps>,
    required: false,
    default: () => ({}),
  },
  path: {
    type: Array as PropType<string[]>,
    required: true,
  },
  isRunning: {
    type: Boolean,
    required: false,
    default: false,
  },
});

const { path, isRunning } = toRefs(props);

const instance = useEditor();
const appStore = useAppStore();
const api = useAPI();
const toast = useToast();

const { plugins } = storeToRefs(instance);
const { pluginDefinitions } = storeToRefs(appStore);
const $searchInput = ref<InstanceType<typeof InputText>>();

const visible = ref(false);
const search = ref("");
const displayAdvancedNodes = ref(false);

const registryResults = ref<Array<{ name: string; version: string; description?: string }>>([]);
const searchingRegistry = ref(false);
const installingPackage = ref<string | null>(null);

const cachedPlugins = ref<Array<{ name: string; version: string; description?: string }>>([]);
const expandedPlugins = ref<Record<string, boolean>>({});
const installingPlugins = ref<Record<string, boolean>>({});

// Simple semver comparison helper
const compareVersions = (a: string, b: string): number => {
  return semver.compare(semver.coerce(a) || "0.0.0", semver.coerce(b) || "0.0.0");
};

// Fetch installed plugins from local cache, keeping only the latest version of each
const fetchCachedPlugins = async () => {
  try {
    const res = await api.execute("plugin:list-installed");
    if (res.type === "success" && res.result?.installed) {
      const groups: Record<string, (typeof res.result.installed)[0]> = {};
      for (const item of res.result.installed) {
        if (!groups[item.name] || compareVersions(item.version, groups[item.name].version) > 0) {
          groups[item.name] = item;
        }
      }
      cachedPlugins.value = Object.values(groups);
    }
  } catch (e) {
    console.error("Failed to fetch cached plugins:", e);
  }
};

watch(visible, async (newVal) => {
  if (newVal) {
    await fetchCachedPlugins();
  }
});

const isOfficial = (name: string) => {
  return name.startsWith("@pipelab/");
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
  return name;
};

const getFallbackIcon = (name: string) => {
  const n = name.toLowerCase();
  if (n.includes("steam")) return "pi pi-bolt";
  if (n.includes("itch")) return "pi pi-palette";
  if (n.includes("discord")) return "pi pi-discord";
  if (n.includes("filesystem")) return "pi pi-folder-open";
  if (n.includes("system")) return "pi pi-cog";
  if (n.includes("construct")) return "pi pi-clone";
  if (n.includes("electron")) return "pi pi-desktop";
  if (n.includes("poki")) return "pi pi-globe";
  if (n.includes("nvpatch")) return "pi pi-shield";
  if (n.includes("tauri")) return "pi pi-box";
  if (n.includes("minify")) return "pi pi-compress";
  if (n.includes("netlify")) return "pi pi-cloud";
  return "pi pi-box";
};

watchEffect(() => {
  if (visible.value === true) {
    // @ts-ignore - PrimeVue InputText public instance does not declare $el in type definitions
    const el = $searchInput.value?.$el;

    if (el instanceof HTMLInputElement) {
      el.focus();
    }
  }
});

// Watch search input to query the registry with a 500ms debounce
watchDebounced(
  search,
  async (newQuery) => {
    // Disable remote registry search for now
    registryResults.value = [];
  },
  { debounce: 500 },
);

const isPluginLoadedWithSelectedVersion = (plugin: any) => {
  return pluginDefinitions.value.some((p) => p.id === plugin.id);
};

const isPluginCached = (pluginId: string) => {
  return cachedPlugins.value.some((p) => p.name === pluginId);
};

const togglePluginExpand = (pluginId: string) => {
  expandedPlugins.value[pluginId] = !expandedPlugins.value[pluginId];
};

const handlePluginClick = async (plugin: any) => {
  const isLoaded = pluginDefinitions.value.some((p) => p.id === plugin.id);

  if (isLoaded) {
    togglePluginExpand(plugin.id);
    return;
  }

  installingPlugins.value[plugin.id] = true;
  try {
    toast.add({
      severity: "info",
      summary: "Installing plugin",
      detail: `Installing and enabling ${formatPluginName(plugin.id)}...`,
      life: 3000,
    });

    const res = await api.execute("plugin:install", {
      packageName: plugin.id,
      version: "latest",
    });
    if (res.type === "success") {
      toast.add({
        severity: "success",
        summary: "Plugin loaded",
        detail: `${formatPluginName(plugin.id)} is now active!`,
        life: 3000,
      });

      await fetchCachedPlugins();
      expandedPlugins.value[plugin.id] = true;
    } else {
      toast.add({
        severity: "error",
        summary: "Installation failed",
        detail: res.ipcError || `Could not install ${plugin.id}`,
        life: 5000,
      });
    }
  } catch (err: any) {
    console.error("Installation failed:", err);
    toast.add({
      severity: "error",
      summary: "Installation error",
      detail: err.message || `Could not install ${plugin.id}`,
      life: 5000,
    });
  } finally {
    installingPlugins.value[plugin.id] = false;
  }
};

const isNodePicked = (node: PipelabNode, searchedValue: string) => {
  if (node.type !== "action") {
    return false;
  }

  if (!searchedValue) return true;

  const searchTerms = searchedValue.toLowerCase().split(/\s+/);
  const description = node.description?.toLowerCase() || "";
  const name = node.name.toLowerCase();
  const tags = (node as { tags?: string[] }).tags?.map((tag) => tag.toLowerCase()) || [];
  const allText = `${name} ${description} ${tags.join(" ")}`;

  return searchTerms.every(
    (term) => allText.includes(term) || term.split("").every((char) => allText.includes(char)),
  );
};

const displayPlugins = computed(() => {
  const searchedValue = search.value.trim().toLowerCase();

  const pluginsMap: Record<
    string,
    {
      id: string;
      name: string;
      description: string;
      icon?: any;
      status: "active" | "cached" | "registry";
      loadedVersion?: string;
      cachedVersion?: string;
      registryVersion?: string;
      nodes: any[];
    }
  > = {};

  // 1. Add currently loaded/active plugins
  for (const def of pluginDefinitions.value) {
    pluginsMap[def.id] = {
      id: def.id,
      name: def.name,
      description: def.description || "",
      icon: def.icon,
      status: "active",
      loadedVersion: def.version,
      nodes: def.nodes.map((n) => ({ ...n })),
    };
  }

  // 2. Add cached plugins
  for (const cached of cachedPlugins.value) {
    if (pluginsMap[cached.name]) {
      pluginsMap[cached.name].cachedVersion = cached.version;
    } else {
      pluginsMap[cached.name] = {
        id: cached.name,
        name: formatPluginName(cached.name),
        description: cached.description || "",
        status: "cached",
        cachedVersion: cached.version,
        nodes: [],
      };
    }
  }

  // 3. Add registry search results
  for (const reg of registryResults.value) {
    if (pluginsMap[reg.name]) {
      pluginsMap[reg.name].registryVersion = reg.version;
    } else {
      pluginsMap[reg.name] = {
        id: reg.name,
        name: formatPluginName(reg.name),
        description: reg.description || "",
        status: "registry",
        registryVersion: reg.version,
        nodes: [],
      };
    }
  }

  const allList = Object.values(pluginsMap);

  if (!searchedValue) {
    return allList;
  }

  const searchTerms = searchedValue.split(/\s+/);
  return allList
    .map((plugin) => {
      const filteredNodes = plugin.nodes.filter((node) => isNodePicked(node.node, searchedValue));
      return {
        ...plugin,
        nodes: filteredNodes,
      };
    })
    .filter((plugin) => {
      const nameMatch = searchTerms.every(
        (term) =>
          plugin.name.toLowerCase().includes(term) || plugin.id.toLowerCase().includes(term),
      );
      const descMatch = searchTerms.every((term) =>
        plugin.description.toLowerCase().includes(term),
      );
      const nodesMatch = plugin.nodes.length > 0;

      return nameMatch || descMatch || nodesMatch;
    });
});

// watchEffect removed

const shouldShowNode = (node: RendererNodeDefinition) => {
  if (node.node.advanced && displayAdvancedNodes.value) {
    return true;
  } else if (node.node.advanced && !displayAdvancedNodes.value) {
    return false;
  } else if (node.node.disabled) {
    return false;
  } else {
    return true;
  }
};

const selected = ref<{ nodeId: string; pluginId: string }>();

const addNode = () => {
  if (!isRunning.value) {
    visible.value = true;
  }
};

const editor = useEditor();
const { getNodeDefinition, getPluginDefinition } = editor;

const { logger } = useLogger();

const onAdd = () => {
  const selection = selected.value;

  if (!selection) {
    logger().error("cannot find selection");
    return;
  }

  const def = getPluginDefinition(selection.pluginId);

  if (!def) {
    logger().error("cannot find definition");
    return;
  }

  const node = getNodeDefinition(selection.nodeId, selection.pluginId);

  if (!node) {
    logger().error("cannot find node");
    return;
  }

  const insertAt = Number.parseInt(path.value.pop() ?? "0");

  instance.addNode({
    node: node.node,
    plugin: def,
    path: path.value,
    insertAt,
  });

  visible.value = false;
};
</script>

<style lang="scss" scoped>
.add-button-wrapper {
  display: flex;
  flex-direction: column;
  align-items: center;
}

.vl {
  border-left: 2px solid #c2c9d1;
  height: 8px;
}

.content {
  min-height: 50vh;
}

.search {
  margin-top: 8px;
}

.search .search-field input {
  width: 100%;
}

.list {
  margin: 8px 0;
  max-height: 60vh;
  overflow-y: auto;
  padding-right: 4px;

  .plugin {
    margin: 8px 0;

    &:first-child {
      margin-top: 0;
    }
  }

  /* Custom scrollbar */
  &::-webkit-scrollbar {
    width: 6px;
  }

  &::-webkit-scrollbar-track {
    background: var(--surface-100);
    border-radius: 3px;
  }

  &::-webkit-scrollbar-thumb {
    background: var(--surface-300);
    border-radius: 3px;

    &:hover {
      background: var(--surface-400);
    }
  }
}

.triggers {
  .node {
    .node-item {
      cursor: pointer;
      padding: 0;
      margin: 2px 0;
      border-radius: 4px;
      transition: all 0.15s ease;

      &[disabled] {
        pointer-events: none;
        opacity: 0.5;
      }

      .element {
        padding: 8px 12px;
        border-radius: 6px;
        border: 1px solid transparent;
        transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);

        .font-bold {
          font-size: 0.9rem;
          line-height: 1.2;
        }

        .text-secondary {
          font-size: 0.8rem;
          line-height: 1.2;
          opacity: 0.8;
        }
      }
    }
  }
}

.element {
  display: flex;
  align-items: flex-start;
  padding: 0.5rem 0.75rem;
  border-radius: 4px;
  transition: all 0.15s ease;
  width: 100%;

  i {
    margin-top: 2px;
    font-size: 1rem;
    margin-right: 0.75rem;
    color: var(--p-text-color-secondary);
    transition: all 0.2s ease;
  }

  .node-details {
    flex: 1;
    min-width: 0;

    .node-name {
      font-weight: 500;
      margin-bottom: 2px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      transition: color 0.2s ease;

      .version {
        opacity: 0.7;
        font-size: 0.85em;
        margin-left: 4px;
      }
    }

    .node-description {
      display: -webkit-box;
      -webkit-line-clamp: 2;
      line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
      font-size: 0.85rem;
      line-height: 1.3;
      color: var(--p-text-color-secondary);
      margin: 0;
      max-height: 2.6em;
    }
  }

  &:hover {
    background-color: var(--p-surface-100);
    border-color: var(--p-surface-200);

    :root.dark & {
      background-color: var(--p-surface-800);
      border-color: var(--p-surface-700);
    }

    .node-description {
      color: var(--p-text-color);
    }

    .node-name {
      color: var(--p-primary-color);
    }
  }

  &:active {
    transform: translateY(0);
    transition-duration: 0.1s;
  }

  &.selected {
    width: 100%;
    color: var(--p-primary-color-text);
    background-color: var(--p-surface-300);
    border-color: var(--p-primary-color);

    :root.dark & {
      background-color: var(--p-surface-700);
      color: var(--p-text-color);
    }

    .node-details {
      .node-name {
        font-weight: 600;
      }
    }

    i {
      color: var(--p-primary-color-text);
    }

    &:hover {
      border-color: var(--p-primary-color);
    }
  }
}

.plugin-item-wrapper {
  background: var(--surface-card);
  border: 1px solid var(--surface-border);
  border-radius: 8px;
  transition: all 0.2s ease;

  &:hover {
    border-color: var(--primary-color);
  }
}

.plugin-header {
  user-select: none;
}

.version-select {
  font-size: 0.75rem !important;
  min-width: 90px;
  max-width: 130px;
  height: 28px !important;
  align-items: center;

  :deep(.p-select-label) {
    padding: 0.15rem 0.5rem !important;
    font-size: 0.75rem;
    line-height: normal;
  }
}

.badge {
  display: inline-flex;
  align-items: center;
  font-size: 0.65rem;
  font-weight: 700;
  text-transform: uppercase;
  padding: 0.1rem 0.35rem;
  border-radius: 4px;
  letter-spacing: 0.03em;
  line-height: 1;

  &.active-badge {
    background: rgba(34, 197, 94, 0.1);
    color: #22c55e;
    border: 1px solid rgba(34, 197, 94, 0.15);
  }

  &.cached-badge {
    background: rgba(245, 158, 11, 0.1);
    color: #f59e0b;
    border: 1px solid rgba(245, 158, 11, 0.15);
  }

  &.registry-badge {
    background: rgba(168, 85, 247, 0.1);
    color: #a855f7;
    border: 1px solid rgba(168, 85, 247, 0.15);
  }

  &.official-badge {
    background: rgba(59, 130, 246, 0.1);
    color: #3b82f6;
    border: 1px solid rgba(59, 130, 246, 0.15);
  }
  &.community-badge {
    background: rgba(168, 85, 247, 0.1);
    color: #a855f7;
    border: 1px solid rgba(168, 85, 247, 0.15);
  }
}

.footer {
  border-top: 1px solid #c2c9d1;
  display: flex;
  justify-content: space-between;
  width: 100%;
  align-items: baseline;
}
</style>
