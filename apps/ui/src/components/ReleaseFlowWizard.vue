<template>
  <Dialog
    v-model:visible="visible"
    modal
    header="New release"
    :style="{ width: '720px', maxWidth: '96vw' }"
  >
    <p v-if="!isReady" role="status">Reconnect the agent to continue setting up this workflow.</p>
    <p v-else-if="catalogLoading" role="status">Loading workflow options…</p>
    <div v-else-if="catalogError" role="alert">
      <p>{{ catalogError }}</p>
      <Button label="Retry" text @click="loadCatalog" />
    </div>
    <Stepper
      v-model:value="step"
      linear
      :inert="!isReady || catalogLoading || Boolean(catalogError)"
    >
      <StepList>
        <Step
          v-for="item in steps"
          :key="item.value"
          :value="item.value"
          asChild
          v-slot="{ activateCallback, a11yAttrs }"
        >
          <button class="step" v-bind="a11yAttrs.header" @click="activateCallback">
            {{ item.number }} <span>{{ item.label }}</span>
          </button>
        </Step>
      </StepList>
      <StepPanels>
        <StepPanel value="details">
          <div class="wizard-panel">
            <span class="eyebrow">Release setup</span>
            <h2>Name + source</h2>
            <div class="form-grid">
              <div class="field wide">
                <label for="release-name">Name</label>
                <InputText id="release-name" v-model="draft.name" autofocus />
              </div>
            </div>
            <h3>What are you releasing?</h3>
            <div class="choice-grid">
              <button
                v-for="source in catalog.sources"
                :key="source.id"
                type="button"
                class="choice-card"
                :class="{ selected: draft.source.provider === source.id }"
                :aria-pressed="draft.source.provider === source.id"
                @click="chooseSource(source.id)"
              >
                <i :class="providerIcon(source.icon)" aria-hidden="true" />
                <strong>{{ source.label }}</strong>
                <small>{{ source.description || source.output.kind }}</small>
              </button>
            </div>
            <p v-if="!draft.source.provider" class="helper-copy">Choose a source to continue.</p>
            <template v-if="sourceDefinition">
              <ReleaseFieldControl
                v-for="field in sourceDefinition.fields?.filter((item) => !item.deferUntilEditor) ||
                []"
                :key="field.key"
                :field="field"
                :value="String(draft.source.config[field.key] || '')"
                :options="field.options || []"
                :issues="[]"
                :input-id="`wizard-source-${field.key}`"
                @update:value="setSourceField(field.key, $event)"
              />
            </template>
            <div class="wizard-actions">
              <Button
                label="Continue"
                icon="pi pi-arrow-right"
                iconPos="right"
                :disabled="!canContinueDetails"
                @click="step = releaseWizardNextStep(step)"
              />
            </div>
          </div>
        </StepPanel>
        <StepPanel value="destinations">
          <div class="wizard-panel">
            <span class="eyebrow">Where do you want to ship?</span>
            <h2>Destinations</h2>
            <p>Choose where this release should be delivered.</p>
            <div class="choice-grid">
              <button
                v-for="destination in catalog.destinations"
                :key="destination.id"
                type="button"
                class="choice-card"
                :class="{ selected: hasDestination(destination.id) }"
                :aria-pressed="hasDestination(destination.id)"
                @click="toggleDestination(destination.id)"
              >
                <i :class="providerIcon(destination.icon)" aria-hidden="true" />
                <strong>{{ destination.label }}</strong>
                <small>{{ destination.description || "Destination" }}</small>
              </button>
            </div>
            <div class="wizard-actions">
              <Button
                label="Back"
                text
                severity="secondary"
                @click="step = releaseWizardPreviousStep(step)"
              />
              <Button
                label="Continue"
                icon="pi pi-arrow-right"
                iconPos="right"
                :disabled="!draft.destinations.length"
                @click="step = releaseWizardNextStep(step)"
              />
            </div>
          </div>
        </StepPanel>
        <StepPanel value="recap">
          <div class="wizard-panel">
            <span class="eyebrow">Review release</span>
            <h2>Recap</h2>
            <div class="review-list">
              <div>
                <i class="mdi mdi-tag-outline" aria-hidden="true" />
                <span
                  ><small>Name</small><strong>{{ recap.name }}</strong></span
                >
              </div>
              <div>
                <i class="mdi mdi-source-branch" aria-hidden="true" />
                <span>
                  <small>Source</small>
                  <strong>{{ recap.sourceLabel }}</strong>
                  <small
                    v-for="detail in recap.sourceDetails"
                    :key="detail.label"
                    class="review-detail"
                  >
                    {{ detail.label }}: {{ detail.value }}
                  </small>
                </span>
              </div>
              <div>
                <i class="mdi mdi-cloud-upload-outline" aria-hidden="true" />
                <span
                  ><small>Destinations</small
                  ><strong>{{ recap.destinationLabels.join(" · ") }}</strong></span
                >
              </div>
            </div>
            <p class="helper-copy">
              You can configure builds and destination details after creation.
            </p>
            <div v-if="createError" class="wizard-create-error" role="alert">
              <span>{{ createError }}</span>
              <Button label="Retry" text @click="create" />
            </div>
            <div class="wizard-actions">
              <Button
                label="Back"
                text
                severity="secondary"
                @click="step = releaseWizardPreviousStep(step)"
              />
              <Button
                :label="createPending ? 'Creating workflow…' : 'Create workflow'"
                icon="mdi mdi-rocket-launch-outline"
                :disabled="!isReady || !canContinueDestinations || createPending"
                @click="create"
              />
            </div>
          </div>
        </StepPanel>
      </StepPanels>
    </Stepper>
  </Dialog>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, toRaw, watch } from "vue";
import Dialog from "primevue/dialog";
import Stepper from "primevue/stepper";
import StepList from "primevue/steplist";
import Step from "primevue/step";
import StepPanels from "primevue/steppanels";
import StepPanel from "primevue/steppanel";
import InputText from "primevue/inputtext";
import Button from "primevue/button";
import { nanoid } from "nanoid";
import type { IconType, ReleaseCatalog, ReleaseConfig } from "@pipelab/shared";
import { useAPI } from "../composables/api";
import { useAgentAvailability } from "../composables/useAgentAvailability";
import ReleaseFieldControl from "./ReleaseFieldControl.vue";
import {
  buildReleaseWizardConfig,
  createReleaseWizardDraft,
  releaseWizardCanReview,
  releaseWizardDestination,
  releaseWizardNextStep,
  releaseWizardPreviousStep,
  releaseWizardRecap,
  releaseWizardSourceIsReady,
  RELEASE_WIZARD_STEPS,
  type ReleaseWizardStep,
} from "./ReleaseFlowWizard-state";

const props = defineProps<{ visible: boolean; projectId: string }>();
const emit = defineEmits<{ "update:visible": [value: boolean]; create: [flow: ReleaseConfig] }>();
const api = useAPI();
const { isReady } = useAgentAvailability();
const catalogLoading = ref(false);
const catalogError = ref("");
let catalogRequest = 0;
let createRequest = 0;
const createPending = ref(false);
const createError = ref("");
const visible = computed({
  get: () => props.visible,
  set: (value) => emit("update:visible", value),
});
const stepLabels: Record<ReleaseWizardStep, string> = {
  details: "Name + source",
  destinations: "Destinations",
  recap: "Recap",
};
const steps = RELEASE_WIZARD_STEPS.map((value, index) => ({
  value,
  label: stepLabels[value],
  number: `0${index + 1}`,
}));
const step = ref<ReleaseWizardStep>("details");
const workflowId = ref("");
const catalog = ref<ReleaseCatalog>({
  buildTypes: [],
  sources: [],
  producers: [],
  destinations: [],
});
const draft = ref(createReleaseWizardDraft());
const sourceDefinition = computed(() =>
  catalog.value.sources.find((source) => source.id === draft.value.source.provider),
);
const canContinueDetails = computed(
  () =>
    Boolean(draft.value.name.trim()) &&
    releaseWizardSourceIsReady(draft.value.source, catalog.value),
);
const canContinueDestinations = computed(() => releaseWizardCanReview(draft.value, catalog.value));
const recap = computed(() => releaseWizardRecap(draft.value, catalog.value));
const providerIcon = (icon?: IconType) =>
  icon?.type === "icon"
    ? icon.icon.includes("mdi")
      ? icon.icon
      : `mdi ${icon.icon}`
    : "mdi mdi-puzzle-outline";
const hasDestination = (id: string) =>
  draft.value.destinations.some((item) => item.provider === id);
const chooseSource = (provider: string) => {
  const definition = catalog.value.sources.find((source) => source.id === provider);
  if (definition)
    draft.value.source = { provider, config: structuredClone(toRaw(definition.defaultConfig)) };
};
const setSourceField = (key: string, value: unknown) => {
  draft.value.source.config[key] = value;
};
const toggleDestination = (provider: string) => {
  const index = draft.value.destinations.findIndex((item) => item.provider === provider);
  if (index >= 0) draft.value.destinations.splice(index, 1);
  else {
    const destination = releaseWizardDestination(provider, toRaw(catalog.value));
    if (destination) draft.value.destinations.push(destination);
  }
};
const invalidateCreateRequest = () => {
  createRequest++;
  createPending.value = false;
};
onBeforeUnmount(() => {
  catalogRequest++;
  invalidateCreateRequest();
});
const create = async () => {
  if (!isReady.value || !canContinueDestinations.value || createPending.value) return;
  const requestId = ++createRequest;
  const isCurrent = () => requestId === createRequest;
  const config = buildReleaseWizardConfig(toRaw(draft.value), props.projectId, workflowId.value);
  createPending.value = true;
  createError.value = "";

  try {
    const result = await api.execute("release:resolve-defaults", { config });
    if (!isCurrent() || !visible.value || !isReady.value) return;
    if (result.type === "error") throw new Error(result.ipcError);
    emit("create", result.result);
    visible.value = false;
  } catch (error) {
    if (!isCurrent() || !visible.value || !isReady.value) return;
    createError.value =
      error instanceof Error ? error.message : "Unable to prepare workflow defaults.";
  } finally {
    if (isCurrent()) createPending.value = false;
  }
};
const loadCatalog = async () => {
  if (!isReady.value || !props.visible) return;
  const requestId = ++catalogRequest;
  catalogLoading.value = true;
  catalogError.value = "";
  try {
    const result = await api.execute("release:catalog:get");
    if (requestId !== catalogRequest || !props.visible || !isReady.value) return;
    if (result.type === "error") throw new Error(result.ipcError);
    catalog.value = result.result;
  } catch (error) {
    if (requestId === catalogRequest)
      catalogError.value =
        error instanceof Error ? error.message : "Unable to load workflow options.";
  } finally {
    if (requestId === catalogRequest) catalogLoading.value = false;
  }
};
watch(
  isReady,
  (ready) => {
    if (ready && props.visible) void loadCatalog();
    if (!ready) {
      catalogRequest++;
      catalogLoading.value = false;
      invalidateCreateRequest();
      createError.value = "";
    }
  },
  { flush: "sync" },
);
watch(
  draft,
  () => {
    if (createPending.value) invalidateCreateRequest();
  },
  { deep: true, flush: "sync" },
);
watch(
  step,
  () => {
    if (createPending.value) invalidateCreateRequest();
  },
  { flush: "sync" },
);
watch(
  () => props.visible,
  async (open) => {
    if (!open) {
      catalogRequest++;
      invalidateCreateRequest();
      createError.value = "";
      return;
    }
    step.value = "details";
    workflowId.value = nanoid();
    draft.value = createReleaseWizardDraft();
    createError.value = "";
    await loadCatalog();
  },
  { immediate: true, flush: "sync" },
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
.wizard-panel h3 {
  margin: 2px 0 -4px;
  font-size: 0.9rem;
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
.review-detail {
  margin-top: 3px;
}
.helper-copy {
  color: var(--p-text-muted-color, var(--text-color-secondary));
  font-size: 0.75rem;
}
</style>
