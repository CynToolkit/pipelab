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
    <details
      v-if="field.type !== 'connection'"
      class="environment-advanced"
      :open="environmentBindingEnabled"
    >
      <summary>Advanced · Value source</summary>
      <label class="environment-binding-toggle">
        <input
          type="checkbox"
          :checked="environmentBindingEnabled"
          :aria-controls="`${inputId}-environment-variable`"
          @change="toggleEnvironmentBinding"
        />
        Use environment variable
      </label>
      <div v-if="environmentBindingEnabled" class="environment-binding-input">
        <label :for="`${inputId}-environment-variable`">Environment variable</label>
        <InputText
          :id="`${inputId}-environment-variable`"
          :model-value="environmentVariableName"
          :aria-invalid="environmentVariableError ? 'true' : undefined"
          :aria-describedby="`${inputId}-environment-help${environmentVariableError ? ` ${inputId}-environment-error` : ''}`"
          class="field-control"
          autocomplete="off"
          autocapitalize="off"
          spellcheck="false"
          @update:model-value="updateEnvironmentVariableName"
        />
        <small :id="`${inputId}-environment-help`" class="field-help">
          The value comes from the environment of the client that starts the run.
        </small>
        <small
          v-if="environmentVariableError"
          :id="`${inputId}-environment-error`"
          class="field-issue field-issue-error"
          role="alert"
        >
          {{ environmentVariableError }}
        </small>
      </div>
    </details>
    <template v-if="field.type === 'connection'">
      <div class="connection-field">
        <details class="connection-advanced">
          <summary>Advanced · Workflow alias</summary>
          <div class="connection-alias">
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
              @blur="commitConnectionAlias"
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
              This name is saved in the workflow. Renaming it updates its workflow references;
              update any CLI or CI <code>--connection</code> overrides that use it.
            </small>
          </div>
        </details>
        <Select
          :id="inputId"
          :model-value="connectionBinding"
          :options="options"
          optionLabel="label"
          optionValue="value"
          filter
          showClear
          :disabled="!workflowConnectionAliasPattern.test(connectionAliasDraft)"
          :placeholder="`Select ${field.label.toLowerCase()}`"
          class="field-control"
          @update:model-value="emitConnectionBinding"
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
        <Button
          label="Add"
          icon="pi pi-plus"
          text
          size="small"
          @click="emit('add-connection', field.integration || '')"
        />
      </div>
    </template>
    <Select
      v-if="field.type === 'select' && !environmentBindingEnabled"
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
      v-else-if="
        allowPathEdit &&
        (field.type === 'file' || field.type === 'directory') &&
        !environmentBindingEnabled
      "
      :id="inputId"
      :model-value="value"
      :placeholder="field.required ? 'Required; validation needs an agent' : 'Optional path'"
      class="field-control"
      @update:model-value="emitValue"
    />
    <PathPicker
      v-else-if="
        (field.type === 'file' || field.type === 'directory') && !environmentBindingEnabled
      "
      :model-value="value"
      :kind="field.type"
      :label="field.label"
      :file-extensions="field.fileExtensions"
      @update:model-value="emitValue"
    />
    <InputText
      v-else-if="field.type !== 'connection' && !environmentBindingEnabled"
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
import { ref, watch } from "vue";
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
const commitConnectionAlias = () => {
  if (connectionAliasDraft.value !== props.value) emitValue(connectionAliasDraft.value);
};

const toggleEnvironmentBinding = (event: Event) => {
  const enabled = (event.target as HTMLInputElement).checked;
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
.environment-binding-toggle {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  color: var(--p-text-muted-color, var(--text-color-secondary));
  font-size: 0.75rem;
}
.environment-binding-toggle input {
  margin: 0;
}
.environment-binding-input {
  display: grid;
  gap: 5px;
  min-width: 0;
}
.environment-binding-input > label {
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--p-text-muted-color, var(--text-color-secondary));
}
.connection-field {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 0.5rem;
  min-width: 0;
  align-items: end;
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

.connection-advanced {
  grid-column: 1 / -1;
  min-width: 0;
}

.connection-advanced summary {
  color: var(--p-text-muted-color);
  cursor: pointer;
  font-size: 0.85rem;
}
.connection-alias {
  display: grid;
  gap: 5px;
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
</style>
