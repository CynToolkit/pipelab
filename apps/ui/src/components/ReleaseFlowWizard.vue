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
              v-for="field in sourceDefinition?.fields?.filter((item) => !item.deferUntilEditor) ||
              []"
              :key="field.key"
              :field="field"
              :value="String(draft.source.config[field.key] || '')"
              :options="fieldOptions(field.key, field.options || [])"
              :input-id="`wizard-source-${field.key}`"
              @update:value="setSourceField(field.key, $event)"
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
              Choose where this release should be delivered. We’ll prepare a recommended build setup
              for these choices before creation.
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
                :disabled="!sourceReady || !draft.destinations.length"
                @click="activateCallback('review')"
              />
            </div></div
        ></StepPanel>
        <StepPanel value="review"
          ><div class="wizard-panel">
            <span class="eyebrow">Review release</span>
            <h2>{{ resolvedConfig?.name || draft.name }}</h2>
            <div v-if="resolutionState === 'resolving'" class="resolution-state" role="status">
              <i class="mdi mdi-progress-clock" aria-hidden="true" />
              Resolving recommended build setup…
            </div>
            <div
              v-else-if="resolutionState === 'error'"
              class="resolution-state resolution-error"
              role="alert"
            >
              <p>{{ resolutionError }}</p>
              <Button label="Retry" icon="pi pi-refresh" @click="resolveDefaults" />
            </div>
            <template v-else-if="resolvedConfig">
              <div class="review-list">
                <div>
                  <i class="mdi mdi-source-branch" aria-hidden="true" /><span
                    ><small>Source</small><strong>{{ reviewSourceLabel }}</strong></span
                  >
                </div>
                <div>
                  <i class="mdi mdi-cloud-upload-outline" aria-hidden="true" /><span
                    ><small>Destinations</small><strong>{{ reviewDestinationLabels }}</strong></span
                  >
                </div>
                <div v-for="summary in buildSummaries" :key="summary">
                  <i class="mdi mdi-hammer-wrench" aria-hidden="true" /><span
                    ><small>Recommended setup</small><strong>{{ summary }}</strong></span
                  >
                </div>
              </div>
              <p v-if="needsAdditionalBuildSetup" class="review-copy">
                Additional build setup required after creation.
              </p>
            </template>
            <div class="wizard-actions">
              <Button
                label="Back"
                text
                severity="secondary"
                @click="step = 'destinations'"
              /><Button
                label="Create release"
                icon="mdi mdi-rocket-launch-outline"
                :disabled="resolutionState !== 'ready' || !resolvedConfig"
                @click="create"
              />
            </div></div
        ></StepPanel>
      </StepPanels>
    </Stepper>
  </Dialog>
</template>

<script setup lang="ts">
import { computed, ref, toRaw, watch } from "vue";
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
import {
  buildReleaseWizardConfig,
  createReleaseWizardDraft,
  createWizardRequestRevision,
  releaseWizardBuildSummaries,
  releaseWizardCreationConfig,
  releaseWizardNeedsAdditionalBuildSetup,
  releaseWizardSourceIsReady,
  releaseWizardResolutionIsPlannerValid,
  type ReleaseWizardDraft,
  type ReleaseWizardResolutionState,
} from "./ReleaseFlowWizard-state";

const props = defineProps<{ visible: boolean; projectId: string }>();
const emit = defineEmits<{ "update:visible": [value: boolean]; create: [flow: ReleaseConfig] }>();
const api = useAPI();
const catalogRequests = createWizardRequestRevision();
const sourceInspectionRequests = createWizardRequestRevision();
const resolutionRequests = createWizardRequestRevision();
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
const workflowId = ref("");
const catalog = ref<ReleaseCatalog>({
  buildTypes: [],
  sources: [],
  producers: [],
  destinations: [],
});
const draft = ref<ReleaseWizardDraft>(createReleaseWizardDraft());
const inspectionOptions = ref<Record<string, ReleaseFieldOption[]>>({});
const resolutionState = ref<ReleaseWizardResolutionState>("idle");
const resolutionError = ref("");
const resolvedConfig = ref<ReleaseConfig>();
const sourceDefinition = computed(() =>
  catalog.value.sources.find((source) => source.id === draft.value.source.provider),
);
const sourceReady = computed(() => releaseWizardSourceIsReady(draft.value.source, catalog.value));
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
  const requestId = sourceInspectionRequests.next();
  const source = structuredClone(toRaw(draft.value.source));
  const result = await api.execute("release:source:inspect", source);
  if (
    !sourceInspectionRequests.isCurrent(requestId) ||
    JSON.stringify(source) !== JSON.stringify(draft.value.source)
  )
    return;
  if (result.type === "success") {
    const inspected = result.result as { fieldOptions?: Record<string, ReleaseFieldOption[]> };
    inspectionOptions.value = inspected.fieldOptions || {};
  }
};
const setSourceField = (key: string, value: unknown) => {
  sourceInspectionRequests.invalidate();
  draft.value.source.config[key] = value;
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
const reviewSourceLabel = computed(
  () =>
    catalog.value.sources.find((source) => source.id === resolvedConfig.value?.source.provider)
      ?.label ||
    resolvedConfig.value?.source.provider ||
    "Not selected",
);
const reviewDestinationLabels = computed(
  () =>
    resolvedConfig.value?.destinations.map((item) => destinationLabel(item.provider)).join(" · ") ||
    "",
);
const buildSummaries = computed(() =>
  resolvedConfig.value ? releaseWizardBuildSummaries(resolvedConfig.value, catalog.value) : [],
);
const needsAdditionalBuildSetup = computed(
  () =>
    Boolean(resolvedConfig.value) && releaseWizardNeedsAdditionalBuildSetup(resolvedConfig.value!),
);
const resolveDefaults = async () => {
  if (!sourceReady.value || !draft.value.destinations.length) {
    resolutionState.value = "error";
    resolutionError.value =
      "Choose a source, complete its required fields, and select at least one destination before reviewing.";
    resolvedConfig.value = undefined;
    return;
  }

  const requestId = resolutionRequests.next();
  const requestedConfig = buildReleaseWizardConfig(
    toRaw(draft.value),
    props.projectId,
    workflowId.value,
  );
  resolutionState.value = "resolving";
  resolutionError.value = "";
  resolvedConfig.value = undefined;

  try {
    const result = await api.execute("release:resolve-defaults", { config: requestedConfig });
    if (!resolutionRequests.isCurrent(requestId)) return;
    if (result.type === "error") throw new Error(result.ipcError);

    const config = structuredClone(result.result);
    const planResult = await api.execute("release:plan", { config });
    if (!resolutionRequests.isCurrent(requestId)) return;
    if (planResult.type === "error") throw new Error(planResult.ipcError);
    if (!releaseWizardResolutionIsPlannerValid(config, planResult.result))
      throw new Error(
        "The planner could not validate the recommended build setup. Retry to try again.",
      );

    resolvedConfig.value = config;
    resolutionState.value = "ready";
  } catch (error) {
    if (!resolutionRequests.isCurrent(requestId)) return;
    resolutionError.value =
      error instanceof Error ? error.message : "Unable to resolve build defaults.";
    resolutionState.value = "error";
  }
};
const create = () => {
  const config = releaseWizardCreationConfig(resolutionState.value, resolvedConfig.value);
  if (!config) return;
  emit("create", config);
  visible.value = false;
};
watch(
  draft,
  () => {
    resolutionRequests.invalidate();
    resolvedConfig.value = undefined;
    resolutionState.value = "idle";
    resolutionError.value = "";
  },
  { deep: true, flush: "sync" },
);
watch(step, (value) => {
  if (value === "review" && resolutionState.value === "idle") void resolveDefaults();
});
watch(
  () => props.visible,
  async (open) => {
    if (!open) {
      catalogRequests.invalidate();
      sourceInspectionRequests.invalidate();
      resolutionRequests.invalidate();
      return;
    }
    sourceInspectionRequests.invalidate();
    const requestId = catalogRequests.next();
    step.value = "details";
    workflowId.value = nanoid();
    draft.value = createReleaseWizardDraft();
    resolutionState.value = "idle";
    resolvedConfig.value = undefined;
    resolutionError.value = "";
    const result = await api.execute("release:catalog:get");
    if (!catalogRequests.isCurrent(requestId) || !props.visible) return;
    if (result.type === "success") {
      catalog.value = result.result;
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
.resolution-state {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--p-text-muted-color, var(--text-color-secondary));
  font-size: 0.8rem;
}
.resolution-error {
  align-items: flex-start;
  flex-direction: column;
  gap: 10px;
}
.resolution-error p {
  margin: 0;
  color: var(--p-red-600, #dc2626);
}
</style>
