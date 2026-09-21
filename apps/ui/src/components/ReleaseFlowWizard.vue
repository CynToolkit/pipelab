<template>
  <Dialog
    v-model:visible="visible"
    modal
    header="New release"
    :style="{ width: '720px', maxWidth: '96vw' }"
  >
    <Stepper v-model:value="step" linear>
      <StepList
        ><Step
          v-for="item in steps"
          :key="item.value"
          :value="item.value"
          asChild
          v-slot="{ activateCallback, a11yAttrs }"
          ><button class="step" v-bind="a11yAttrs.header" @click="activateCallback">
            {{ item.number }} <span>{{ item.label }}</span>
          </button></Step
        ></StepList
      >
      <StepPanels>
        <StepPanel value="details" v-slot="{ activateCallback }"
          ><div class="wizard-panel">
            <span class="eyebrow">Release setup</span>
            <h2>Name this release</h2>
            <p>Give the release a recognizable name.</p>
            <div class="form-grid">
              <div class="field wide">
                <label for="release-name">Name</label
                ><InputText id="release-name" v-model="draft.name" autofocus />
              </div>
              <div class="field wide">
                <label for="release-description">Description</label
                ><Textarea id="release-description" v-model="draft.description" rows="3" />
              </div>
            </div>
            <div class="wizard-actions">
              <Button
                label="Continue"
                icon="pi pi-arrow-right"
                iconPos="right"
                :disabled="!draft.name.trim()"
                @click="activateCallback('source')"
              />
            </div></div
        ></StepPanel>
        <StepPanel value="source" v-slot="{ activateCallback }"
          ><div class="wizard-panel">
            <span class="eyebrow">Release intent</span>
            <h2>What are you releasing?</h2>
            <div class="choice-grid">
              <button
                v-for="source in catalog.sources"
                :key="source.id"
                class="choice-card"
                :class="{ selected: draft.source.provider === source.id }"
                @click="chooseSource(source.id)"
              >
                <i :class="providerIcon(source.icon)" /><strong>{{ source.label }}</strong
                ><small>{{ source.description || "Provider-defined source" }}</small>
              </button>
            </div>
            <ReleaseFieldControl
              v-for="field in sourceDefinition?.fields || []"
              :key="field.key"
              :field="field"
              :value="String(draft.source.config[field.key] || '')"
              :options="fieldOptions(field.key, field.options || [])"
              :input-id="`wizard-source-${field.key}`"
              @update:value="draft.source.config[field.key] = $event"
            />
            <div class="wizard-actions">
              <Button
                label="Back"
                text
                severity="secondary"
                @click="activateCallback('details')"
              /><Button
                label="Continue"
                icon="pi pi-arrow-right"
                iconPos="right"
                :disabled="!sourceReady"
                @click="activateCallback('destinations')"
              />
            </div></div
        ></StepPanel>
        <StepPanel value="destinations" v-slot="{ activateCallback }"
          ><div class="wizard-panel">
            <span class="eyebrow">Where do you want to ship?</span>
            <h2>Destinations</h2>
            <p>
              Choose where this release should be delivered. Builds and routing are configured after
              creation.
            </p>
            <div class="choice-grid">
              <button
                v-for="destination in catalog.destinations"
                :key="destination.id"
                class="choice-card"
                :class="{ selected: hasDestination(destination.id) }"
                @click="toggleDestination(destination.id)"
              >
                <i :class="providerIcon(destination.icon)" /><strong>{{ destination.label }}</strong
                ><small>Destination</small>
              </button>
            </div>
            <div class="wizard-actions">
              <Button
                label="Back"
                text
                severity="secondary"
                @click="activateCallback('source')"
              /><Button
                label="Review"
                icon="pi pi-arrow-right"
                iconPos="right"
                :disabled="!draft.destinations.length"
                @click="activateCallback('review')"
              />
            </div></div
        ></StepPanel>
        <StepPanel value="review"
          ><div class="wizard-panel">
            <span class="eyebrow">Ready to create</span>
            <h2>{{ draft.name }}</h2>
            <div class="review-list">
              <div>
                <i class="mdi mdi-source-branch" /><span
                  ><small>Source</small
                  ><strong>{{ sourceDefinition?.label || "Not selected" }}</strong></span
                >
              </div>
              <div>
                <i class="mdi mdi-cloud-upload-outline" /><span
                  ><small>Destinations</small
                  ><strong>{{
                    draft.destinations.map((item) => destinationLabel(item.provider)).join(" · ")
                  }}</strong></span
                >
              </div>
            </div>
            <p class="review-copy">
              The Release editor will handle builds, engines, targets, and output routing.
            </p>
            <div class="wizard-actions">
              <Button
                label="Back"
                text
                severity="secondary"
                @click="step = 'destinations'"
              /><Button
                label="Create release"
                icon="mdi mdi-rocket-launch-outline"
                @click="create"
              />
            </div></div
        ></StepPanel>
      </StepPanels>
    </Stepper>
  </Dialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import Dialog from "primevue/dialog";
import Stepper from "primevue/stepper";
import StepList from "primevue/steplist";
import Step from "primevue/step";
import StepPanels from "primevue/steppanels";
import StepPanel from "primevue/steppanel";
import InputText from "primevue/inputtext";
import Textarea from "primevue/textarea";
import Button from "primevue/button";
import { nanoid } from "nanoid";
import type { IconType, ReleaseCatalog, ReleaseConfig, ReleaseFieldOption } from "@pipelab/shared";
import { useAPI } from "../composables/api";
import ReleaseFieldControl from "./ReleaseFieldControl.vue";

const props = defineProps<{ visible: boolean; projectId: string }>();
const emit = defineEmits<{ "update:visible": [value: boolean]; create: [flow: ReleaseConfig] }>();
const api = useAPI();
const visible = computed({
  get: () => props.visible,
  set: (value) => emit("update:visible", value),
});
const steps = [
  { value: "details", label: "Details", number: "01" },
  { value: "source", label: "Source", number: "02" },
  { value: "destinations", label: "Destinations", number: "03" },
  { value: "review", label: "Review", number: "04" },
];
const step = ref("details");
const catalog = ref<ReleaseCatalog>({
  buildTypes: [],
  sources: [],
  producers: [],
  destinations: [],
});
const draft = ref<{
  name: string;
  description: string;
  source: ReleaseConfig["source"];
  destinations: ReleaseConfig["destinations"];
}>({ name: "", description: "", source: { provider: "", config: {} }, destinations: [] });
const inspectionOptions = ref<Record<string, ReleaseFieldOption[]>>({});
const sourceDefinition = computed(() =>
  catalog.value.sources.find((source) => source.id === draft.value.source.provider),
);
const sourceReady = computed(() =>
  Boolean(
    draft.value.source.provider &&
    sourceDefinition.value?.fields?.every(
      (field) => !field.required || String(draft.value.source.config[field.key] || "").trim(),
    ),
  ),
);
const providerIcon = (icon?: IconType) =>
  icon?.type === "icon"
    ? icon.icon.includes("mdi")
      ? icon.icon
      : `mdi ${icon.icon}`
    : "mdi mdi-puzzle-outline";
const destinationLabel = (id: string) =>
  catalog.value.destinations.find((item) => item.id === id)?.label || id;
const hasDestination = (id: string) =>
  draft.value.destinations.some((item) => item.provider === id);
const fieldOptions = (key: string, fallback: ReleaseFieldOption[]) =>
  inspectionOptions.value[key] || fallback;
const chooseSource = async (provider: string) => {
  const definition = catalog.value.sources.find((source) => source.id === provider);
  if (!definition) return;
  draft.value.source = { provider, config: { ...definition.defaultConfig } };
  inspectionOptions.value = {};
  const result = await api.execute("release:source:inspect", {
    provider,
    config: draft.value.source.config,
  });
  if (result.type === "success") {
    const inspected = result.result as { fieldOptions?: Record<string, ReleaseFieldOption[]> };
    inspectionOptions.value = inspected.fieldOptions || {};
  }
};
const toggleDestination = (provider: string) => {
  const index = draft.value.destinations.findIndex((item) => item.provider === provider);
  if (index >= 0) draft.value.destinations.splice(index, 1);
  else {
    const definition = catalog.value.destinations.find((item) => item.id === provider);
    if (definition)
      draft.value.destinations.push({
        id: `${provider.split("/").pop()}-${nanoid(6)}`,
        provider,
        enabled: true,
        config: { ...definition.defaultConfig },
        slots: [{ id: "output", enabled: true, config: {} }],
      });
  }
};
const create = () => {
  emit("create", {
    version: "3.0.0",
    id: nanoid(),
    project: props.projectId,
    name: draft.value.name.trim(),
    description: draft.value.description.trim() || undefined,
    source: draft.value.source,
    builds: [],
    destinations: draft.value.destinations,
  });
  visible.value = false;
};
watch(
  () => props.visible,
  async (open) => {
    if (!open) return;
    step.value = "details";
    draft.value = {
      name: "",
      description: "",
      source: { provider: "", config: {} },
      destinations: [],
    };
    const result = await api.execute("release:catalog:get");
    if (result.type === "success") {
      catalog.value = result.result;
      if (catalog.value.sources[0]) await chooseSource(catalog.value.sources[0].id);
    }
  },
);
</script>

<style scoped>
.step {
  display: flex;
  gap: 7px;
  align-items: center;
  border: 0;
  border-bottom: 2px solid transparent;
  padding: 9px 10px;
  background: transparent;
  color: var(--p-text-muted-color, var(--text-color-secondary));
  font-size: 0.72rem;
  cursor: pointer;
}
.step[aria-selected="true"] {
  border-bottom-color: var(--primary-color);
  color: var(--text-color);
}
.step span {
  font-weight: 600;
}
.wizard-panel {
  display: grid;
  gap: 12px;
  padding: 20px 4px 4px;
}
.wizard-panel h2 {
  margin: 0;
  font-size: 1.2rem;
}
.wizard-panel p {
  margin: -4px 0 6px;
  color: var(--p-text-muted-color, var(--text-color-secondary));
  font-size: 0.8rem;
}
.eyebrow {
  color: var(--p-text-muted-color, var(--text-color-secondary));
  font-size: 0.68rem;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}
.form-grid,
.review-list {
  display: grid;
  gap: 12px;
}
.field {
  display: grid;
  gap: 5px;
}
.field label {
  font-size: 0.75rem;
  font-weight: 600;
}
.wide {
  grid-column: 1 / -1;
}
.choice-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(145px, 1fr));
  gap: 8px;
}
.choice-card {
  display: grid;
  gap: 5px;
  border: 1px solid var(--p-surface-200, var(--surface-border));
  border-radius: 8px;
  padding: 12px;
  background: transparent;
  color: var(--text-color);
  text-align: left;
  cursor: pointer;
}
.choice-card:hover,
.choice-card.selected {
  border-color: var(--primary-color);
  background: color-mix(in srgb, var(--primary-color) 7%, transparent);
}
.choice-card i {
  color: var(--primary-color);
  font-size: 20px;
}
.choice-card strong {
  font-size: 0.78rem;
}
.choice-card small {
  color: var(--p-text-muted-color, var(--text-color-secondary));
  font-size: 0.68rem;
}
.wizard-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 8px;
}
.review-list > div {
  display: flex;
  align-items: center;
  gap: 10px;
  border: 1px solid var(--p-surface-200, var(--surface-border));
  border-radius: 7px;
  padding: 9px;
}
.review-list i {
  color: var(--primary-color);
  font-size: 18px;
}
.review-list span {
  display: grid;
  gap: 2px;
}
.review-list small {
  color: var(--p-text-muted-color, var(--text-color-secondary));
  font-size: 0.68rem;
}
.review-list strong {
  font-size: 0.8rem;
}
.review-copy {
  padding: 8px 10px;
  border-left: 3px solid var(--primary-color);
  background: var(--p-surface-50, var(--surface-ground));
}
</style>
