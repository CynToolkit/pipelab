<template>
  <div class="release-field" :data-control-id="inputId">
    <label :for="inputId"
      >{{ field.label }}<span v-if="field.required" class="required-mark" aria-hidden="true"> *</span
      ><span v-if="field.required" class="p-hidden-accessible"> (required)</span></label
    >
    <small v-if="field.description" class="field-help">
      <template v-for="(part, index) in descriptionParts" :key="index">
        <strong v-if="part.kind === 'bold'">{{ part.text }}</strong>
        <code v-else-if="part.kind === 'code'">{{ part.text }}</code>
        <template v-else>{{ part.text }}</template>
      </template>
    </small>
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
          outlined
          severity="secondary"
          @click="emit('add-connection', field.integration || '')"
        />
        <div
          v-if="!connectionBinding && connectionBindingSuggestion"
          class="connection-binding-suggestion"
          role="status"
        >
          <span
            >One matching saved Connection:
            <strong>{{ connectionBindingSuggestion.label }}</strong></span
          >
          <Button
            label="Use this Connection"
            outlined
            severity="secondary"
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
        :mode="field.pathMode"
        :label="field.label"
        :file-extensions="field.fileExtensions"
        @update:model-value="emitValue"
      />
      <InputText
        v-else
        :id="inputId"
        :model-value="value"
        :type="field.type === 'password' ? 'password' : 'text'"
        :placeholder="field.placeholder ?? (field.required ? 'Required' : undefined)"
        class="field-control"
        @update:model-value="emitValue"
      />
      <Button
        v-if="supportsEnvironmentBinding"
        v-tooltip.top="
          'Use an environment variable. The value is read from the environment of the client that starts the run.'
        "
        class="environment-toggle"
        label="$"
        :outlined="!environmentBindingEnabled"
        :severity="environmentBindingEnabled ? undefined : 'secondary'"
        :aria-pressed="environmentBindingEnabled"
        :aria-controls="`${inputId}-environment-variable`"
        :aria-label="`Use an environment variable for ${field.label}`"
        @click="toggleEnvironmentBinding"
      />
    </div>
    <div
      v-if="textSuggestions.length"
      class="field-suggestions"
      role="group"
      :aria-label="`Suggestions for ${field.label}`"
    >
      <button
        v-for="option in textSuggestions"
        :key="option.value"
        type="button"
        class="suggestion-chip"
        :class="{ active: value === option.value }"
        :aria-pressed="value === option.value"
        @click="toggleSuggestion(option.value)"
      >
        {{ option.label }}
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
type DescriptionPart = { kind: "text" | "bold" | "code"; text: string };
// Descriptions may use **bold** and `code`; they are rendered as elements, never as HTML.
const descriptionParts = computed<DescriptionPart[]>(() =>
  (props.field.description ?? "")
    .split(/(\*\*[^*]+\*\*|`[^`]+`)/)
    .filter(Boolean)
    .map((text): DescriptionPart => {
      if (text.startsWith("**") && text.endsWith("**") && text.length > 4)
        return { kind: "bold", text: text.slice(2, -2) };
      if (text.startsWith("`") && text.endsWith("`") && text.length > 2)
        return { kind: "code", text: text.slice(1, -1) };
      return { kind: "text", text };
    }),
);
// Text fields can offer one-click suggestions; the value stays free-form.
const textSuggestions = computed(() =>
  props.field.type === "text" && !environmentBindingEnabled.value ? props.options : [],
);
const toggleSuggestion = (suggestion: string) =>
  emitValue(props.value === suggestion ? "" : suggestion);
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
.required-mark {
  color: var(--p-red-500, #ef4444);
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
/* Every trailing button in a field row (browse, environment variable) shares one size and shape. */
.field-control-row > .p-button,
.field-control-row :deep(.path-picker > .p-button) {
  flex: 0 0 2.75rem;
  width: 2.75rem;
  min-width: 2.75rem;
  padding: 0;
  justify-content: center;
}
.environment-toggle :deep(.p-button-label) {
  font-family: var(--font-mono, ui-monospace, monospace);
  font-size: 0.9rem;
  font-weight: 700;
}
.connection-field {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 6px 8px;
  min-width: 0;
  align-items: center;
}
.connection-binding-suggestion {
  display: flex;
  grid-column: 1 / -1;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 8px 8px 8px 12px;
  border: 1px dashed var(--pl-border-strong, var(--p-content-border-color));
  border-radius: 10px;
  background: var(--pl-sunken, transparent);
  color: var(--p-text-muted-color);
  font-size: 0.78rem;
}
.connection-binding-suggestion strong {
  color: var(--p-text-color);
  font-weight: 600;
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
.field-help :deep(strong) {
  color: var(--p-text-color);
  font-weight: 650;
}
.field-help :deep(code) {
  padding: 1px 5px;
  border-radius: 5px;
  background: var(--pl-hover, transparent);
  color: var(--p-text-color);
  font-size: 0.92em;
}
.field-suggestions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.suggestion-chip {
  padding: 3px 11px;
  border: 1px solid var(--p-content-border-color);
  border-radius: 999px;
  background: transparent;
  color: var(--p-text-muted-color);
  cursor: pointer;
  font: inherit;
  font-size: 0.76rem;
  font-weight: 500;
  transition:
    border-color 0.15s,
    background-color 0.15s,
    color 0.15s;
}
.suggestion-chip:hover {
  border-color: var(--pl-border-strong, var(--p-content-border-color));
  background: var(--pl-hover, transparent);
  color: var(--p-text-color);
}
.suggestion-chip:focus-visible {
  outline: none;
  box-shadow: var(--pl-ring, none);
}
.suggestion-chip.active {
  border-color: var(--p-primary-color);
  background: color-mix(in srgb, var(--p-primary-color) 9%, transparent);
  color: var(--p-text-color);
  font-weight: 600;
}
</style>
