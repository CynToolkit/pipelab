<template>
  <div class="path-picker">
    <InputText
      :model-value="modelValue || ''"
      :placeholder="placeholder"
      readonly
      :aria-label="label"
      @click="pickPath"
    />
    <Button
      icon="mdi mdi-folder-open-outline"
      outlined
      :aria-label="`Choose ${label.toLowerCase()}`"
      @click="pickPath"
    />
  </div>
</template>

<script setup lang="ts">
import Button from "primevue/button";
import InputText from "primevue/inputtext";
import { useAPI } from "@renderer/composables/api";

const props = withDefaults(
  defineProps<{
    modelValue?: string;
    kind?: "directory" | "file";
    label?: string;
    placeholder?: string;
    fileExtensions?: string[];
  }>(),
  {
    kind: "directory",
    label: "path",
    placeholder: "Select a location",
    fileExtensions: undefined,
  },
);
const emit = defineEmits<{ "update:modelValue": [value: string] }>();
const api = useAPI();

const pickPath = async () => {
  if (props.kind === "file") {
    const result = await api.execute("dialog:showOpenDialog", {
      title: `Choose ${props.label.toLowerCase()}`,
      defaultPath: props.modelValue || undefined,
      properties: ["openFile"],
      filters: props.fileExtensions?.length
        ? [{ name: "Supported files", extensions: props.fileExtensions }]
        : undefined,
    });
    if (result.type === "success" && !result.result.canceled && result.result.filePaths[0])
      emit("update:modelValue", result.result.filePaths[0]);
    return;
  }
  const result = await api.execute("dialog:showOpenDialog", {
    title: `Choose ${props.label.toLowerCase()}`,
    properties: ["openDirectory", "createDirectory", "promptToCreate"],
  });
  if (result.type === "success" && !result.result.canceled && result.result.filePaths[0])
    emit("update:modelValue", result.result.filePaths[0]);
};
</script>

<style scoped>
.path-picker {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
}
.path-picker :deep(.p-inputtext) {
  flex: 1;
  min-width: 0;
}
</style>
