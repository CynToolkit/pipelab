<template>
  <Dialog
    v-model:visible="visible"
    class="pl-dialog pl-workflow"
    modal
    header="New workflow"
    :style="{ width: '720px', maxWidth: '96vw' }"
  >
    <p v-if="!isReady && !isBrowser" role="status">
      Reconnect the agent to continue setting up this workflow.
    </p>
    <p v-else-if="catalogLoading" role="status">Loading workflow options…</p>
    <div v-else-if="catalogError" role="alert">
      <p>{{ catalogError }}</p>
      <Button label="Retry" text @click="loadCatalog" />
    </div>
    <Stepper
      v-model:value="step"
      :linear="!isBrowser"
      :inert="catalogLoading || (!isBrowser && (!isReady || Boolean(catalogError)))"
    >
      <StepList class="wizard-step-list" aria-label="Wizard steps">
        <Step
          v-for="item in steps"
          :key="item.value"
          :value="item.value"
          asChild
          v-slot="{ active }"
        >
          <div
            class="step"
            :class="{ done: isStepDone(item.value) }"
            :aria-current="active ? 'step' : undefined"
          >
            <span class="step-index"
              ><i v-if="isStepDone(item.value)" class="pi pi-check" aria-hidden="true" /><template
                v-else
                >{{ item.index }}</template
              ></span
            >
            <span class="step-label">{{ item.label }}</span>
          </div>
        </Step>
      </StepList>
      <StepPanels>
        <StepPanel value="details">
          <div class="wizard-panel">
            <h2>Name your workflow</h2>
            <div class="field wide">
              <label for="release-name">Name</label>
              <InputText id="release-name" v-model="draft.name" />
            </div>
            <div class="field wide">
              <label for="release-description">Description</label>
              <Textarea id="release-description" v-model="draft.description" rows="3" />
            </div>
            <div class="wizard-actions">
              <Button
                label="Continue"
                icon="pi pi-arrow-right"
                iconPos="right"
                :disabled="!canContinueDetails"
                @click="step = releaseWizardNextStep(step, activeSteps)"
              />
            </div>
          </div>
        </StepPanel>
        <StepPanel value="source">
          <div class="wizard-panel">
            <h2>Choose a source</h2>
            <div class="choice-grid source-grid">
              <button
                v-for="source in catalog.sources"
                :key="source.id"
                type="button"
                class="choice-card"
                :class="{ selected: draft.source.provider === source.id }"
                :aria-pressed="draft.source.provider === source.id"
                @click="chooseSource(source.id)"
              >
                <img
                  v-if="providerIconImage(sourceIcon(source))"
                  :src="providerIconImage(sourceIcon(source))"
                  alt=""
                />
                <i v-else :class="providerIconClass(sourceIcon(source))" aria-hidden="true" />
                <strong>{{ source.label }}</strong>
              </button>
            </div>
            <template v-if="sourceDefinition">
              <template v-for="field in wizardFields(sourceDefinition.fields)" :key="field.key">
                <ReleaseFieldControl
                  :field="field"
                  :value="String(draft.source.config[field.key] || '')"
                  :options="field.options || []"
                  :issues="[]"
                  :input-id="`wizard-source-${field.key}`"
                  :allow-path-edit="isOfflineBrowserDraft"
                  hide-advanced
                  @update:value="setSourceField(field.key, $event)"
                />
              </template>
            </template>
            <div class="wizard-actions">
              <Button
                label="Back"
                text
                severity="secondary"
                @click="step = releaseWizardPreviousStep(step, activeSteps)"
              />
              <Button
                label="Continue"
                icon="pi pi-arrow-right"
                iconPos="right"
                :disabled="!canContinueSource"
                @click="step = releaseWizardNextStep(step, activeSteps)"
              />
            </div>
          </div>
        </StepPanel>
        <StepPanel value="destinations">
          <div class="wizard-panel">
            <h2>Where do you want to ship?</h2>
            <div class="destination-grid">
              <button
                v-for="destination in catalog.destinations"
                :key="destination.id"
                type="button"
                class="destination-card"
                :class="{ selected: hasDestination(destination.id) }"
                :aria-pressed="hasDestination(destination.id)"
                @click="toggleDestination(destination.id)"
              >
                <img
                  v-if="providerIconImage(destinationIcon(destination.id, destination.icon))"
                  :src="providerIconImage(destinationIcon(destination.id, destination.icon))"
                  alt=""
                />
                <i
                  v-else
                  :class="providerIconClass(destinationIcon(destination.id, destination.icon))"
                  aria-hidden="true"
                />
                <strong>{{ destination.label }}</strong>
                <i
                  v-if="hasDestination(destination.id)"
                  class="pi pi-check-circle"
                  aria-hidden="true"
                />
              </button>
            </div>
            <div class="wizard-actions">
              <Button
                label="Back"
                text
                severity="secondary"
                @click="step = releaseWizardPreviousStep(step, activeSteps)"
              />
              <Button
                label="Continue"
                icon="pi pi-arrow-right"
                iconPos="right"
                :disabled="!canContinueDestinations"
                @click="step = releaseWizardNextStep(step, activeSteps)"
              />
            </div>
          </div>
        </StepPanel>
        <StepPanel value="recap">
          <div class="wizard-panel">
            <h2>Review and create</h2>
            <div class="review-card">
              <div class="review-title">
                <strong>{{ recap.name }}</strong>
                <small v-if="recap.description">{{ recap.description }}</small>
              </div>
              <div class="review-section">
                <span class="review-label">Source</span>
                <span class="review-item">
                  <img
                    v-if="providerIconImage(sourceIcon(sourceDefinition))"
                    :src="providerIconImage(sourceIcon(sourceDefinition))"
                    alt=""
                  />
                  <i
                    v-else
                    :class="providerIconClass(sourceIcon(sourceDefinition))"
                    aria-hidden="true"
                  />
                  <span class="review-item-text">
                    <strong>{{ recap.sourceLabel }}</strong>
                    <small v-if="recap.sourcePath">{{ recap.sourcePath }}</small>
                  </span>
                </span>
              </div>
              <div class="review-section">
                <span class="review-label">Destinations</span>
                <span class="review-chips">
                  <span
                    v-for="destination in recap.destinations"
                    :key="destination.provider"
                    class="review-chip"
                  >
                    <img
                      v-if="
                        providerIconImage(destinationIcon(destination.provider, destination.icon))
                      "
                      :src="
                        providerIconImage(destinationIcon(destination.provider, destination.icon))
                      "
                      alt=""
                    />
                    <i
                      v-else
                      :class="
                        providerIconClass(destinationIcon(destination.provider, destination.icon))
                      "
                      aria-hidden="true"
                    />
                    {{ destination.label }}
                  </span>
                </span>
              </div>
            </div>
            <p v-if="invalidEnvironmentBindingCount" class="review-error" role="alert">
              Fix invalid environment variable names before creating this workflow.
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
                @click="step = releaseWizardPreviousStep(step, activeSteps)"
              />
              <Button
                :label="createPending ? 'Creating workflow…' : 'Create workflow'"
                icon="mdi mdi-rocket-launch-outline"
                :disabled="!canCreate"
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
import Textarea from "primevue/textarea";
import Button from "primevue/button";
import { nanoid } from "nanoid";
import type { IconType, ReleaseConfig, ReleaseFieldDefinition } from "@pipelab/shared";
import { useAPI } from "../composables/api";
import { useAgentAvailability } from "../composables/useAgentAvailability";
import { uiEnvironment } from "../composables/ui-runtime";
import { useAppStore } from "../store/app";
import {
  destinationIcon as resolveDestinationIcon,
  providerIconClass,
  providerIconImage,
  sourceIcon as resolveSourceIcon,
} from "../utils/provider-icons";
import ReleaseFieldControl from "./ReleaseFieldControl.vue";

const wizardFields = (fields?: ReleaseFieldDefinition[]) =>
  fields?.filter((field) => field.showInWizard) ?? [];
import { invalidEnvironmentBindingPaths } from "../utils/environment-bindings";
import {
  buildReleaseWizardConfig,
  chooseReleaseWizardSource,
  createReleaseWizardDraft,
  releaseWizardCanContinueDetails,
  releaseWizardCanCreate,
  releaseWizardCanReview,
  releaseWizardDestination,
  releaseWizardNextStep,
  releaseWizardPreviousStep,
  releaseWizardRecap,
  releaseWizardIsOfflineBrowserDraft,
  releaseWizardSourceIsReady,
  suggestReleaseWizardConnectionAliases,
  releaseWizardTargetAvailability,
  RELEASE_WIZARD_STEPS,
  type ReleaseWizardStep,
} from "./ReleaseFlowWizard-state";

const props = defineProps<{ visible: boolean; projectId?: string }>();
const emit = defineEmits<{
  "update:visible": [value: boolean];
  create: [flow: ReleaseConfig];
}>();
const api = useAPI();
const appStore = useAppStore();
const { isReady } = useAgentAvailability();
const isBrowser = uiEnvironment === "browser";
const isOfflineBrowserDraft = computed(() =>
  releaseWizardIsOfflineBrowserDraft(isBrowser, isReady.value),
);
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
  details: "Name & description",
  source: "Source & project path",
  destinations: "Destinations",
  recap: "Review",
};
const activeSteps = RELEASE_WIZARD_STEPS;
const steps = activeSteps.map((value, index) => ({
  value,
  label: stepLabels[value],
  index: index + 1,
}));
const step = ref<ReleaseWizardStep>("details");
const isStepDone = (value: ReleaseWizardStep) =>
  activeSteps.indexOf(value) < activeSteps.indexOf(step.value);
const workflowId = ref("");
const catalog = computed(() => appStore.releaseCatalog);
const draft = ref(createReleaseWizardDraft());
const sourceDefinition = computed(() =>
  catalog.value.sources.find((source) => source.id === draft.value.source.provider),
);
const canContinueDetails = computed(() => releaseWizardCanContinueDetails(draft.value));
const canContinueSource = computed(() =>
  isOfflineBrowserDraft.value
    ? Boolean(draft.value.source.provider)
    : releaseWizardSourceIsReady(draft.value.source, catalog.value),
);
const canContinueDestinations = computed(() =>
  isOfflineBrowserDraft.value
    ? Boolean(
        draft.value.name.trim() && draft.value.source.provider && draft.value.destinations.length,
      )
    : releaseWizardCanReview(draft.value, catalog.value),
);
const invalidEnvironmentBindingCount = computed(
  () => invalidEnvironmentBindingPaths(draft.value).length,
);
const canCreate = computed(() =>
  releaseWizardCanCreate({
    isReady: isReady.value,
    projectId: props.projectId,
    canContinueDestinations: canContinueDestinations.value,
    createPending: createPending.value,
    invalidEnvironmentBindingCount: invalidEnvironmentBindingCount.value,
  }),
);
const recap = computed(() => releaseWizardRecap(draft.value, catalog.value));
const sourceIcon = (source?: (typeof catalog.value.sources)[number]) =>
  resolveSourceIcon(appStore.providerDefinitions, source);
const destinationIcon = (id: string, icon?: IconType) =>
  resolveDestinationIcon(appStore.providerDefinitions, id, icon);
const hasDestination = (id: string) =>
  draft.value.destinations.some((item) => item.provider === id);
const chooseSource = (provider: string) => {
  chooseReleaseWizardSource(draft.value, provider, toRaw(catalog.value));
};
const toggleDestination = (provider: string) => {
  const index = draft.value.destinations.findIndex((item) => item.provider === provider);
  if (index >= 0) draft.value.destinations.splice(index, 1);
  else {
    const destination = releaseWizardDestination(provider, toRaw(catalog.value), draft.value);
    if (destination) draft.value.destinations.push(destination);
    suggestReleaseWizardConnectionAliases(draft.value, toRaw(catalog.value));
  }
};
const setSourceField = (key: string, value: unknown) => {
  draft.value.source.config[key] = value;
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
  const projectId = props.projectId;
  if (!projectId || !canCreate.value) return;
  const requestId = ++createRequest;
  const isCurrent = () => requestId === createRequest;
  const config = buildReleaseWizardConfig(
    toRaw(draft.value),
    projectId,
    workflowId.value,
    toRaw(catalog.value),
  );
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
  if (!props.visible) return;
  catalogError.value = "";
  if (!isReady.value) return;
  const requestId = ++catalogRequest;
  catalogLoading.value = true;
  catalogError.value = "";
  try {
    await appStore.loadReleaseCatalog();
    if (requestId !== catalogRequest || !props.visible || !isReady.value) return;
  } catch (error) {
    if (requestId === catalogRequest)
      catalogError.value =
        error instanceof Error ? error.message : "Unable to load workflow options.";
  } finally {
    if (requestId === catalogRequest) catalogLoading.value = false;
  }
};
const loadProviderMetadata = () => {
  if (isReady.value && props.visible)
    void appStore.loadProviderDefinitions().catch(() => undefined);
};
watch(
  isReady,
  (ready) => {
    if (ready && props.visible) {
      loadProviderMetadata();
      void loadCatalog();
    }
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
    loadProviderMetadata();
    await loadCatalog();
  },
  { immediate: true, flush: "sync" },
);
</script>

<style scoped>
/* ── Stepper ────────────────────────────────────────────────────── */
.wizard-step-list {
  display: flex;
  align-items: center;
  gap: 0;
  padding: 4px 0 18px;
  border-bottom: 1px solid var(--pl-border);
}
.step {
  display: flex;
  flex: 1 1 auto;
  align-items: center;
  gap: 10px;
  min-width: 0;
  color: var(--pl-muted);
  font-size: 0.8rem;
  font-weight: 500;
  white-space: nowrap;
  cursor: default;
  user-select: none;
}
.step:last-child {
  flex: 0 0 auto;
}
.step::after {
  content: "";
  flex: 1 1 24px;
  min-width: 16px;
  height: 2px;
  margin: 0 12px 0 2px;
  border-radius: 2px;
  background: var(--pl-border);
  transition: background 0.3s var(--pl-ease);
}
.step:last-child::after {
  display: none;
}
.step-index {
  display: grid;
  place-items: center;
  flex: 0 0 auto;
  width: 26px;
  height: 26px;
  border: 1.5px solid var(--pl-border-strong);
  border-radius: 50%;
  background: var(--pl-card);
  font-size: 0.72rem;
  font-weight: 650;
  transition:
    background 0.2s var(--pl-ease),
    border-color 0.2s var(--pl-ease),
    color 0.2s var(--pl-ease),
    box-shadow 0.2s var(--pl-ease);
}
.step-index i {
  font-size: 0.68rem;
}
.step[aria-current="step"] {
  color: var(--p-text-color);
  font-weight: 650;
}
.step[aria-current="step"] .step-index {
  border-color: var(--pl-accent);
  background: var(--pl-accent);
  color: var(--p-primary-contrast-color, #fff);
  box-shadow: var(--pl-ring);
}
.step.done {
  color: var(--p-text-color);
}
.step.done .step-index {
  border-color: var(--pl-accent);
  background: color-mix(in srgb, var(--pl-accent) 10%, var(--pl-card));
  color: var(--pl-accent);
}
.step.done::after {
  background: var(--pl-accent);
}

/* ── Panels ─────────────────────────────────────────────────────── */
.wizard-panel {
  display: grid;
  gap: 16px;
  padding: 24px 0 0;
  animation: pl-step-in 0.22s var(--pl-ease);
}
@keyframes pl-step-in {
  from {
    opacity: 0;
    transform: translateY(6px);
  }
}
.wizard-panel h2 {
  margin: 0;
  font-size: 1.3rem;
  font-weight: 650;
  letter-spacing: -0.025em;
}
.wizard-panel h3 {
  margin: 2px 0 -4px;
  font-size: 0.9rem;
}
.wizard-panel p {
  margin: -10px 0 4px;
  color: var(--pl-muted);
  font-size: 0.88rem;
}
.eyebrow {
  color: var(--pl-muted);
  font-size: 0.68rem;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
.form-grid {
  display: grid;
  gap: 16px;
}
.field {
  display: grid;
  gap: 7px;
}
.field label {
  font-size: 0.78rem;
  font-weight: 600;
}
.wide {
  grid-column: 1 / -1;
}
.wizard-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 12px;
  padding-top: 18px;
  border-top: 1px solid var(--pl-border);
}

/* ── Selectable cards ───────────────────────────────────────────── */
.choice-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
}
.choice-card,
.destination-card {
  position: relative;
  border: 1px solid var(--pl-border);
  border-radius: 12px;
  background: var(--pl-card);
  color: var(--p-text-color);
  text-align: left;
  cursor: pointer;
  transition:
    border-color 0.15s var(--pl-ease),
    background 0.15s var(--pl-ease),
    box-shadow 0.2s var(--pl-ease),
    transform 0.15s var(--pl-ease);
}
.choice-card:hover,
.destination-card:hover {
  border-color: var(--pl-border-strong);
  background: var(--pl-sunken);
  box-shadow: var(--pl-shadow-sm);
}
.choice-card:focus-visible,
.destination-card:focus-visible {
  outline: none;
  border-color: var(--pl-accent);
  box-shadow: var(--pl-ring);
}
.choice-card.selected,
.destination-card.selected {
  border-color: var(--pl-accent);
  background: color-mix(in srgb, var(--pl-accent) 5%, var(--pl-card));
  box-shadow:
    0 0 0 1px var(--pl-accent),
    var(--pl-shadow-sm);
}
.choice-card.selected::after {
  content: "\e909";
  position: absolute;
  top: 10px;
  right: 10px;
  display: grid;
  place-items: center;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: var(--pl-accent);
  color: var(--p-primary-contrast-color, #fff);
  font-family: primeicons;
  font-size: 0.6rem;
}
.choice-card {
  display: grid;
  gap: 6px;
  padding: 16px 14px 14px;
}
.choice-card i,
.choice-card img {
  width: 36px;
  height: 36px;
  margin-bottom: 4px;
  padding: 7px;
  border: 1px solid var(--pl-border);
  border-radius: 10px;
  background: var(--pl-card);
  box-shadow: var(--pl-shadow-xs);
  box-sizing: border-box;
}
.choice-card i {
  display: grid;
  place-items: center;
  color: var(--pl-accent);
  font-size: 18px;
}
.choice-card img {
  object-fit: contain;
}
.choice-card strong {
  font-size: 0.86rem;
  font-weight: 600;
  letter-spacing: -0.01em;
}
.choice-card small {
  color: var(--pl-muted);
  font-size: 0.74rem;
}
.destination-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}
.destination-card {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
  padding: 12px 14px;
}
.destination-card > img,
.destination-card > i:first-child {
  display: grid;
  place-items: center;
  flex: 0 0 auto;
  width: 36px;
  height: 36px;
  padding: 7px;
  border: 1px solid var(--pl-border);
  border-radius: 10px;
  background: var(--pl-card);
  box-shadow: var(--pl-shadow-xs);
  box-sizing: border-box;
}
.destination-card > img {
  object-fit: contain;
}
.destination-card > i:first-child {
  color: var(--pl-accent);
  font-size: 18px;
}
.destination-card strong {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  font-size: 0.86rem;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.destination-card > i:last-child:not(:first-child) {
  color: var(--pl-accent);
  font-size: 1.1rem;
}

/* ── Review ─────────────────────────────────────────────────────── */
.review-card {
  display: grid;
  border: 1px solid var(--pl-border);
  border-radius: var(--pl-radius);
  background: var(--pl-card);
  box-shadow: var(--pl-shadow-xs);
}
.review-card > div {
  display: grid;
  gap: 8px;
  padding: 16px 18px;
}
.review-card > div + div {
  border-top: 1px solid var(--pl-border);
}
.review-title {
  background: var(--pl-sunken);
  border-radius: var(--pl-radius) var(--pl-radius) 0 0;
}
.review-title strong {
  font-size: 1.05rem;
  font-weight: 650;
  letter-spacing: -0.015em;
}
.review-title small,
.review-item-text small {
  color: var(--pl-muted);
  font-size: 0.76rem;
  overflow-wrap: anywhere;
}
.review-label {
  color: var(--pl-muted);
  font-size: 0.68rem;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
.review-item {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}
.review-item > img,
.review-chip > img {
  flex: 0 0 auto;
  width: 22px;
  height: 22px;
  object-fit: contain;
}
.review-item > i,
.review-chip > i {
  color: var(--pl-accent);
  font-size: 20px;
}
.review-item-text {
  display: grid;
  gap: 2px;
  min-width: 0;
}
.review-item-text strong {
  font-size: 0.88rem;
  font-weight: 600;
}
.review-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.review-chip {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  border: 1px solid var(--pl-border);
  border-radius: 999px;
  padding: 5px 13px 5px 9px;
  background: var(--pl-sunken);
  font-size: 0.8rem;
  font-weight: 600;
}
.review-chip > i {
  font-size: 16px;
}
.review-error {
  color: var(--red-500, #ef4444) !important;
}
.wizard-create-error {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 14px;
  border: 1px solid color-mix(in srgb, var(--red-500, #ef4444) 35%, transparent);
  border-radius: 10px;
  color: var(--red-500, #ef4444);
  background: color-mix(in srgb, var(--red-500, #ef4444) 7%, var(--pl-card));
  font-size: 0.82rem;
}
.helper-copy {
  color: var(--pl-muted);
  font-size: 0.78rem;
}
@media (max-width: 640px) {
  .wizard-step-list {
    overflow-x: auto;
    scrollbar-width: none;
  }
  .step:not([aria-current="step"]) .step-label {
    display: none;
  }
  .choice-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .destination-grid {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
