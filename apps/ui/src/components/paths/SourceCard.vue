<template>
  <div class="source-card" :class="{ warning: sourceWarning }">
    <i class="mdi engine-icon" :class="engineIcon"></i>
    <div class="source-text">
      <span class="engine-name">{{ engineLabel }}</span>
      <span class="source-path">{{ pathDisplay }}</span>
    </div>
    <span class="last-export" v-if="lastExport">
      Last export: {{ formatTimeAgo(lastExport) }}
    </span>
    <span class="warning-text" v-else-if="sourceWarning">
      Source changed
    </span>
    <button class="edit-btn" @click="$emit('edit')" aria-label="Edit source">
      <i class="mdi mdi-pencil"></i>
    </button>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import type { Source } from "@pipelab/shared";

const props = defineProps<{
  source: Source;
  lastExport: Date | null;
  sourceWarning: boolean;
}>();

defineEmits<{ (e: "edit"): void }>();

const ENGINE_META: Record<string, { label: string; icon: string }> = {
  construct3: { label: "Construct 3", icon: "mdi-cube-outline" },
  godot: { label: "Godot", icon: "mdi-cube" },
  folder: { label: "Folder", icon: "mdi-folder-outline" },
};

const engineLabel = computed(() => ENGINE_META[props.source.type]?.label ?? "Unknown");
const engineIcon = computed(() => ENGINE_META[props.source.type]?.icon ?? "mdi-help-circle");

const pathDisplay = computed(() => {
  const p = props.source.path;
  if (!p) return "No path set";
  if (p.length <= 40) return p;
  return "…" + p.slice(-37);
});

const formatTimeAgo = (d: Date) => {
  const seconds = Math.floor((Date.now() - d.getTime()) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
};
</script>

<style scoped>
.source-card {
  display: flex;
  align-items: center;
  gap: 10px;
  height: 48px;
  padding: 0 12px;
  background: #1e1e24;
  border: 1px solid #2a2a30;
  border-radius: 8px;
  flex: 1;
  min-width: 0;
}

.source-card.warning {
  border-color: #f59e0b;
}

.engine-icon {
  font-size: 16px;
  color: #8b8b96;
  flex-shrink: 0;
}

.source-text {
  display: flex;
  flex-direction: column;
  min-width: 0;
  flex: 1;
}

.engine-name {
  font-size: 13px;
  color: #e4e4e7;
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.source-path {
  font-size: 11px;
  color: #8b8b96;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.last-export {
  font-size: 11px;
  color: #8b8b96;
  flex-shrink: 0;
  white-space: nowrap;
}

.warning-text {
  font-size: 11px;
  color: #f59e0b;
  flex-shrink: 0;
  white-space: nowrap;
}

.edit-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  background: none;
  border: none;
  border-radius: 4px;
  color: #8b8b96;
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.15s, color 0.15s, background 0.15s;
  flex-shrink: 0;
}

.source-card:hover .edit-btn {
  opacity: 1;
}

.edit-btn:hover {
  background: #2a2a30;
  color: #e4e4e7;
}

.edit-btn .mdi {
  font-size: 14px;
}
</style>
