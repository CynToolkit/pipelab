<template>
  <section class="release-field wide hook-editor" aria-labelledby="before-build-hooks-title">
    <div class="hook-editor-heading">
      <div>
        <h3 id="before-build-hooks-title">Before build hooks</h3>
        <p>
          Hooks run in order on this profile’s separate input copy, once before its targets are
          packaged.
        </p>
      </div>
      <Button
        v-if="supported"
        label="Add hook"
        icon="pi pi-plus"
        text
        size="small"
        @click="addHook"
      />
    </div>

    <Message v-if="!supported && hooks.length" severity="warn">
      This producer cannot run beforeBuild hooks. Disable or remove these hooks before applying it.
    </Message>
    <Message v-else-if="supported" severity="info">
      Script file and working directory are relative to the staged artifact. A script using
      <code>__dirname</code> should be beside <code>data.json</code>. Commands run on this machine
      after you approve them when shipping.
    </Message>

    <p v-if="!hooks.length" class="empty-hooks">No beforeBuild hooks configured.</p>
    <article v-for="(hook, index) in hooks" :key="hook.id" class="hook-card">
      <header class="hook-card-heading">
        <strong>Hook {{ index + 1 }}</strong>
        <div class="hook-card-actions">
          <ToggleSwitch
            :model-value="hook.enabled"
            :input-id="`before-build-enabled-${hook.id}`"
            :aria-label="`Hook ${index + 1} enabled`"
            @update:model-value="updateHook(index, { enabled: $event })"
          />
          <Button
            icon="pi pi-arrow-up"
            text
            rounded
            :disabled="index === 0"
            :aria-label="`Move hook ${index + 1} up`"
            @click="moveHook(index, -1)"
          />
          <Button
            icon="pi pi-arrow-down"
            text
            rounded
            :disabled="index === hooks.length - 1"
            :aria-label="`Move hook ${index + 1} down`"
            @click="moveHook(index, 1)"
          />
          <Button
            icon="pi pi-trash"
            text
            rounded
            severity="danger"
            :aria-label="`Remove hook ${index + 1}`"
            @click="removeHook(index)"
          />
        </div>
      </header>
      <div class="hook-fields">
        <div class="release-field">
          <label :for="`before-build-command-${hook.id}`">Command executable</label>
          <InputText
            :id="`before-build-command-${hook.id}`"
            :model-value="hook.command"
            placeholder="node"
            :disabled="!supported"
            @update:model-value="updateHook(index, { command: $event })"
          />
        </div>
        <div class="release-field">
          <label :for="`before-build-script-${hook.id}`">Script file in artifact</label>
          <InputText
            :id="`before-build-script-${hook.id}`"
            :model-value="hook.scriptFile"
            placeholder="setSDKEnabled.js"
            :disabled="!supported"
            @update:model-value="updateHook(index, { scriptFile: $event })"
          />
        </div>
        <div class="release-field">
          <label :for="`before-build-arguments-${hook.id}`">Arguments (one per line)</label>
          <Textarea
            :id="`before-build-arguments-${hook.id}`"
            :model-value="hook.parameters.join('\n')"
            rows="3"
            :disabled="!supported"
            @update:model-value="setArguments(index, $event)"
          />
        </div>
        <div class="release-field">
          <label :for="`before-build-cwd-${hook.id}`">Working directory in artifact</label>
          <InputText
            :id="`before-build-cwd-${hook.id}`"
            :model-value="hook.workingDirectory || '.'"
            placeholder="."
            :disabled="!supported"
            @update:model-value="updateHook(index, { workingDirectory: $event || '.' })"
          />
        </div>
        <div class="release-field">
          <label :for="`before-build-failure-${hook.id}`">When a command fails</label>
          <Select
            :id="`before-build-failure-${hook.id}`"
            :model-value="hook.failureMode || 'fail'"
            :options="failureOptions"
            option-label="label"
            option-value="value"
            :disabled="!supported"
            @update:model-value="updateHook(index, { failureMode: $event })"
          />
        </div>
      </div>
    </article>
  </section>
</template>

<script setup lang="ts">
import { nanoid } from "nanoid";
import Button from "primevue/button";
import Message from "primevue/message";
import Select from "primevue/select";
import Textarea from "primevue/textarea";
import ToggleSwitch from "primevue/toggleswitch";
import InputText from "primevue/inputtext";
import type { ReleaseBeforeBuildHook } from "@pipelab/shared";

const props = defineProps<{ hooks: ReleaseBeforeBuildHook[]; supported: boolean }>();
const emit = defineEmits<{ "update:hooks": [hooks: ReleaseBeforeBuildHook[]] }>();

const failureOptions = [
  { label: "Stop this build", value: "fail" },
  { label: "Warn and continue", value: "warn" },
];

const commit = (hooks: ReleaseBeforeBuildHook[]) => emit("update:hooks", hooks);
const updateHook = (index: number, changes: Partial<ReleaseBeforeBuildHook>) =>
  commit(
    props.hooks.map((hook, itemIndex) => (itemIndex === index ? { ...hook, ...changes } : hook)),
  );
const setArguments = (index: number, value: string | undefined) =>
  updateHook(index, { parameters: (value || "").split("\n").filter((item) => item.length > 0) });
const addHook = () =>
  commit([
    ...props.hooks,
    {
      id: nanoid(),
      enabled: true,
      command: "node",
      scriptFile: "",
      parameters: [],
      workingDirectory: ".",
      failureMode: "fail",
    },
  ]);
const removeHook = (index: number) =>
  commit(props.hooks.filter((_hook, itemIndex) => itemIndex !== index));
const moveHook = (index: number, direction: -1 | 1) => {
  const next = [...props.hooks];
  const targetIndex = index + direction;
  if (targetIndex < 0 || targetIndex >= next.length) return;
  [next[index], next[targetIndex]] = [next[targetIndex], next[index]];
  commit(next);
};
</script>

<style scoped>
.hook-editor {
  gap: 0.75rem;
}

.hook-editor-heading,
.hook-card-heading,
.hook-card-actions {
  display: flex;
  align-items: center;
}

.hook-editor-heading,
.hook-card-heading {
  justify-content: space-between;
  gap: 0.75rem;
}

.hook-editor-heading h3 {
  margin: 0;
  font-size: 1rem;
}

.hook-editor-heading p,
.empty-hooks {
  margin: 0.25rem 0 0;
  color: var(--text-color-secondary);
  font-size: 0.875rem;
}

.hook-card {
  display: grid;
  gap: 0.75rem;
  padding: 1rem;
  border: 1px solid var(--surface-border);
  border-radius: var(--border-radius);
}

.hook-card-heading {
  min-height: 2rem;
}

.hook-card-actions {
  gap: 0.25rem;
}

.hook-fields {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.75rem;
}

@media (max-width: 48rem) {
  .hook-fields {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
