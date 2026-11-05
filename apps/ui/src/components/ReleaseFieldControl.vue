<template>
  <div class="release-field" :data-control-id="inputId">
    <label :for="inputId">{{ field.label }}</label>
    <small v-if="field.description" class="field-help">{{ field.description }}</small>
    <small
      v-if="
        allowPathEdit && (field.type === 'select' || field.type === 'connection') && !options.length
      "
      class="field-help"
      role="status"
    >
      Options require a connected Pipelab agent.
    </small>
    <template v-if="field.type === 'connection'">
      <div class="connection-field">
        <Select
          :id="inputId"
          :model-value="connectionBinding"
          :options="options"
          optionLabel="label"
          optionValue="value"
          filter
          showClear
          :placeholder="`Select ${field.label.toLowerCase()}`"
          class="field-control"
          @update:model-value="emitConnectionBinding"
        />
        <Button
          label="Add"
          icon="pi pi-plus"
          text
          size="small"
          @click="emit('add-connection', field.integration || '')"
        />
        <small class="field-help connection-binding-help">
          This Desktop remembers this saved Connection; the workflow only stores the alias.
        </small>
        <div
          v-if="!connectionBinding && connectionBindingSuggestion"
          class="connection-binding-suggestion"
          role="status"
        >
          <span>One matching saved Connection: {{ connectionBindingSuggestion.label }}</span>
          <Button
            label="Use this Connection"
            text
            size="small"
            @click="emitConnectionBinding(connectionBindingSuggestion.value)"
          />
        </div>
        <div
          v-if="!hideAdvanced && (connectionAliasDraft || editingAlias)"
          class="connection-alias"
        >
          <template v-if="editingAlias">
            <label :for="`${inputId}-alias`">Workflow alias</label>
            <InputText
              :id="`${inputId}-alias`"
              :model-value="connectionAliasDraft"
              placeholder="e.g. release-account"
              autocomplete="off"
              autocapitalize="off"
              spellcheck="false"
              class="field-control"
              @update:model-value="updateConnectionAliasDraft"
              @blur="finishAliasEdit"
              @keydown.enter.prevent="finishAliasEdit"
            />
            <small
              v-if="
                connectionAliasDraft && !workflowConnectionAliasPattern.test(connectionAliasDraft)
              "
              class="field-issue field-issue-error"
              role="alert"
            >
              Enter an alias starting with a letter or underscore, using letters, numbers,
              underscores, or hyphens.
            </small>
            <small class="field-help">
              Saved in the workflow. Renaming it updates its references; update any CLI or CI
              <code>--connection</code> overrides that use it.
            </small>
          </template>
          <span v-else class="alias-caption">
            Alias <code>{{ connectionAliasDraft }}</code>
            <button
              type="button"
              v-tooltip.top="'Edit workflow alias'"
              class="alias-edit"
              :aria-label="`Edit workflow alias for ${field.label}`"
              @click="startAliasEdit"
            >
              <i class="pi pi-pencil" aria-hidden="true" />
            </button>
          </span>
        </div>
      </div>
    </template>
    <div v-if="field.type !== 'connection'" class="field-control-row">
      <div v-if="environmentBindingEnabled" class="environment-binding-input">
        <span class="environment-prefix" aria-hidden="true">env.</span>
        <InputText
          :id="`${inputId}-environment-variable`"
          :model-value="environmentVariableName"
          :aria-label="`${field.label} environment variable`"
          :aria-invalid="environmentVariableError ? 'true' : undefined"
          :aria-describedby="environmentVariableError ? `${inputId}-environment-error` : undefined"
          :placeholder="suggestedEnvironmentVariableName"
          class="field-control"
          autocomplete="off"
          autocapitalize="off"
          spellcheck="false"
          @update:model-value="updateEnvironmentVariableName"
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
      <InputText
        v-else-if="allowPathEdit && (field.type === 'file' || field.type === 'directory')"
        :id="inputId"
        :model-value="value"
        :placeholder="field.required ? 'Required; validation needs an agent' : 'Optional path'"
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
      <button
        v-if="supportsEnvironmentBinding"
        type="button"
        class="environment-toggle"
        :class="{ active: environmentBindingEnabled }"
        :aria-pressed="environmentBindingEnabled"
        :aria-controls="`${inputId}-environment-variable`"
        v-tooltip.top="
          'Use an environment variable. The value is read from the environment of the client that starts the run.'
        "
        :aria-label="`Use an environment variable for ${field.label}`"
        @click="toggleEnvironmentBinding"
      >
        $
      </button>
    </div>
    <small
      v-if="environmentVariableError"
      :id="`${inputId}-environment-error`"
      class="field-issue field-issue-error"
      role="alert"
    >
      {{ environmentVariableError }}
    </small>
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
import { computed, nextTick, ref, watch } from "vue";
import Button from "primevue/button";
import InputText from "primevue/inputtext";
import Select from "primevue/select";
import type { ReleaseFieldDefinition, ReleaseFieldOption, ValidationIssue } from "@pipelab/shared";
import PathPicker from "./PathPicker.vue";

const props = defineProps<{
  field: ReleaseFieldDefinition;
  value: string;
  options: ReleaseFieldOption[];
  inputId: string;
  connectionBinding?: string;
  connectionBindingSuggestion?: ReleaseFieldOption;
  issues?: ValidationIssue[];
  allowPathEdit?: boolean;
  hideAdvanced?: boolean;
}>();
const emit = defineEmits<{
  "update:value": [value: unknown];
  "update:connection-binding": [connectionId: string];
  "add-connection": [integration: string];
}>();
const environmentReference = /^\$\{\{\s*env\.([\s\S]*?)\s*\}\}$/;
const environmentVariableNamePattern = /^[A-Za-z_][A-Za-z0-9_]*$/;
const workflowConnectionAliasPattern = /^[A-Za-z_][A-Za-z0-9_-]*$/;
const invalidEnvironmentBindingPrefix = "__pipelab_invalid_binding__:";
const environmentVariableNameError = (name: string) =>
  name
    ? "Use letters, numbers, and underscores only; start with a letter or underscore."
    : "Enter an environment variable name.";
const parseEnvironmentVariableName = (value: string) => {
  const name = environmentReference.exec(value)?.[1];
  if (name === undefined || !name.startsWith(invalidEnvironmentBindingPrefix)) return name;

  const encodedName = name.slice(invalidEnvironmentBindingPrefix.length);
  if (!/^(?:[\da-f]{4})*$/i.test(encodedName)) return name;
  let decodedName = "";
  for (let index = 0; index < encodedName.length; index += 4)
    decodedName += String.fromCharCode(Number.parseInt(encodedName.slice(index, index + 4), 16));
  return environmentVariableNamePattern.test(decodedName) ? name : decodedName;
};
const encodeInvalidEnvironmentBinding = (name: string) => {
  const encodedName = Array.from({ length: name.length }, (_, index) =>
    name.charCodeAt(index).toString(16).padStart(4, "0"),
  ).join("");
  return `\${{ env.${invalidEnvironmentBindingPrefix}${encodedName} }}`;
};
const initialEnvironmentVariableName =
  props.field.type === "connection" ? undefined : parseEnvironmentVariableName(props.value);
const suggestedEnvironmentVariableName = `PIPELAB_${
  props.field.key
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/[^A-Za-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toUpperCase() || "VALUE"
}`;
const environmentBindingEnabled = ref(initialEnvironmentVariableName !== undefined);
const connectionAliasDraft = ref(props.value);
const editingAlias = ref(false);
const supportsEnvironmentBinding = computed(
  () => props.field.type !== "connection" && !props.hideAdvanced,
);
const environmentVariableName = ref(initialEnvironmentVariableName ?? "");
const literalValue = ref(initialEnvironmentVariableName === undefined ? props.value : "");
const environmentVariableError = ref(
  initialEnvironmentVariableName !== undefined &&
    !environmentVariableNamePattern.test(initialEnvironmentVariableName)
    ? environmentVariableNameError(initialEnvironmentVariableName)
    : "",
);
let lastEmittedValue: string | undefined;

const emitValue = (value: unknown) => {
  lastEmittedValue = typeof value === "string" ? value : undefined;
  emit("update:value", value);
};
const emitConnectionBinding = (value: unknown) =>
  emit("update:connection-binding", typeof value === "string" ? value : "");

watch(
  () => props.value,
  (value) => {
    connectionAliasDraft.value = value;
    if (value === lastEmittedValue) {
      lastEmittedValue = undefined;
      return;
    }

    const name =
      props.field.type === "connection" ? undefined : parseEnvironmentVariableName(value);
    if (name !== undefined) {
      environmentBindingEnabled.value = true;
      environmentVariableName.value = name;
      environmentVariableError.value = environmentVariableNamePattern.test(name)
        ? ""
        : environmentVariableNameError(name);
      return;
    }

    environmentBindingEnabled.value = false;
    environmentVariableName.value = "";
    environmentVariableError.value = "";
    literalValue.value = value;
  },
);

const updateEnvironmentVariableName = (value: unknown) => {
  const name = typeof value === "string" ? value : "";
  environmentVariableName.value = name;
  if (!environmentVariableNamePattern.test(name)) {
    environmentVariableError.value = environmentVariableNameError(name);
    emitValue(encodeInvalidEnvironmentBinding(name));
  } else {
    environmentVariableError.value = "";
    emitValue(`\${{ env.${name} }}`);
  }
};
const updateConnectionAliasDraft = (value: unknown) => {
  connectionAliasDraft.value = typeof value === "string" ? value : "";
};
const startAliasEdit = async () => {
  editingAlias.value = true;
  await nextTick();
  document.getElementById(`${props.inputId}-alias`)?.focus();
};
const finishAliasEdit = () => {
  const alias = connectionAliasDraft.value;
  if (alias !== props.value) {
    // An invalid alias is never saved; revert instead of leaving the field in a blocked state.
    if (!alias || workflowConnectionAliasPattern.test(alias)) emitValue(alias);
    else connectionAliasDraft.value = props.value;
  }
  editingAlias.value = false;
};

const toggleEnvironmentBinding = () => {
  const enabled = !environmentBindingEnabled.value;
  environmentBindingEnabled.value = enabled;
  environmentVariableError.value = "";
  if (enabled) {
    literalValue.value = props.value;
    environmentVariableName.value = suggestedEnvironmentVariableName;
    environmentVariableError.value = "";
    emitValue(`\${{ env.${suggestedEnvironmentVariableName} }}`);
  } else {
    environmentVariableName.value = "";
    environmentVariableError.value = "";
    emitValue(literalValue.value);
  }
};
</script>

<style scoped>
.release-field {
  display: grid;
  grid-column: 1 / -1;
  gap: 6px;
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
.field-control-row {
  display: flex;
  align-items: stretch;
  gap: 8px;
  min-width: 0;
}
.field-control-row > :first-child {
  flex: 1;
  min-width: 0;
}
.environment-binding-input {
  display: flex;
  align-items: center;
  gap: 6px;
}
.environment-prefix {
  color: var(--p-text-muted-color, var(--text-color-secondary));
  font-family: var(--font-mono, ui-monospace, monospace);
  font-size: 0.78rem;
}
.environment-toggle {
  flex: 0 0 auto;
  min-width: 40px;
  border: 1px solid var(--p-surface-300, var(--surface-border));
  border-radius: 6px;
  background: transparent;
  color: var(--p-text-muted-color, var(--text-color-secondary));
  cursor: pointer;
  font-family: var(--font-mono, ui-monospace, monospace);
  font-size: 0.85rem;
  font-weight: 700;
}
.environment-toggle:hover,
.environment-toggle:focus-visible {
  color: var(--text-color);
  border-color: var(--p-primary-color, var(--primary-color, #6366f1));
}
.environment-toggle.active {
  border-color: var(--p-primary-color, var(--primary-color, #6366f1));
  background: var(--p-primary-color, var(--primary-color, #6366f1));
  color: var(--p-primary-contrast-color, var(--primary-contrast-color, white));
}
.connection-field {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 6px 8px;
  min-width: 0;
  align-items: center;
}
.connection-binding-suggestion {
  display: grid;
  grid-column: 1 / -1;
  gap: 0.25rem;
  color: var(--p-text-muted-color, var(--text-color-secondary));
  font-size: 0.75rem;
}
.connection-binding-help {
  grid-column: 1 / -1;
}

.connection-alias {
  display: grid;
  grid-column: 1 / -1;
  gap: 6px;
  min-width: 0;
}
.connection-alias > label {
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--p-text-muted-color, var(--text-color-secondary));
}
.connection-field .field-control {
  grid-column: 1;
  width: 100%;
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
.alias-caption {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--p-text-muted-color, var(--text-color-secondary));
  font-size: 0.72rem;
}
.alias-caption code {
  font-size: 0.72rem;
}
.alias-edit {
  display: inline-grid;
  place-items: center;
  width: 20px;
  height: 20px;
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: inherit;
  cursor: pointer;
  font-size: 0.7rem;
}
.alias-edit:hover,
.alias-edit:focus-visible {
  background: var(--p-surface-100, var(--surface-hover));
  color: var(--text-color);
}
</style>
