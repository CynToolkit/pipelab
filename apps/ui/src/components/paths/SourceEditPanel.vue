<template>
  <div class="edit-backdrop" @click.self="$emit('close')">
    <div class="edit-panel">
      <h3 class="panel-title">Source</h3>

      <label class="section-label">Engine</label>
      <div class="engine-picker">
        <button
          v-for="opt in engineOptions"
          :key="opt.value"
          class="engine-option"
          :class="{ active: source.type === opt.value }"
          @click="currentType = opt.value"
        >
          <i class="mdi" :class="opt.icon"></i>
          <span>{{ opt.label }}</span>
        </button>
      </div>

      <label class="section-label">Folder</label>
      <div class="folder-picker">
        <input
          v-model="path"
          class="path-input"
          type="text"
          placeholder="Choose a folder"
          readonly
        />
        <button class="browse-btn" @click="browse">Browse</button>
      </div>

      <div class="panel-actions">
        <button class="cancel-btn" @click="$emit('close')">Cancel</button>
        <button class="save-btn" :disabled="!path" @click="save">Save</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from "vue";
import type { Source, EngineType } from "@pipelab/shared";
import { useAPI } from "@renderer/composables/api";

const props = defineProps<{ source: Source }>();
const emit = defineEmits<{
  (e: "save", source: Source): void;
  (e: "close"): void;
}>();

const path = ref(props.source.path);
const currentType = ref<EngineType>(props.source.type);

const engineOptions: { value: EngineType; label: string; icon: string }[] = [
  { value: "construct3", label: "Construct 3", icon: "mdi-cube-outline" },
  { value: "godot", label: "Godot", icon: "mdi-cube" },
  { value: "folder", label: "Folder", icon: "mdi-folder-outline" },
];

const api = useAPI();
const browse = async () => {
  const result = await api.execute("dialog:showOpenDialog", {
    properties: ["openDirectory"],
  });
  if (result.type === "success" && (result as any).result) {
    path.value = (result as any).result;
  }
};

const save = () => {
  if (!path.value) return;
  const out: Source = { type: currentType.value, path: path.value } as Source;
  emit("save", out);
};
</script>

<style scoped>
.edit-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding-top: 80px;
  z-index: 1000;
}

.edit-panel {
  background: #18181c;
  border: 1px solid #2a2a30;
  border-radius: 8px;
  padding: 24px;
  width: 480px;
  max-width: 90vw;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.panel-title {
  font-size: 16px;
  font-weight: 500;
  color: #e4e4e7;
  margin: 0;
}

.section-label {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: #8b8b96;
  margin-bottom: -8px;
}

.engine-picker {
  display: flex;
  gap: 8px;
}

.engine-option {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 16px 8px;
  background: #1e1e24;
  border: 1px solid #2a2a30;
  border-radius: 8px;
  color: #8b8b96;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.15s;
}

.engine-option:hover {
  background: #2a2a30;
  color: #e4e4e7;
}

.engine-option.active {
  border-color: #6366f1;
  color: #e4e4e7;
  background: rgba(99, 102, 241, 0.08);
}

.engine-option .mdi {
  font-size: 24px;
}

.folder-picker {
  display: flex;
  gap: 8px;
}

.path-input {
  flex: 1;
  padding: 8px 12px;
  background: #1e1e24;
  border: 1px solid #2a2a30;
  border-radius: 6px;
  color: #e4e4e7;
  font-size: 13px;
  font-family: monospace;
}

.path-input:focus {
  outline: none;
  border-color: #6366f1;
}

.browse-btn {
  padding: 8px 16px;
  background: #1e1e24;
  border: 1px solid #2a2a30;
  border-radius: 6px;
  color: #e4e4e7;
  font-size: 13px;
  cursor: pointer;
  transition: background 0.15s;
}

.browse-btn:hover {
  background: #2a2a30;
}

.panel-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 8px;
}

.cancel-btn,
.save-btn {
  padding: 8px 16px;
  border-radius: 6px;
  font-size: 13px;
  cursor: pointer;
  border: 1px solid #2a2a30;
  transition: all 0.15s;
}

.cancel-btn {
  background: none;
  color: #8b8b96;
}

.cancel-btn:hover {
  color: #e4e4e7;
  background: #1e1e24;
}

.save-btn {
  background: #22c55e;
  border-color: #22c55e;
  color: white;
}

.save-btn:hover:not(:disabled) {
  background: #16a34a;
}

.save-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
</style>
