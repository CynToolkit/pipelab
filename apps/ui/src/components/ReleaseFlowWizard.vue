<template>
  <Dialog
    v-model:visible="visible"
    modal
    header="New release"
    :style="{ width: '520px', maxWidth: '96vw' }"
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
            <h2>What are you releasing?</h2>
            <p>Choose the project or files this release represents.</p>
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
                <small>{{ sourceCaption(source) }}</small>
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
            <div class="field wide">
              <label for="release-name">Name</label>
              <InputText id="release-name" v-model="draft.name" />
              <small class="field-hint">This name will be used for your workflow.</small>
            </div>
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
            <h2>Where do you want to ship?</h2>
            <p>
              You can add one or more destinations. You can configure accounts and settings later.
            </p>
            <div class="destination-list">
              <button
                v-for="destination in catalog.destinations"
                :key="destination.id"
                type="button"
                class="destination-row"
                :class="{ selected: hasDestination(destination.id) }"
                :aria-pressed="hasDestination(destination.id)"
                @click="toggleDestination(destination.id)"
              >
                <span class="destination-selection" aria-hidden="true">
                  <i :class="hasDestination(destination.id) ? 'pi pi-check' : 'pi pi-circle'" />
                </span>
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
                <span class="destination-copy">
                  <strong>{{ destination.label }}</strong>
                  <small>{{ destination.description || "Ship your release" }}</small>
                </span>
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
            <h2>Review your choices</h2>
            <p class="review-intro">
              This will create your workflow. You can configure builds, connections, and destination
              details afterward.
            </p>
            <div class="review-list">
              <div>
                <span class="review-label">Name</span>
                <span
                  ><strong>{{ recap.name }}</strong></span
                >
              </div>
              <div>
                <span class="review-label">Source</span>
                <span class="review-value">
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
                  <span>
                    <strong>{{ recap.sourceLabel }}</strong>
                    <small v-if="recap.sourcePath" class="review-detail">{{
                      recap.sourcePath
                    }}</small>
                  </span>
                </span>
              </div>
              <div>
                <span class="review-label">Destinations ({{ recap.destinations.length }})</span>
                <span class="review-destinations">
                  <span
                    v-for="destination in recap.destinations"
                    :key="destination.provider"
                    class="review-destination"
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
                    <strong>{{ destination.label }}</strong>
                  </span>
                </span>
              </div>
            </div>
            <p class="review-notice">
              <i class="pi pi-info-circle" aria-hidden="true" />
              <span
                >Configuration, builds and connections can be set up after creation in the workflow
                Configuration.</span
              >
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
import { useAppStore } from "../store/app";
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
const emit = defineEmits<{
  "update:visible": [value: boolean];
  create: [flow: ReleaseConfig];
}>();
const api = useAPI();
const appStore = useAppStore();
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
  details: "Name & source",
  destinations: "Destinations",
  recap: "Review",
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
const providerIconClass = (icon?: IconType) => {
  if (icon?.type !== "icon") return "mdi mdi-puzzle-outline";
  if (icon.icon.includes("mdi ") || icon.icon.includes("pi ")) return icon.icon;
  if (icon.icon.startsWith("pi-")) return `pi ${icon.icon}`;
  return `mdi ${icon.icon}`;
};
const providerIconImage = (icon?: IconType) => (icon?.type === "image" ? icon.image : undefined);
const metadataIcon = (id: string) =>
  appStore.providerDefinitions.find(
    (provider) => id === provider.packageName || id.startsWith(`${provider.packageName}/`),
  )?.icon;
const sourceIcon = (source?: (typeof catalog.value.sources)[number]) => {
  if (!source) return undefined;
  if (source.icon) return source.icon;
  const icon = metadataIcon(source.id);
  if (icon) return icon;
  const file = source.fields?.find((field) => field.type === "file");
  if (file?.fileExtensions?.includes("c3p")) return { type: "icon", icon: "pi pi-clone" } as const;
  if (source.output.technology === "godot") return { type: "icon", icon: "pi pi-gamepad" } as const;
  if (source.output.platform === "web") return { type: "icon", icon: "pi pi-globe" } as const;
  if (file?.fileExtensions?.includes("zip")) return { type: "icon", icon: "pi pi-file" } as const;
  return { type: "icon", icon: "pi pi-folder" } as const;
};
const sourceCaption = (source: (typeof catalog.value.sources)[number]) => {
  if (source.description) return source.description;
  const file = source.fields?.find((field) => field.type === "file");
  if (file?.fileExtensions?.includes("c3p")) return "Construct .c3p";
  if (source.output.technology === "godot") return "Godot project";
  if (source.output.platform === "web")
    return file?.fileExtensions?.includes("zip") ? "A web app ZIP" : "A web app folder";
  if (file?.fileExtensions?.includes("zip")) return "A ZIP file";
  return "A local folder";
};
const destinationIcon = (id: string, icon?: IconType) => icon || metadataIcon(id);
const hasDestination = (id: string) =>
  draft.value.destinations.some((item) => item.provider === id);
const chooseSource = (provider: string) => {
  const definition = catalog.value.sources.find((source) => source.id === provider);
  if (definition)
    draft.value.source = {
      provider,
      config: structuredClone(toRaw(definition.defaultConfig)),
    };
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
  border-bottom-color: var(--p-primary-color, var(--primary-color, #6366f1));
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
  grid-template-columns: repeat(3, minmax(0, 1fr));
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
  border-color: var(--p-primary-color, var(--primary-color, #6366f1));
  background: color-mix(
    in srgb,
    var(--p-primary-color, var(--primary-color, #6366f1)) 7%,
    transparent
  );
}
.choice-card i {
  color: var(--p-primary-color, var(--primary-color, #6366f1));
  font-size: 20px;
}
.choice-card img,
.destination-row > img,
.review-list > div > img {
  width: 24px;
  height: 24px;
  object-fit: contain;
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
.destination-list {
  display: grid;
  gap: 8px;
}
.destination-row {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  min-width: 0;
  border: 1px solid var(--p-surface-200, var(--surface-border));
  border-radius: 8px;
  padding: 12px;
  background: transparent;
  color: var(--text-color);
  text-align: left;
  cursor: pointer;
}
.destination-row > i {
  flex: 0 0 24px;
  color: var(--p-primary-color, var(--primary-color, #6366f1));
  font-size: 22px;
  text-align: center;
}
.destination-row:hover,
.destination-row.selected {
  border-color: var(--p-primary-color, var(--primary-color, #6366f1));
  background: color-mix(
    in srgb,
    var(--p-primary-color, var(--primary-color, #6366f1)) 7%,
    transparent
  );
}
.destination-copy {
  display: grid;
  flex: 1;
  gap: 3px;
  min-width: 0;
}
.destination-copy strong {
  font-size: 0.8rem;
}
.destination-copy small {
  color: var(--p-text-muted-color, var(--text-color-secondary));
  font-size: 0.7rem;
}
.destination-selection {
  display: grid;
  flex: 0 0 20px;
  width: 20px;
  height: 20px;
  place-items: center;
  border: 1px solid var(--p-surface-400, var(--surface-border));
  border-radius: 4px;
  color: var(--p-primary-color, var(--primary-color, #6366f1));
  font-size: 0.72rem;
}
.destination-row.selected .destination-selection {
  border-color: var(--p-primary-color, var(--primary-color, #6366f1));
  background: var(--p-primary-color, var(--primary-color, #6366f1));
  color: var(--p-primary-contrast-color, var(--primary-contrast-color, white));
}
.review-list > div {
  display: grid;
  grid-template-columns: minmax(112px, 0.38fr) minmax(0, 1fr);
  align-items: center;
  gap: 10px;
  border: 1px solid var(--p-surface-200, var(--surface-border));
  border-radius: 7px;
  padding: 9px;
}
.review-label {
  color: var(--p-text-muted-color, var(--text-color-secondary));
  font-size: 0.72rem;
  font-weight: 600;
}
.review-value {
  display: flex !important;
  align-items: center;
  gap: 8px !important;
  min-width: 0;
}
.review-value > span {
  min-width: 0;
  overflow-wrap: anywhere;
}
.review-value > img {
  flex: 0 0 24px;
  width: 24px;
  height: 24px;
  object-fit: contain;
}
.review-value > i {
  flex: 0 0 20px;
}
.review-intro {
  margin-bottom: 0 !important;
}
.review-notice {
  display: flex;
  align-items: flex-start;
  gap: 9px;
  border: 1px solid color-mix(in srgb, var(--p-indigo-500, #6366f1) 25%, transparent);
  border-radius: 7px;
  padding: 10px;
  background: color-mix(in srgb, var(--p-indigo-500, #6366f1) 7%, transparent);
}
.review-notice > i {
  flex: 0 0 16px;
  color: var(--p-indigo-500, #6366f1);
}
.review-notice > span {
  color: var(--p-text-muted-color, var(--text-color-secondary));
  font-size: 0.74rem;
}
.review-list i {
  color: var(--p-primary-color, var(--primary-color, #6366f1));
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
.review-destinations {
  min-width: 0;
}
.review-destination {
  display: flex !important;
  align-items: center;
  gap: 7px !important;
  min-width: 0;
  margin-top: 4px;
}
.review-destination i {
  font-size: 15px;
}
.review-destination img {
  width: 18px;
  height: 18px;
  object-fit: contain;
}
.review-detail {
  margin-top: 3px;
}
.helper-copy {
  color: var(--p-text-muted-color, var(--text-color-secondary));
  font-size: 0.75rem;
}
@media (max-width: 640px) {
  .choice-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .review-list > div {
    grid-template-columns: 92px minmax(0, 1fr);
  }
}
</style>
