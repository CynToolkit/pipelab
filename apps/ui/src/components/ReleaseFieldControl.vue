<template>
  <div class="release-field">
    <label :for="inputId">{{ field.label }}</label>
    <small v-if="field.description" class="field-help">{{ field.description }}</small>
    <div v-if="field.type === 'connection'" class="connection-field">
      <Select
        :id="inputId"
        :model-value="value"
        :options="options"
        optionLabel="label"
        optionValue="value"
        filter
        showClear
        :placeholder="`Select ${field.label.toLowerCase()}`"
        class="field-control"
        @update:model-value="emitValue"
      />
      <Button
        label="Add"
        icon="pi pi-plus"
        text
        size="small"
        @click="emit('add-connection', field.integration || '')"
      />
    </div>
    <Select
      v-else-if="field.type === 'select'"
      :id="inputId"
      :model-value="value"
      :options="options"
      optionLabel="label"
      optionValue="value"
      :placeholder="`Select ${field.label.toLowerCase()}`"
      class="field-control"
      @update:model-value="emitValue"
    />
    <PathPicker
      v-else-if="field.type === 'file' || field.type === 'directory'"
      :model-value="value"
      :kind="field.type"
      :label="field.label"
      :file-extensions="field.fileExtensions"
      @update:model-value="emitValue"
    />
    <InputText
      v-else
      :id="inputId"
      :model-value="value"
      :type="field.type === 'password' ? 'password' : 'text'"
      :placeholder="field.required ? 'Required' : undefined"
      class="field-control"
      @update:model-value="emitValue"
    />
    <small
      v-for="issue in issues"
      :key="`${issue.code}:${issue.path || field.key}`"
      class="field-issue"
      :class="issue.severity === 'error' ? 'field-issue-error' : 'field-issue-warning'"
    >
      {{ issue.message }}
    </small>
  </div>
</template>

<script setup lang="ts">
import Button from "primevue/button";
import InputText from "primevue/inputtext";
import Select from "primevue/select";
import type { ReleaseFieldDefinition, ReleaseFieldOption, ValidationIssue } from "@pipelab/shared";
import PathPicker from "./PathPicker.vue";

defineProps<{
  field: ReleaseFieldDefinition;
  value: string;
  options: ReleaseFieldOption[];
  inputId: string;
  issues?: ValidationIssue[];
}>();
const emit = defineEmits<{
  "update:value": [value: unknown];
  "add-connection": [integration: string];
}>();
const emitValue = (value: unknown) => emit("update:value", value);
</script>

<style scoped>
.release-field {
  display: grid;
  gap: 5px;
  min-width: 0;
}
.release-field > label {
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--p-text-muted-color, var(--text-color-secondary));
}
.field-help {
  color: var(--p-text-muted-color, var(--text-color-secondary));
  font-size: 0.7rem;
}
.field-control {
  width: 100%;
  min-width: 0;
}
.connection-field {
  display: flex;
  gap: 6px;
  min-width: 0;
}
.connection-field .field-control {
  flex: 1;
}
.field-issue {
  font-size: 0.72rem;
}
.field-issue-error {
  color: var(--p-red-500, #ef4444);
}
.field-issue-warning {
  color: var(--p-yellow-600, #ca8a04);
}
</style>
