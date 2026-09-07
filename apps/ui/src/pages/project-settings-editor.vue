<template>
  <div class="project-settings-editor flex flex-column gap-4">
    <div class="section-header mb-2">
        <Message severity="info" :closable="false" class="mb-4">
          All plugins are bundled with the CLI. Below is a read-only list of the bundled plugins
          used by this pipeline.
        </Message>
    </div>

    <!-- Active Plugins List -->
    <div class="plugins-list flex flex-column gap-3">
      <div
        v-for="packageName in plugins"
        :key="packageName"
        class="plugin-card flex items-center justify-between p-3 border border-surface rounded-lg bg-card"
      >
        <!-- Plugin Icon and Details -->
        <div class="plugin-left flex items-center gap-3">
          <div class="plugin-icon-wrapper flex items-center justify-center w-10 h-10 rounded">
            <!-- Icon -->
            <template v-if="getPluginDef(packageName)?.icon">
              <img
                v-if="getPluginIconImage(packageName)"
                :src="getPluginIconImage(packageName)"
                class="w-full h-full object-contain p-1"
              />
              <i v-else :class="['mdi', getPluginIconName(packageName)]" class="text-lg"></i>
            </template>
            <i v-else :class="getFallbackIcon(packageName)" class="text-lg"></i>
          </div>

          <div class="plugin-details flex flex-column">
            <div class="flex items-center gap-2 flex-wrap">
              <span class="font-bold text-sm text-color">{{ formatPluginName(packageName) }}</span>
              <span class="text-xs text-secondary font-mono">{{ packageName }}</span>
              <!-- badge -->
              <span v-if="isOfficial(packageName)" class="badge official-badge">
                <i class="pi pi-verified mr-1"></i>Official
              </span>
              <span v-else class="badge community-badge">
                <i class="pi pi-globe mr-1"></i>Community
              </span>
            </div>
            <span class="text-xs text-secondary mt-1">
              {{ getPluginDef(packageName)?.description || "No description available." }}
            </span>
          </div>
        </div>

        <!-- Read-only Version Status -->
        <div class="plugin-right flex items-center gap-3">
          <span
            class="text-xs text-secondary bg-surface-100 dark:bg-surface-800 px-2 py-1 rounded font-mono"
          >
            Active
          </span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useEditor } from "@renderer/store/editor";
import { useAppStore } from "@renderer/store/app";
import { storeToRefs } from "pinia";
import Message from "primevue/message";

const editorStore = useEditor();
const appStore = useAppStore();

const { plugins } = storeToRefs(editorStore);
const { pluginDefinitions } = storeToRefs(appStore);

const getPluginDef = (packageName: string) => {
  return pluginDefinitions.value.find((p) => p.packageName === packageName);
};

const getPluginIconImage = (packageName: string): string | undefined => {
  const def = getPluginDef(packageName);
  if (def?.icon && def.icon.type === "image") {
    return def.icon.image;
  }
  return undefined;
};

const getPluginIconName = (packageName: string): string | undefined => {
  const def = getPluginDef(packageName);
  if (def?.icon && def.icon.type === "icon") {
    return def.icon.icon;
  }
  return undefined;
};

const isOfficial = (packageName: string) => {
  return packageName.startsWith("@pipelab/");
};

const formatPluginName = (name: string) => {
  const def = getPluginDef(name);
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
</script>

<style scoped lang="scss">
.project-settings-editor {
  min-height: 200px;
}

.section-header {
  .description {
    font-size: 0.9rem;
    color: var(--text-color-secondary);
    margin: 0;
  }
}

.plugins-list {
  max-height: 400px;
  overflow-y: auto;
}

.plugin-card {
  background: var(--surface-card);
  border: 1px solid var(--surface-border);
  border-radius: 12px;
  transition: all 0.2s ease;

  &:hover {
    border-color: var(--primary-color);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.03);
  }
}

.plugin-icon-wrapper {
  background: var(--surface-section);
  border: 1px solid var(--surface-border);
  color: var(--text-color-secondary);
}

.badge {
  display: inline-flex;
  align-items: center;
  font-size: 0.65rem;
  font-weight: 700;
  text-transform: uppercase;
  padding: 0.15rem 0.4rem;
  border-radius: 4px;
  letter-spacing: 0.03em;
  line-height: 1;

  i {
    font-size: 0.7rem;
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
</style>
