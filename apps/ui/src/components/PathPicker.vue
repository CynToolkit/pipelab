<template>
  <div class="path-picker">
    <InputText :model-value="modelValue || ''" :placeholder="placeholder" readonly :aria-label="label" @click="pickPath" />
    <Button icon="mdi mdi-folder-open-outline" outlined :aria-label="`Choose ${label.toLowerCase()}`" @click="pickPath" />
  </div>
</template>

<script setup lang="ts">
import Button from "primevue/button";
import InputText from "primevue/inputtext";
import { useAPI } from "@renderer/composables/api";

const props = withDefaults(defineProps<{
  modelValue?: string;
  kind?: "directory" | "file";
  label?: string;
  placeholder?: string;
}>(), {
  kind: "directory",
  label: "path",
  placeholder: "Select a location",
});
const emit = defineEmits<{ "update:modelValue": [value: string] }>();
const api = useAPI();

const pickPath = async () => {
  if (props.kind === "file") {
    const result = await api.execute("dialog:showSaveDialog", {
      title: `Choose ${props.label.toLowerCase()}`,
      defaultPath: props.modelValue,
      properties: ["createDirectory", "showOverwriteConfirmation"],
      filters: [{ name: "ZIP archive", extensions: ["zip"] }],
    });
    if (result.type === "success" && result.result.filePath) emit("update:modelValue", result.result.filePath);
    return;
  }
  const result = await api.execute("dialog:showOpenDialog", {
    title: `Choose ${props.label.toLowerCase()}`,
    properties: ["openDirectory", "createDirectory", "promptToCreate"],
  });
  if (result.type === "success" && !result.result.canceled && result.result.filePaths[0]) emit("update:modelValue", result.result.filePaths[0]);
};
</script>

<style scoped>
.path-picker { display: flex; align-items: center; gap: 6px; width: 100%; }
.path-picker :deep(.p-inputtext) { flex: 1; min-width: 0; }
</style>
