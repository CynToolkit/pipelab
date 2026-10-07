<template>
  <WorkflowShell
    :flow-id="flowId"
    :project-id="projectId"
    :title="flow?.name || 'Release'"
    active="configuration"
  >
    <template #actions>
      <span
        v-if="flow"
        class="workflow-readiness"
        :class="`state-${workflowReadinessState}`"
        role="status"
      >
        <i :class="workflowReadinessIcon" aria-hidden="true" />{{ workflowReadinessLabel }}
      </span>
      <span v-if="flow" class="autosave-state" :class="`state-${saveState}`"
        ><i
          :class="
            saveState === 'saving'
              ? 'pi pi-spin pi-spinner'
              : saveState === 'error'
                ? 'pi pi-exclamation-circle'
                : 'pi pi-check-circle'
          "
        />
        {{ saveStateLabel }}</span
      >
      <Button
        label="Ship"
        icon="mdi mdi-rocket-launch-outline"
        :loading="running"
        :disabled="!canShip"
        @click="ship"
      />
    </template>
    <main v-if="flow" class="release-page">
      <Message v-if="loadError" severity="error" role="alert">
        <div class="planner-error">
          <span>{{ loadError }}</span>
          <Button
            label="Retry loading workflow"
            text
            size="small"
            :disabled="!agent.isReady.value"
            @click="loadWorkflow"
          />
        </div>
      </Message>
      <Message v-if="error" severity="error" role="alert">{{ error }}</Message>
      <Message v-if="plannerError" severity="error" role="alert">
        <div class="planner-error">
          <span>Workflow readiness is unavailable: {{ plannerError }}</span>
          <Button label="Retry planning" text size="small" @click="refreshPlan" />
        </div>
      </Message>
      <Message v-if="saveError" severity="error" role="alert">
        <div class="planner-error">
          <span>{{ saveError }}</span>
          <Button label="Retry save" text size="small" @click="save().catch(() => {})" />
        </div>
      </Message>
      <section v-if="plan?.graph.nodes.length" class="plan-shortcut">
        <span>Need to inspect the compiled steps?</span>
        <Button label="Advanced · View plan" text size="small" @click="planExpanded = true" />
      </section>
      <section v-if="selectedBlocker" class="action-required-card" aria-live="polite">
        <div class="blocker-icon" aria-hidden="true">
          <i class="pi pi-info-circle" />
        </div>
        <div class="blocker-copy">
          <div class="blocker-heading">
            <span class="eyebrow">Action required</span>
            <div class="blocker-navigation">
              <span aria-live="polite"
                >{{ activeBlockerIndex + 1 }} of {{ blockingIssues.length }}</span
              >
              <template v-if="blockingIssues.length > 1">
                <Button
                  icon="pi pi-chevron-left"
                  text
                  rounded
                  size="small"
                  aria-label="Previous blocker"
                  :disabled="activeBlockerIndex === 0"
                  @click="moveBlocker(-1)"
                />
                <Button
                  icon="pi pi-chevron-right"
                  text
                  rounded
                  size="small"
                  aria-label="Next blocker"
                  :disabled="activeBlockerIndex >= blockingIssues.length - 1"
                  @click="moveBlocker(1)"
                />
              </template>
            </div>
          </div>
          <strong>{{ blockerPresentation.title }}</strong>
          <span>{{ blockerPresentation.description }}</span>
          <Button
            class="blocker-repair-button"
            :label="blockerPresentation.actionLabel"
            @click="repairSelectedBlocker"
          />
        </div>
      </section>
      <section class="release-section">
        <div class="section-heading">
          <div>
            <h2>Source</h2>
            <p>Choose the project or files this release represents.</p>
          </div>
        </div>
        <article class="source-card" :class="{ invalid: cardIssues('source').length }">
          <div class="provider-icon">
            <i :class="providerIcon(sourceDefinition?.icon, 'mdi mdi-source-branch')" />
          </div>
          <div class="source-copy">
            <strong>{{ sourceDefinition?.label || flow.source.provider }}</strong>
            <span>{{ sourcePath || "No source selected" }}</span>
          </div>
          <span
            class="readiness-label"
            :class="{ 'readiness-problem': cardIssues('source').length }"
          >
            {{
              cardIssues("source").length
                ? "Needs attention"
                : sourcePath
                  ? "Ready"
                  : "Not configured"
            }}
          </span>
          <Button label="Edit" text icon="pi pi-pencil" @click="sourceSettingsVisible = true" />
        </article>
      </section>
      <section class="release-section">
        <div class="section-heading">
          <div>
            <h2>Destinations</h2>
          </div>
          <Button
            label="Add destination"
            icon="pi pi-plus"
            text
            @click="addDestinationVisible = true"
          />
        </div>
        <div v-if="!flow.destinations.length" class="empty-card">
          <i class="mdi mdi-cloud-upload-outline" /><strong>No destinations yet</strong>
          <span>Add a destination when you are ready to ship this release.</span>
        </div>
        <article
          v-for="(destination, index) in flow.destinations"
          :key="destination.id"
          class="job-card"
          :class="{
            disabled: !destination.enabled,
            invalid: cardIssues(`destinations.${index}`).length,
          }"
        >
          <div class="job-header">
            <div class="provider-icon">
              <i
                :class="
                  providerIcon(
                    destinationDefinition(destination.provider)?.icon,
                    'mdi mdi-cloud-upload-outline',
                  )
                "
              />
            </div>
            <div class="job-title">
              <strong>{{
                destinationDefinition(destination.provider)?.label || destination.provider
              }}</strong
              ><span
                >{{ destination.slots.length }} deployment slot{{
                  destination.slots.length === 1 ? "" : "s"
                }}</span
              >
            </div>
            <span
              class="readiness-label"
              :class="{
                'readiness-problem': destinationReadiness(destination, index) === 'Needs attention',
              }"
            >
              {{ destinationReadiness(destination, index) }}
            </span>
            <Button
              label="Edit"
              text
              icon="pi pi-pencil"
              @click="openDestinationSettings(destination)"
            />
          </div>
          <div v-if="destination.enabled" class="slot-list">
            <div v-for="(slot, slotIndex) in destination.slots" :key="slot.id" class="slot-row">
              <div class="deployment-main">
                <i class="mdi mdi-package-variant-closed" /><span
                  ><strong>{{ deploymentSlotLabel(slot, slotIndex) }}</strong
                  ><small>{{ artifactLabel(slot.input) }}</small></span
                >
              </div>
              <span
                class="readiness-label"
                :class="{ 'readiness-problem': slotCardIssues(slot).length || !slot.input }"
              >
                {{
                  slotCardIssues(slot).length
                    ? "Needs attention"
                    : slot.input
                      ? "Ready"
                      : "Output required"
                }}
              </span>
              <Button
                v-if="!slot.input || slotIssues(slot).length"
                label="Configure build"
                text
                icon="mdi mdi-hammer-wrench"
                @click="openBuildsForSlot(destination, slot)"
              />
              <Button
                v-else
                label="Edit"
                text
                icon="pi pi-pencil"
                @click="openSlotSettings(destination, slot)"
              />
            </div>
          </div>
        </article>
      </section>
      <section v-if="planExpanded && plan" class="plan-panel" aria-label="Advanced workflow plan">
        <div class="section-heading">
          <div>
            <span class="eyebrow">Advanced</span>
            <h2>Resolved plan</h2>
            <p>Automatic transforms are planner plumbing, not configurable builds.</p>
          </div>
          <Button label="Close" text size="small" @click="planExpanded = false" />
        </div>
        <ol class="plan-list">
          <li v-for="node in plan.graph.nodes" :key="node.id">
            <i :class="nodeIcon(node.kind)" /><span>{{ planNodeLabel(node.id, node.kind) }}</span>
          </li>
        </ol>
      </section>
    </main>
    <main v-else class="release-page">
      <Message v-if="loadError" severity="error" role="alert">
        {{ loadError }}
        <Button label="Retry" text @click="loadWorkflow" :disabled="!agent.isReady.value" />
      </Message>
      <p v-else role="status" aria-busy="true">
        {{
          agent.isReady.value
            ? "Loading workflow configuration…"
            : "Workflow configuration is unavailable while the engine is disconnected."
        }}
      </p>
    </main>
  </WorkflowShell>
  <ConfirmDialog group="workflow-destructive" />
  <Dialog
    v-model:visible="addDestinationVisible"
    modal
    header="Add destination"
    :style="{ width: '500px', maxWidth: '94vw' }"
  >
    <div v-if="availableDestinations.length" class="destination-picker">
      <button
        v-for="destination in availableDestinations"
        :key="destination.id"
        type="button"
        class="destination-choice"
        @click="addDestination(destination.id)"
      >
        <span class="provider-icon">
          <i :class="providerIcon(destination.icon, 'mdi mdi-cloud-upload-outline')" />
        </span>
        <span
          ><strong>{{ destination.label }}</strong
          ><small>Add destination</small></span
        >
        <i class="pi pi-plus" aria-hidden="true" />
      </button>
    </div>
    <p v-else class="empty-card">All available destinations are already in this workflow.</p>
    <template #footer>
      <Button label="Cancel" text @click="addDestinationVisible = false" />
    </template>
  </Dialog>
  <Dialog v-model:visible="attentionVisible" modal header="Needs attention" :style="dialogStyle">
    <p class="attention-copy">The planner is authoritative. Fix these issues before shipping.</p>
    <ul class="issue-summary">
      <li
        v-for="issue in attentionIssues"
        :key="`${issue.code}:${issue.path}:${issue.severity}:${issue.message}`"
      >
        <Tag :value="issue.severity" :severity="issue.severity === 'error' ? 'danger' : 'warn'" />
        <span>{{ issue.message }}</span>
        <Button
          v-if="isBuildIssue(issue)"
          label="Configure build"
          text
          size="small"
          @click="openBuildIssue(issue)"
        />
        <Button
          v-else-if="issue.path?.startsWith('source')"
          label="Edit source"
          text
          size="small"
          @click="openIssueEditor(issue)"
        />
        <Button
          v-else-if="issue.path?.startsWith('destinations')"
          label="Edit destination"
          text
          size="small"
          @click="openIssueEditor(issue)"
        />
      </li>
    </ul>
  </Dialog>
  <Dialog v-model:visible="sourceSettingsVisible" modal header="Edit source" :style="dialogStyle"
    ><div v-if="flow && sourceDefinition" class="settings-grid">
      <div class="release-field wide">
        <label for="source-provider">Source</label>
        <Select
          id="source-provider"
          :model-value="flow.source.provider"
          :options="catalog.sources"
          optionLabel="label"
          optionValue="id"
          @update:model-value="selectSource"
        />
      </div>
      <template v-for="field in sourceDefinition.fields || []" :key="field.key">
        <ReleaseFieldControl
          :field="field"
          :value="fieldValue(flow.source.config, field.key)"
          :options="fieldOptions(field)"
          :input-id="`source-${field.key}`"
          :issues="fieldIssues(`source.${field.key}`)"
          @update:value="setSourceField(field.key, $event)"
          @add-connection="openConnection"
        />
      </template>
    </div>
    <template #footer><Button label="Done" @click="sourceSettingsVisible = false" /></template
  ></Dialog>
  <Dialog
    v-model:visible="destinationSettingsVisible"
    modal
    header="Edit destination"
    :style="dialogStyle"
    ><div v-if="settingsDestination" class="settings-grid">
      <div class="release-field wide destination-toggle">
        <label :for="`destination-enabled-${settingsDestination.id}`">Destination</label>
        <ToggleSwitch
          v-model="settingsDestination.enabled"
          :inputId="`destination-enabled-${settingsDestination.id}`"
          aria-label="Destination enabled"
        />
        <span>{{ settingsDestination.enabled ? "Included in this release" : "Disabled" }}</span>
      </div>
      <template
        v-for="field in destinationDefinition(settingsDestination.provider)?.fields || []"
        :key="field.key"
        ><ReleaseFieldControl
          :field="field"
          :value="fieldValue(settingsDestination.config, field.key)"
          :options="fieldOptions(field)"
          :input-id="`destination-${settingsDestination.id}-${field.key}`"
          :issues="
            fieldIssues(
              `destinations.${flow?.destinations.indexOf(settingsDestination)}.config.${field.key}`,
            )
          "
          @update:value="setField(settingsDestination.config, field.key, $event)"
          @add-connection="openConnection"
      /></template>
    </div>
    <template #footer
      ><Button
        label="Add deployment"
        icon="pi pi-plus"
        text
        @click="settingsDestination && addSlot(settingsDestination)" /><Button
        label="Remove destination"
        icon="pi pi-trash"
        text
        severity="danger"
        @click="settingsDestination && removeDestination(settingsDestination.id)" /><Button
        label="Done"
        @click="destinationSettingsVisible = false" /></template
  ></Dialog>
  <Dialog
    v-model:visible="slotSettingsVisible"
    modal
    header="Deployment settings"
    :style="dialogStyle"
    ><div v-if="settingsDestination && settingsSlot" class="settings-grid">
      <div class="release-field wide">
        <label :for="`slot-${settingsSlot.id}-name`">Deployment name</label>
        <InputText
          :id="`slot-${settingsSlot.id}-name`"
          v-model="settingsSlot.name"
          placeholder="Deployment name"
        />
      </div>
      <div class="release-field wide destination-toggle">
        <label :for="`slot-enabled-${settingsSlot.id}`">Deployment</label>
        <ToggleSwitch
          v-model="settingsSlot.enabled"
          :inputId="`slot-enabled-${settingsSlot.id}`"
          aria-label="Deployment enabled"
        />
        <span>{{ settingsSlot.enabled ? "Included in this release" : "Disabled" }}</span>
      </div>
      <div class="release-field wide">
        <label>Output</label
        ><Select
          :model-value="releaseOutputRefValue(settingsSlot.input)"
          :options="outputOptions"
          optionLabel="label"
          optionValue="value"
          @update:model-value="setSlotInput(settingsSlot, $event)"
        />
        <small
          v-for="issue in slotIssues(settingsSlot)"
          :key="`${issue.code}:${issue.path}:${issue.severity}:${issue.message}`"
          class="field-issue"
          :class="issue.severity === 'error' ? 'field-issue-error' : 'field-issue-warning'"
          >{{ issue.message }}</small
        >
      </div>
      <template
        v-for="field in destinationDefinition(settingsDestination.provider)?.slotFields || []"
        :key="field.key"
        ><ReleaseFieldControl
          :field="field"
          :value="fieldValue(settingsSlot.config, field.key)"
          :options="fieldOptions(field)"
          :input-id="`slot-${settingsSlot.id}-${field.key}`"
          :issues="
            fieldIssues(
              `destinations.${flow?.destinations.indexOf(settingsDestination)}.slots.${settingsDestination?.slots.indexOf(settingsSlot)}.config.${field.key}`,
            )
          "
          @update:value="setField(settingsSlot.config, field.key, $event)"
          @add-connection="openConnection"
      /></template>
    </div>
    <template #footer
      ><Button
        label="Remove deployment"
        icon="pi pi-trash"
        text
        severity="danger"
        @click="
          settingsDestination && settingsSlot && removeSlot(settingsDestination, settingsSlot.id)
        " /><Button label="Done" @click="slotSettingsVisible = false" /></template
  ></Dialog>
  <Dialog v-model:visible="connectionVisible" modal header="Add connection" :style="dialogStyle"
    ><div class="settings-grid">
      <div class="release-field">
        <label for="connection-name">Name</label
        ><InputText id="connection-name" v-model="connectionDraft.name" placeholder="My account" />
      </div>
      <div v-for="field in connectionFields" :key="field.key" class="release-field">
        <label :for="`connection-${field.key}`">{{ field.label }}</label
        ><InputText
          :id="`connection-${field.key}`"
          v-model="connectionDraft.values[field.key]"
          :type="field.type === 'password' ? 'password' : 'text'"
          :placeholder="field.placeholder || 'Stored securely'"
        />
      </div>
    </div>
    <template #footer
      ><Button label="Cancel" text @click="cancelConnection" /><Button
        label="Add connection"
        :loading="connectionSaving"
        :disabled="!connectionDraft.name.trim() || !connectionHasValue"
        @click="createConnection" /></template
  ></Dialog>
  <Dialog
    v-model:visible="releaseDetailsVisible"
    modal
    header="Release details"
    :style="dialogStyle"
    ><div class="settings-grid">
      <div class="release-field">
        <label for="release-version">Version</label
        ><InputText id="release-version" v-model="releaseVersion" placeholder="1.0.0" />
      </div>
      <div class="release-field wide">
        <label for="release-description">Description</label
        ><Textarea id="release-description" v-model="releaseDescription" rows="3" />
      </div>
    </div>
    <template #footer
      ><Button label="Cancel" text @click="releaseDetailsVisible = false" /><Button
        label="Ship release"
        icon="mdi mdi-rocket-launch-outline"
        :loading="running"
        :disabled="!releaseVersion.trim() || !canShip"
        @click="runShip" /></template
  ></Dialog>
</template>

<script setup lang="ts">
import { computed, onUnmounted, ref, toRaw, watch } from "vue";
import { nanoid } from "nanoid";
import { onBeforeRouteLeave, useRoute, useRouter } from "vue-router";
import Button from "primevue/button";
import ConfirmDialog from "primevue/confirmdialog";
import Dialog from "primevue/dialog";
import InputText from "primevue/inputtext";
import Message from "primevue/message";
import Select from "primevue/select";
import Tag from "primevue/tag";
import Textarea from "primevue/textarea";
import ToggleSwitch from "primevue/toggleswitch";
import { useConfirm } from "primevue/useconfirm";
import type {
  IconType,
  ReleaseCatalog,
  ReleaseConfig,
  ReleaseDestinationConfig,
  ReleaseDestinationSlot,
  ReleaseFieldDefinition,
  ReleaseFieldOption,
  ReleaseOutputRef,
  ReleasePlan,
  ValidationIssue,
} from "@pipelab/shared";
import WorkflowShell from "../components/WorkflowShell.vue";
import ReleaseFieldControl from "../components/ReleaseFieldControl.vue";
import { useAPI } from "../composables/api";
import { publishRunEvent } from "./run-events";
import { useAppStore } from "../store/app";
import { useConnectionsStore } from "../store/connections";
import { useAgentAvailability } from "@renderer/composables/useAgentAvailability";
import {
  connectionMatchesIntegration,
  blockerAtIndex,
  clampBlockerIndex,
  createSerializedTaskQueue,
  deploymentSlotLabel,
  issuesForPath,
  deduplicateValidationIssues,
  outputReferenceConsumers,
  planOutputOptions,
  readinessLabel,
  releaseCanRun,
  releaseBlockerPresentation,
  releaseReadinessState,
  releaseRepairRoute,
  releaseOutputRefValue,
  runAfterSuccessfulSave,
} from "./release-flow-model";
import {
  hasUnsavedReleaseWorkflowState,
  preventBeforeUnloadIfUnsaved,
} from "./workflow-builds-state";

const route = useRoute();
const router = useRouter();
const api = useAPI();
const confirm = useConfirm();
const appStore = useAppStore();
const connectionsStore = useConnectionsStore();
const agent = useAgentAvailability();
const flowId = computed(() => String(route.params.flowId));
const projectId = computed(() => String(route.params.projectId));
const catalog = ref<ReleaseCatalog>({
  buildTypes: [],
  sources: [],
  producers: [],
  destinations: [],
});
const flow = ref<ReleaseConfig>();
const plan = ref<ReleasePlan>();
const plannerIssues = ref<ValidationIssue[]>([]);
const inspectionIssues = ref<ValidationIssue[]>([]);
const issues = computed(() => [...plannerIssues.value, ...inspectionIssues.value]);
const summaryIssues = computed(() => deduplicateValidationIssues(issues.value));
const blockingIssues = computed(() =>
  summaryIssues.value.filter((issue) => issue.severity === "error"),
);
const blockerIndex = ref(0);
const activeBlockerIndex = computed(() =>
  clampBlockerIndex(blockerIndex.value, blockingIssues.value.length),
);
const selectedBlocker = computed(() =>
  blockerAtIndex(blockingIssues.value, activeBlockerIndex.value),
);
watch(
  blockingIssues,
  (current) => {
    blockerIndex.value = clampBlockerIndex(blockerIndex.value, current.length);
  },
  { deep: true },
);
const attentionVisible = ref(false);
const attentionIssues = ref<ValidationIssue[]>([]);
const planExpanded = ref(false);
const error = ref("");
const loadError = ref("");
const plannerError = ref("");
const saveError = ref("");
const running = ref(false);
const planning = ref(false);
const saveState = ref<"saving" | "saved" | "error">("saved");
const inspectionOptions = ref<Record<string, ReleaseFieldOption[]>>({});
const addDestinationVisible = ref(false);
const sourceSettingsVisible = ref(false);
const destinationSettingsVisible = ref(false);
const slotSettingsVisible = ref(false);
const releaseDetailsVisible = ref(false);
const settingsDestination = ref<ReleaseDestinationConfig>();
const settingsSlot = ref<ReleaseDestinationSlot>();
const releaseVersion = ref("1.0.0");
const releaseDescription = ref("");
const connectionVisible = ref(false);
const connectionSaving = ref(false);
const pendingBlockerConnection = ref<
  | {
      code: string;
      message: string;
      path: string;
      flowId: string;
      projectId: string;
      integration: string;
    }
  | undefined
>();
const connectionDraft = ref({
  name: "",
  integration: "",
  integrationName: "",
  values: {} as Record<string, string>,
});
const dialogStyle = { width: "560px", maxWidth: "94vw" };
const saveStateLabel = computed(() =>
  saveState.value === "saving" ? "Saving…" : saveState.value === "error" ? "Error" : "Saved",
);
const workflowReadinessState = computed(() =>
  releaseReadinessState(
    planning.value,
    Boolean(plan.value),
    Boolean(plannerError.value),
    blockingIssues.value.length,
  ),
);
const workflowReadinessLabel = computed(() =>
  workflowReadinessState.value === "error"
    ? "Readiness unavailable"
    : workflowReadinessState.value === "checking"
      ? "Checking readiness…"
      : workflowReadinessState.value === "attention"
        ? "Needs attention"
        : "Ready to ship",
);
const workflowReadinessIcon = computed(() =>
  workflowReadinessState.value === "error"
    ? "pi pi-exclamation-circle"
    : workflowReadinessState.value === "checking"
      ? "pi pi-spin pi-spinner"
      : workflowReadinessState.value === "attention"
        ? "pi pi-exclamation-triangle"
        : "pi pi-check-circle",
);
const canShip = computed(
  () =>
    agent.isReady.value &&
    connectionsStore.status === "ready" &&
    appStore.providerStatus === "ready" &&
    releaseCanRun(
      flow.value,
      plan.value,
      issues.value,
      running.value,
      planning.value,
      saveState.value,
    ),
);
let latestSourceInspection = 0;
let latestPlanRequest = 0;
let workflowLoadGeneration = 0;
let saveGeneration = 0;
let connectionDialogGeneration = 0;
const changeRevision = ref(0);
const persistedRevision = ref(0);
let workflowHydrated = false;
const hasUnsavedState = computed(() =>
  hasUnsavedReleaseWorkflowState({
    changeRevision: changeRevision.value,
    persistedRevision: persistedRevision.value,
    saveState: saveState.value,
  }),
);
const beforeUnloadHandler = (event: BeforeUnloadEvent) =>
  preventBeforeUnloadIfUnsaved(event, hasUnsavedState.value);
let beforeUnloadRegistered = false;
watch(
  hasUnsavedState,
  (dirty) => {
    if (typeof window === "undefined") return;
    if (dirty && !beforeUnloadRegistered) {
      window.addEventListener("beforeunload", beforeUnloadHandler);
      beforeUnloadRegistered = true;
    } else if (!dirty && beforeUnloadRegistered) {
      window.removeEventListener("beforeunload", beforeUnloadHandler);
      beforeUnloadRegistered = false;
    }
  },
  { flush: "sync", immediate: true },
);
const openAttention = (cardIssues: ValidationIssue[]) => {
  attentionIssues.value = cardIssues;
  attentionVisible.value = true;
};
const isBuildIssue = (issue: ValidationIssue) =>
  Boolean(
    issue.path?.startsWith("builds.") ||
    /^destinations\.\d+\.slots\.\d+\.input(?:\.|$)/.test(issue.path || ""),
  );
const openBuildIssue = (issue: ValidationIssue) => {
  if (!flow.value) return;
  attentionVisible.value = false;
  const slotMatch = issue.path?.match(/^destinations\.(\d+)\.slots\.(\d+)/);
  if (slotMatch) {
    const destination = flow.value.destinations[Number(slotMatch[1])];
    const slot = destination?.slots[Number(slotMatch[2])];
    if (destination && slot) void openBuildsForSlot(destination, slot);
    return;
  }
  const buildMatch = issue.path?.match(/^builds\.(\d+)/);
  const build = buildMatch ? flow.value.builds[Number(buildMatch[1])] : undefined;
  void router.push({
    name: "WorkflowBuilds",
    params: { flowId: flowId.value, projectId: projectId.value },
    query: { ...(build ? { buildId: build.id } : {}), issuePath: issue.path },
  });
};
const openIssueEditor = (issue: ValidationIssue) => {
  if (!flow.value) return;
  attentionVisible.value = false;
  if (issue.path?.startsWith("source")) {
    sourceSettingsVisible.value = true;
    return;
  }
  const match = issue.path?.match(/^destinations\.(\d+)(?:\.slots\.(\d+))?/);
  const destination = match ? flow.value.destinations[Number(match[1])] : undefined;
  const slot = match && match[2] ? destination?.slots[Number(match[2])] : undefined;
  if (destination && slot) openSlotSettings(destination, slot);
  else if (destination) openDestinationSettings(destination);
};
const moveBlocker = (delta: number) => {
  blockerIndex.value = clampBlockerIndex(
    activeBlockerIndex.value + delta,
    blockingIssues.value.length,
  );
};
const repairSelectedBlocker = () => {
  const issue = selectedBlocker.value;
  if (!issue || !blockingIssues.value.includes(issue)) return;
  const route = releaseRepairRoute(issue);
  const fieldContext = blockerFieldContext(issue);
  switch (route) {
    case "connections":
      attentionVisible.value = false;
      void router.push({ name: "Connections" });
      return;
    case "builds":
      openBuildIssue(issue);
      return;
    case "configuration":
      openIssueEditor(issue);
      if (
        fieldContext.field?.type === "connection" &&
        fieldContext.field.integration &&
        fieldContext.fieldConfig &&
        fieldContext.fieldKey &&
        issue.path &&
        !fieldContext.hasMatchingConnection
      ) {
        openConnection(fieldContext.field.integration);
        pendingBlockerConnection.value = {
          code: issue.code,
          message: issue.message,
          path: issue.path,
          flowId: flowId.value,
          projectId: projectId.value,
          integration: fieldContext.field.integration,
        };
      }
      return;
    default:
      openAttention(blockingIssues.value);
  }
};
const sourceDefinition = computed(() =>
  catalog.value.sources.find((item) => item.id === flow.value?.source.provider),
);
const producerDefinition = (id: string) => catalog.value.producers.find((item) => item.id === id);
const destinationDefinition = (id: string) =>
  catalog.value.destinations.find((item) => item.id === id);
const providerIcon = (icon: IconType | undefined, fallback: string) =>
  icon?.type === "icon"
    ? icon.icon.includes("mdi") || icon.icon.includes("pi-")
      ? icon.icon
      : `mdi ${icon.icon}`
    : fallback;
const fieldValue = (config: Record<string, unknown>, key: string) => String(config[key] ?? "");
const setField = (config: Record<string, unknown>, key: string, value: unknown) => {
  config[key] = String(value ?? "");
};
const connections = computed(() => connectionsStore.connections?.connections || []);
const connectionOptions = (field: ReleaseFieldDefinition) =>
  connections.value
    .filter((connection) => connectionMatchesIntegration(connection, field.integration))
    .map((connection) => ({ label: connection.name || connection.id, value: connection.id }));
const connectionFields = computed(() => {
  const definition = appStore.providerDefinitions.find(
    (plugin) =>
      plugin.packageName === connectionDraft.value.integration ||
      plugin.id === connectionDraft.value.integration,
  );
  return (
    definition?.integrations?.find(
      (integration) => integration.name === connectionDraft.value.integrationName,
    )?.fields || [{ key: "value", label: "Credential", type: "password" as const }]
  );
});
const connectionHasValue = computed(() =>
  connectionFields.value.length
    ? connectionFields.value.some((field) => connectionDraft.value.values[field.key]?.trim())
    : Object.values(connectionDraft.value.values).some((value) => value.trim()),
);
const fieldOptions = (field: ReleaseFieldDefinition) =>
  field.type === "connection"
    ? connectionOptions(field)
    : inspectionOptions.value[field.key] || field.options || [];
const cardIssues = (prefix: string) => issuesForPath(summaryIssues.value, prefix);
const fieldIssues = (path: string) => issues.value.filter((issue) => issue.path === path);
const slotIssuePath = (slot: ReleaseDestinationSlot) => {
  const destinationIndex = flow.value?.destinations.findIndex((destination) =>
    destination.slots.includes(slot),
  );
  const slotIndex =
    destinationIndex === undefined || destinationIndex < 0
      ? -1
      : flow.value?.destinations[destinationIndex].slots.indexOf(slot);
  return destinationIndex !== undefined &&
    destinationIndex >= 0 &&
    slotIndex !== undefined &&
    slotIndex >= 0
    ? `destinations.${destinationIndex}.slots.${slotIndex}`
    : undefined;
};
const slotIssues = (slot: ReleaseDestinationSlot) => {
  const path = slotIssuePath(slot);
  return path ? fieldIssues(`${path}.input`) : [];
};
const slotCardIssues = (slot: ReleaseDestinationSlot) => {
  const path = slotIssuePath(slot);
  return path ? issuesForPath(summaryIssues.value, path) : [];
};
const blockerFieldContext = (issue: ValidationIssue) => {
  if (!flow.value || !issue.path) return {};
  let field: ReleaseFieldDefinition | undefined;
  let targetLabel: string | undefined;
  let fieldKey: string | undefined;
  let fieldConfig: Record<string, unknown> | undefined;

  const sourceMatch = issue.path.match(/^source\.config\.(.+)$/);
  const buildMatch = issue.path.match(/^builds\.(\d+)\.(?:(?:targets\.(\d+)\.)?config)\.(.+)$/);
  const destinationMatch = issue.path.match(
    /^destinations\.(\d+)\.(?:(?:slots\.(\d+)\.)?config)\.(.+)$/,
  );
  if (sourceMatch) {
    fieldKey = sourceMatch[1];
    fieldConfig = flow.value.source.config;
    field = sourceDefinition.value?.fields?.find((candidate) => candidate.key === fieldKey);
    targetLabel = sourceDefinition.value?.label || "source";
  } else if (buildMatch) {
    const build = flow.value.builds[Number(buildMatch[1])];
    const producer = build ? producerDefinition(build.engine) : undefined;
    const target = buildMatch[2] ? build?.targets[Number(buildMatch[2])] : undefined;
    fieldKey = buildMatch[3];
    fieldConfig = target?.config || build?.config;
    field = target
      ? producer?.targets
          .find((candidate) => candidate.id === target.id)
          ?.fields?.find((candidate) => candidate.key === fieldKey)
      : producer?.fields?.find((candidate) => candidate.key === fieldKey);
    targetLabel = build?.name?.trim() || producer?.label || "build";
  } else if (destinationMatch) {
    const destination = flow.value.destinations[Number(destinationMatch[1])];
    const definition = destination ? destinationDefinition(destination.provider) : undefined;
    const slot = destinationMatch[2] ? destination?.slots[Number(destinationMatch[2])] : undefined;
    fieldKey = destinationMatch[3];
    fieldConfig = slot?.config || destination?.config;
    field = slot
      ? definition?.slotFields?.find((candidate) => candidate.key === fieldKey)
      : definition?.fields?.find((candidate) => candidate.key === fieldKey);
    targetLabel = definition?.label || "destination";
  }

  if (field?.type !== "connection" || !field.integration)
    return { targetLabel, field, fieldKey, fieldConfig };
  const integrationProvider = appStore.providerDefinitions.find(
    (provider) => provider.packageName === field?.integration || provider.id === field?.integration,
  );
  const fallbackConnectionLabel = field.label.replace(/\s+(account|connection)$/i, "");
  const connectionLabel = integrationProvider?.name || fallbackConnectionLabel || "provider";
  const connectionFieldLabel = field.label.toLowerCase().startsWith(connectionLabel.toLowerCase())
    ? field.label.slice(connectionLabel.length).trim().toLowerCase()
    : field.label.toLowerCase();
  return {
    targetLabel,
    connectionLabel,
    connectionFieldLabel,
    field,
    fieldKey,
    fieldConfig,
    integration: field.integration,
    hasMatchingConnection: connections.value.some((connection) =>
      connectionMatchesIntegration(connection, field?.integration || ""),
    ),
  };
};
const blockerPresentation = computed(() => {
  const issue = selectedBlocker.value;
  return issue
    ? releaseBlockerPresentation(issue, blockerFieldContext(issue))
    : { title: "", description: "", actionLabel: "Review issues" };
});
const destinationReadiness = (destination: ReleaseDestinationConfig, index: number) => {
  const enabledSlots = destination.slots.filter((slot) => slot.enabled);
  const childrenReady =
    enabledSlots.length > 0 &&
    enabledSlots.every((slot) => Boolean(slot.input) && !slotCardIssues(slot).length);
  return readinessLabel(
    destination.enabled,
    childrenReady,
    Boolean(cardIssues(`destinations.${index}`).length),
  );
};
const sourcePath = computed(() => {
  const field = sourceDefinition.value?.fields?.find(
    (item) => item.type === "file" || item.type === "directory",
  );
  return field && flow.value ? fieldValue(flow.value.source.config, field.key) : "";
});
const outputOptions = computed(() =>
  flow.value && plan.value ? planOutputOptions(flow.value, plan.value, catalog.value) : [],
);
const availableDestinations = computed(() =>
  catalog.value.destinations.filter(
    (item) => !flow.value?.destinations.some((destination) => destination.provider === item.id),
  ),
);
const addDestination = (provider: string) => {
  if (!flow.value) return;
  const definition = destinationDefinition(provider);
  if (definition) {
    flow.value.destinations.push({
      id: nanoid(),
      provider,
      enabled: true,
      config: { ...definition.defaultConfig },
      slots: [
        {
          id: nanoid(),
          name: "Deployment 1",
          enabled: true,
          config: {},
        },
      ],
    });
  }
  addDestinationVisible.value = false;
};
const hasConfiguredValue = (value: unknown): boolean => {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.some(hasConfiguredValue);
  if (typeof value === "object")
    return Object.values(value as Record<string, unknown>).some(hasConfiguredValue);
  return true;
};
const confirmDestructiveChange = (
  header: string,
  message: string,
  acceptLabel: string,
  accept: () => void,
) =>
  confirm.require({
    group: "workflow-destructive",
    header,
    message,
    icon: "pi pi-exclamation-triangle",
    acceptLabel,
    rejectLabel: "Keep current setup",
    accept,
  });
const removeDestination = (id: string) => {
  const destination = flow.value?.destinations.find((item) => item.id === id);
  if (!flow.value || !destination) return;
  const label = destinationDefinition(destination.provider)?.label || destination.provider;
  const remove = () => {
    flow.value!.destinations = flow.value!.destinations.filter((item) => item.id !== id);
    destinationSettingsVisible.value = false;
    settingsDestination.value = undefined;
  };
  if (hasConfiguredValue(destination.config) || destination.slots.length) {
    confirmDestructiveChange(
      `Remove ${label}?`,
      `This removes ${label}'s settings and ${destination.slots.length} deployment slot${destination.slots.length === 1 ? "" : "s"}, including their selected outputs.`,
      "Remove destination",
      remove,
    );
  } else remove();
};
const addSlot = (destination: ReleaseDestinationConfig) => {
  destination.slots.push({
    id: nanoid(),
    name: `Deployment ${destination.slots.length + 1}`,
    enabled: true,
    config: {},
  });
};
const removeSlot = (destination: ReleaseDestinationConfig, id: string) => {
  const slot = destination.slots.find((item) => item.id === id);
  if (!slot) return;
  const remove = () => {
    destination.slots = destination.slots.filter((item) => item.id !== id);
    if (settingsSlot.value?.id === id) {
      slotSettingsVisible.value = false;
      settingsSlot.value = undefined;
    }
  };
  const index = destination.slots.indexOf(slot);
  const hasCustomName = Boolean(slot.name?.trim()) && slot.name !== `Deployment ${index + 1}`;
  const configured = Boolean(slot.input) || hasConfiguredValue(slot.config) || hasCustomName;
  if (configured) {
    const destinationLabel =
      destinationDefinition(destination.provider)?.label || destination.provider;
    const output = artifactLabel(slot.input);
    confirmDestructiveChange(
      `Remove ${deploymentSlotLabel(slot, index)}?`,
      `${destinationLabel} will lose this deployment${slot.input ? ` and its selected output (${output})` : ""}.`,
      "Remove deployment",
      remove,
    );
  } else remove();
};
const setSlotInput = (slot: ReleaseDestinationSlot, value: string) => {
  const output = outputOptions.value.find((candidate) => candidate.value === value);
  if (output) slot.input = output.ref;
};
const openBuildsForSlot = (destination: ReleaseDestinationConfig, slot: ReleaseDestinationSlot) =>
  router.push({
    name: "WorkflowBuilds",
    params: { flowId: flowId.value, projectId: projectId.value },
    query: { destinationId: destination.id, slotId: slot.id },
  });
const artifactLabel = (ref?: ReleaseOutputRef) =>
  ref
    ? outputOptions.value.find((output) => output.value === releaseOutputRefValue(ref))?.label ||
      "Invalid output reference"
    : "Choose output";
const openDestinationSettings = (destination: ReleaseDestinationConfig) => {
  settingsDestination.value = destination;
  destinationSettingsVisible.value = true;
};
const openSlotSettings = (destination: ReleaseDestinationConfig, slot: ReleaseDestinationSlot) => {
  settingsDestination.value = destination;
  settingsSlot.value = slot;
  slotSettingsVisible.value = true;
};
const selectSource = (provider: string) => {
  if (!flow.value) return;
  const definition = catalog.value.sources.find((source) => source.id === provider);
  if (!definition || flow.value.source.provider === provider) return;
  const currentConfig = flow.value.source.config;
  const nextConfig = { ...definition.defaultConfig };
  const discardedFields = Object.keys(currentConfig).filter(
    (key) =>
      hasConfiguredValue(currentConfig[key]) &&
      JSON.stringify(currentConfig[key]) !== JSON.stringify(nextConfig[key]),
  );
  const consumers = outputReferenceConsumers(flow.value, { source: true }, catalog.value).map(
    (consumer) => consumer.label,
  );
  const apply = () => {
    if (!flow.value) return;
    flow.value.source = { provider, config: nextConfig };
    inspectionOptions.value = {};
    void inspectSource();
  };
  if (discardedFields.length || consumers.length) {
    const details = [
      discardedFields.length
        ? `Provider-specific settings will be replaced: ${discardedFields.join(", ")}.`
        : "",
      consumers.length
        ? `Source output is selected by ${consumers.slice(0, 4).join(", ")}${consumers.length > 4 ? ` and ${consumers.length - 4} more` : ""}. Those routes will remain unchanged and may need a different output.`
        : "",
    ]
      .filter(Boolean)
      .join(" ");
    confirmDestructiveChange(
      `Change source to ${definition.label}?`,
      details,
      "Change source",
      apply,
    );
  } else apply();
};
const setSourceField = (key: string, value: unknown) => {
  if (flow.value) {
    setField(flow.value.source.config, key, value);
    void inspectSource();
  }
};
const openConnection = (integration: string) => {
  connectionDialogGeneration++;
  pendingBlockerConnection.value = undefined;
  const definition = appStore.providerDefinitions.find(
    (plugin) => plugin.packageName === integration || plugin.id === integration,
  );
  const integrationDefinition = definition?.integrations?.[0];
  connectionDraft.value = {
    name: "",
    integration,
    integrationName: integrationDefinition?.name || "",
    values: Object.fromEntries(
      (integrationDefinition?.fields || [{ key: "value" }]).map((field) => [field.key, ""]),
    ),
  };
  connectionVisible.value = true;
};
const cancelConnection = () => {
  connectionDialogGeneration++;
  pendingBlockerConnection.value = undefined;
  connectionVisible.value = false;
};
const createConnection = async () => {
  const dialogGeneration = connectionDialogGeneration;
  const pendingAtStart = pendingBlockerConnection.value;
  connectionSaving.value = true;
  try {
    const integration = connectionDraft.value.integration;
    const record = {
      id: nanoid(),
      pluginName: integration,
      integrationName: connectionDraft.value.integrationName || undefined,
      name: connectionDraft.value.name.trim(),
      ...Object.fromEntries(
        Object.entries(connectionDraft.value.values).map(([key, value]) => [key, value.trim()]),
      ),
      createdAt: new Date().toISOString(),
      isDefault: false,
    };
    const result = await api.execute("connections:save", {
      data: { version: "1.0.0", connections: [...connections.value, record] },
    });
    if (result.type === "error") {
      error.value = result.ipcError;
      return;
    }
    await connectionsStore.load(true);
    const pending = pendingBlockerConnection.value;
    if (
      pendingAtStart &&
      pending === pendingAtStart &&
      pending &&
      pending.integration === integration &&
      pending.flowId === flowId.value &&
      pending.projectId === projectId.value
    ) {
      const currentIssue = blockingIssues.value.find(
        (issue) =>
          issue.code === pending.code &&
          issue.message === pending.message &&
          issue.path === pending.path,
      );
      if (currentIssue) {
        const target = blockerFieldContext(currentIssue);
        if (target.integration === integration && target.fieldConfig && target.fieldKey)
          target.fieldConfig[target.fieldKey] = record.id;
      }
    }
    if (pendingBlockerConnection.value === pendingAtStart)
      pendingBlockerConnection.value = undefined;
    if (dialogGeneration === connectionDialogGeneration) connectionVisible.value = false;
  } catch (err) {
    error.value = err instanceof Error ? err.message : "Unable to save connection.";
  } finally {
    connectionSaving.value = false;
  }
};
const inspectSource = async () => {
  if (!flow.value || !agent.isReady.value) return;
  const requestId = ++latestSourceInspection;
  const provider = flow.value.source.provider;
  const config = structuredClone(toRaw(flow.value.source.config));
  const isCurrent = () =>
    requestId === latestSourceInspection &&
    flow.value?.source.provider === provider &&
    JSON.stringify(flow.value.source.config) === JSON.stringify(config);
  let result: Awaited<ReturnType<typeof api.execute>>;
  try {
    result = await api.execute("release:source:inspect", { provider, config });
  } catch (cause) {
    if (!isCurrent()) return;
    inspectionOptions.value = {};
    inspectionIssues.value = [
      {
        code: "release.source.inspect",
        message: cause instanceof Error ? cause.message : String(cause),
        severity: "error",
        path: "source",
      },
    ];
    return;
  }
  if (!isCurrent()) return;
  if (result.type === "error") {
    inspectionOptions.value = {};
    inspectionIssues.value = [
      {
        code: "release.source.inspect",
        message: result.ipcError,
        severity: "error",
        path: "source",
      },
    ];
    return;
  }
  if (result.type === "success") {
    const data = result.result as {
      issues?: ValidationIssue[];
      fieldOptions?: Record<string, ReleaseFieldOption[]>;
    };
    inspectionIssues.value = (data.issues || []).map((issue) => ({
      ...issue,
      path: issue.path?.startsWith("source.")
        ? issue.path
        : issue.path
          ? `source.${issue.path}`
          : "source",
    }));
    inspectionOptions.value = data.fieldOptions || {};
  }
};
const planNodeLabel = (id: string, kind: string) => {
  if (kind === "source") return sourceDefinition.value?.label || id;
  if (kind === "build") {
    const build = flow.value?.builds.find((candidate) => candidate.id === id);
    return build
      ? `${catalog.value.buildTypes.find((type) => type.id === build.type)?.label || build.type} / ${producerDefinition(build.engine)?.label || build.engine}`
      : id;
  }
  const [destinationId, slotId] = id.split(":");
  const destination = flow.value?.destinations.find((candidate) => candidate.id === destinationId);
  return kind === "destination"
    ? `${destinationDefinition(destination?.provider || "")?.label || destinationId} / ${slotId}`
    : id;
};
const nodeIcon = (kind: string) =>
  kind === "source"
    ? "mdi mdi-source-branch"
    : kind === "destination"
      ? "mdi mdi-cloud-upload-outline"
      : kind === "automatic"
        ? "mdi mdi-cog-transfer-outline"
        : "mdi mdi-hammer-wrench";
const refreshPlan = async (): Promise<ReleasePlan | undefined> => {
  if (!flow.value || !agent.isReady.value) return undefined;
  const requestId = ++latestPlanRequest;
  const revision = changeRevision.value;
  const config = structuredClone(toRaw(flow.value));
  const fingerprint = JSON.stringify(config);
  planning.value = true;
  plannerError.value = "";
  try {
    const result = await api.execute("release:plan", { config });
    if (
      requestId !== latestPlanRequest ||
      revision !== changeRevision.value ||
      JSON.stringify(flow.value) !== fingerprint
    )
      return undefined;
    if (result.type === "error") {
      plan.value = undefined;
      plannerIssues.value = [];
      plannerError.value = result.ipcError;
      return undefined;
    }
    plan.value = result.result;
    plannerIssues.value = result.result.issues;
    plannerError.value = "";
    return result.result;
  } catch (cause) {
    if (requestId === latestPlanRequest && revision === changeRevision.value) {
      plan.value = undefined;
      plannerIssues.value = [];
      plannerError.value = cause instanceof Error ? cause.message : String(cause);
    }
    return undefined;
  } finally {
    if (requestId === latestPlanRequest) planning.value = false;
  }
};
const save = createSerializedTaskQueue(async () => {
  if (!flow.value) return;
  if (
    !agent.isReady.value ||
    connectionsStore.status !== "ready" ||
    appStore.providerStatus !== "ready"
  ) {
    if (!hasUnsavedState.value) return;
    saveState.value = "error";
    saveError.value = "The engine or required workflow data is unavailable before save.";
    throw new Error(saveError.value);
  }
  const requestGeneration = ++saveGeneration;
  const revision = changeRevision.value;
  const snapshot = structuredClone(toRaw(flow.value));
  saveState.value = "saving";
  const result = await api.execute("workflow:save", {
    workflowId: flowId.value,
    data: snapshot,
    projectId: projectId.value,
  });
  if (requestGeneration !== saveGeneration || !agent.isReady.value)
    throw new Error("The connection changed before the save could be confirmed.");
  if (result.type === "error") {
    saveState.value = "error";
    saveError.value = result.ipcError;
    throw new Error(result.ipcError);
  }
  persistedRevision.value = revision;
  saveError.value = "";
  if (
    persistedRevision.value !== changeRevision.value ||
    JSON.stringify(flow.value) !== JSON.stringify(snapshot)
  )
    void save().catch(() => {});
  else saveState.value = "saved";
});
const ship = async () => {
  if (!flow.value || !canShip.value) return;
  try {
    await save();
    const revision = changeRevision.value;
    const fingerprint = JSON.stringify(flow.value);
    const currentPlan = await refreshPlan();
    if (
      !currentPlan ||
      revision !== changeRevision.value ||
      JSON.stringify(flow.value) !== fingerprint ||
      issues.value.some((issue) => issue.severity === "error")
    )
      return;
    releaseVersion.value = "1.0.0";
    releaseDescription.value = flow.value?.description || flow.value?.name || "";
    releaseDetailsVisible.value = true;
  } catch {
    // The autosave state provides the retry action and its error message.
  }
};
const runShip = async () => {
  if (!flow.value || !canShip.value) return;
  releaseDetailsVisible.value = false;
  running.value = true;
  try {
    await runAfterSuccessfulSave(save, async () => {
      const revision = changeRevision.value;
      const fingerprint = JSON.stringify(flow.value);
      const currentPlan = await refreshPlan();
      if (
        !currentPlan ||
        revision !== changeRevision.value ||
        JSON.stringify(flow.value) !== fingerprint ||
        persistedRevision.value !== revision ||
        issues.value.some((issue) => issue.severity === "error")
      ) {
        throw new Error("The saved workflow is no longer ready to ship. Review the latest issues.");
      }
      let runId = "";
      const result = await api.execute(
        "workflow:execute",
        {
          name: `workflows/${flowId.value}`,
          release: {
            version: releaseVersion.value.trim(),
            description: releaseDescription.value.trim(),
          },
        },
        async (event) => {
          if (event.type === "workflow-run") {
            runId = event.data.runId;
            await router.push(`/workflows/${flowId.value}/${projectId.value}/runs/${runId}`);
          } else if (event.type === "workflow-event" && runId) {
            publishRunEvent(runId, event.data);
          }
        },
      );
      if (result.type === "error") error.value = result.ipcError;
      else if (!runId)
        await router.push(
          `/workflows/${flowId.value}/${projectId.value}/runs/${result.result.runId}`,
        );
    });
  } catch (cause) {
    if (!error.value) error.value = cause instanceof Error ? cause.message : String(cause);
  } finally {
    running.value = false;
  }
};
let saveTimer: ReturnType<typeof setTimeout> | undefined;
let planTimer: ReturnType<typeof setTimeout> | undefined;
watch(
  flow,
  () => {
    if (!workflowHydrated || !flow.value) return;
    changeRevision.value += 1;
    latestPlanRequest += 1;
    plan.value = undefined;
    plannerIssues.value = [];
    plannerError.value = "";
    planning.value = true;
    clearTimeout(saveTimer);
    clearTimeout(planTimer);
    if (flow.value) {
      saveTimer = setTimeout(() => void save().catch(() => {}), 700);
      planTimer = setTimeout(() => void refreshPlan(), 300);
    }
  },
  { deep: true, flush: "sync" },
);
onBeforeRouteLeave(async () => {
  if (!flow.value || !hasUnsavedState.value) return true;
  clearTimeout(saveTimer);
  try {
    await save();
    return true;
  } catch {
    return false;
  }
});
onUnmounted(() => {
  if (beforeUnloadRegistered && typeof window !== "undefined") {
    window.removeEventListener("beforeunload", beforeUnloadHandler);
    beforeUnloadRegistered = false;
  }
  clearTimeout(saveTimer);
  clearTimeout(planTimer);
});
const loadWorkflow = async () => {
  if (!agent.isReady.value) return;
  const generation = ++workflowLoadGeneration;
  const requestedFlowId = flowId.value;
  const requestedProjectId = projectId.value;
  loadError.value = "";
  try {
    const [catalogResult, flowResult] = await Promise.all([
      api.execute("release:catalog:get"),
      api.execute("workflow:load", { workflowId: requestedFlowId, projectId: requestedProjectId }),
      connectionsStore.init(),
      appStore.loadProviderDefinitions(),
    ]).then(([catalog, workflow]) => [catalog, workflow] as const);
    if (
      generation !== workflowLoadGeneration ||
      requestedFlowId !== flowId.value ||
      requestedProjectId !== projectId.value
    )
      return;
    if (catalogResult.type === "error") throw new Error(catalogResult.ipcError);
    if (flowResult.type === "error") throw new Error(flowResult.ipcError);
    if (connectionsStore.status === "error")
      throw new Error(connectionsStore.error || "Unable to load connections.");
    if (appStore.providerStatus === "error")
      throw new Error(appStore.providerError || "Unable to load provider definitions.");
    const loaded = flowResult.result;
    if (loaded.id !== requestedFlowId || loaded.project !== requestedProjectId)
      throw new Error("Loaded workflow identity does not match the requested route.");
    catalog.value = catalogResult.result;
    const preserveDraft =
      flow.value?.id === requestedFlowId &&
      flow.value?.project === requestedProjectId &&
      hasUnsavedState.value;
    if (!preserveDraft) {
      workflowHydrated = false;
      flow.value = loaded;
      workflowHydrated = true;
    }
    await inspectSource();
    if (generation === workflowLoadGeneration) await refreshPlan();
  } catch (cause) {
    if (generation === workflowLoadGeneration)
      loadError.value = cause instanceof Error ? cause.message : String(cause);
  }
};
watch(
  agent.isReady,
  (ready) => {
    if (!ready) {
      workflowLoadGeneration++;
      saveGeneration++;
      latestSourceInspection++;
      latestPlanRequest++;
      clearTimeout(saveTimer);
      clearTimeout(planTimer);
      if (hasUnsavedState.value) {
        saveState.value = "error";
        saveError.value = "The engine disconnected before these workflow changes could be saved.";
      }
      return;
    }
    void loadWorkflow();
  },
  { immediate: true },
);
watch([flowId, projectId], () => {
  pendingBlockerConnection.value = undefined;
  workflowLoadGeneration++;
  saveGeneration++;
  workflowHydrated = false;
  flow.value = undefined;
  plan.value = undefined;
  if (agent.isReady.value) void loadWorkflow();
});
</script>

<style scoped>
.release-page {
  max-width: 1040px;
  margin: 0 auto;
  padding-bottom: 48px;
}
.autosave-state {
  color: var(--p-text-muted-color, var(--text-color-secondary));
  font-size: 0.75rem;
}
.workflow-readiness {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  color: var(--p-text-muted-color, var(--text-color-secondary));
  font-size: 0.75rem;
}
.workflow-readiness i {
  font-size: 0.7rem;
}
.workflow-readiness.state-ready i {
  color: var(--green-500, #22c55e);
}
.workflow-readiness.state-attention,
.workflow-readiness.state-error {
  color: var(--p-orange-700, #c2410c);
}
.autosave-state i {
  margin-right: 4px;
}
.state-saved i {
  color: var(--green-500, #22c55e);
}
.state-error i {
  color: var(--red-500, #ef4444);
}
.planner-error,
.plan-shortcut {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.action-required-card {
  display: grid;
  grid-template-columns: 32px minmax(0, 1fr);
  align-items: start;
  gap: 4px 12px;
  margin: 14px 0;
  border: 1px solid color-mix(in srgb, var(--p-indigo-500, #6366f1) 24%, transparent);
  border-radius: 8px;
  padding: 14px 16px;
  background: color-mix(in srgb, var(--p-indigo-100, #eef2ff) 58%, var(--p-surface-0, #fff));
}
.blocker-icon {
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  margin-top: 1px;
  border-radius: 50%;
  color: var(--p-indigo-700, #4338ca);
  background: color-mix(in srgb, var(--p-indigo-500, #6366f1) 18%, transparent);
  font-size: 0.85rem;
}
.blocker-copy {
  display: grid;
  gap: 5px;
  min-width: 0;
}
.blocker-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.blocker-copy .eyebrow {
  color: var(--p-indigo-700, #4338ca);
  font-size: 0.68rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}
.blocker-copy strong {
  color: var(--p-text-color, var(--text-color));
  font-size: 1rem;
}
.blocker-copy > span,
.plan-shortcut span {
  color: var(--p-text-muted-color, var(--text-color-secondary));
  font-size: 0.78rem;
}
.blocker-navigation {
  display: flex;
  align-items: center;
  flex: 0 0 auto;
  gap: 2px;
}
.blocker-navigation span {
  color: var(--p-text-muted-color, var(--text-color-secondary));
  font-size: 0.75rem;
  margin-right: 2px;
  white-space: nowrap;
}
.blocker-copy > .p-button {
  justify-self: start;
  margin-top: 3px;
}
.blocker-copy :deep(.blocker-repair-button) {
  border-color: var(--p-indigo-500, #6366f1);
  background: var(--p-indigo-500, #6366f1);
  color: white;
}
.blocker-copy :deep(.blocker-repair-button:hover:not(:disabled)) {
  border-color: var(--p-indigo-600, #4f46e5);
  background: var(--p-indigo-600, #4f46e5);
}
.plan-shortcut {
  justify-content: flex-end;
  margin: 0 2px -8px;
}
.readiness-label {
  flex: 0 0 auto;
  color: var(--p-text-muted-color, var(--text-color-secondary));
  font-size: 0.73rem;
}
.readiness-problem {
  color: var(--p-orange-700, #c2410c);
  font-weight: 600;
}
@media (max-width: 640px) {
  .action-required-card {
    grid-template-columns: 28px minmax(0, 1fr);
    padding: 12px;
  }
  .blocker-heading {
    align-items: flex-start;
  }
}
.destination-toggle {
  display: flex;
  align-items: center;
  gap: 10px;
}
.destination-toggle label {
  margin-right: auto;
}
.destination-toggle span {
  color: var(--p-text-muted-color, var(--text-color-secondary));
  font-size: 0.75rem;
}
.issue-summary {
  display: grid;
  gap: 5px;
  margin: 9px 0 0;
  padding-left: 18px;
}
.issue-summary li {
  font-size: 0.78rem;
}
.issue-summary .p-tag {
  margin-right: 5px;
}
.release-section,
.plan-panel {
  display: grid;
  gap: 0;
}
.release-section + .release-section {
  margin-top: 22px;
}
.section-heading {
  display: flex;
  align-items: end;
  justify-content: space-between;
  gap: 16px;
  margin: 0 0 14px;
}
.section-heading h2 {
  margin: 0;
  font-size: 1.15rem;
}
.section-heading p {
  margin: 4px 0 0;
  color: var(--p-text-muted-color, var(--text-color-secondary));
  font-size: 0.8rem;
}
.eyebrow,
.field-label {
  color: var(--p-text-muted-color, var(--text-color-secondary));
  font-size: 0.68rem;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}
.source-card,
.job-card,
.empty-card,
.plan-panel {
  border: 1px solid var(--p-surface-200, var(--surface-border));
  border-radius: 10px;
  background: var(--p-surface-0, var(--surface-card));
}
.source-card,
.job-header {
  display: flex;
  align-items: center;
  gap: 12px;
}
.field-issue {
  display: block;
  margin-top: 4px;
  font-size: 0.72rem;
}
.field-issue-error {
  color: var(--red-500, #ef4444);
}
.field-issue-warning {
  color: var(--orange-500, #f97316);
}
.source-card {
  padding: 12px 14px;
}
.source-copy,
.job-title {
  display: grid;
  gap: 3px;
  min-width: 0;
  flex: 1;
}
.source-copy strong,
.job-title strong {
  font-size: 0.9rem;
}
.source-copy span,
.job-title span,
.field-value {
  overflow: hidden;
  color: var(--p-text-muted-color, var(--text-color-secondary));
  font-size: 0.75rem;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.source-copy small {
  color: var(--p-text-muted-color, var(--text-color-secondary));
  font-size: 0.7rem;
}
.provider-icon {
  display: grid;
  place-items: center;
  width: 36px;
  height: 36px;
  flex: 0 0 auto;
  border: 1px solid var(--p-surface-200, var(--surface-border));
  border-radius: 8px;
  color: var(--primary-color);
  background: var(--p-surface-50, var(--surface-ground));
  font-size: 18px;
}
.job-card {
  overflow: hidden;
}
.destination-picker {
  display: grid;
  gap: 8px;
}
.destination-choice {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 10px 12px;
  border: 1px solid var(--p-surface-200, var(--surface-border));
  border-radius: 8px;
  background: var(--p-surface-0, var(--surface-card));
  color: var(--text-color);
  text-align: left;
  cursor: pointer;
}
.destination-choice > span:nth-child(2) {
  display: grid;
  flex: 1;
  gap: 3px;
}
.destination-choice small {
  color: var(--p-text-muted-color, var(--text-color-secondary));
  font-size: 0.7rem;
}
.destination-choice:hover {
  border-color: var(--primary-color);
}
.job-header {
  padding: 12px 14px;
}
.settings-grid,
.slot-list {
  display: grid;
  gap: 8px;
  padding: 0 14px 14px;
}
.release-field {
  display: grid;
  gap: 5px;
}
.release-field label,
.field-label {
  letter-spacing: 0.02em;
}
.slot-row {
  display: flex;
  align-items: center;
  gap: 10px;
  border: 1px solid var(--p-surface-200, var(--surface-border));
  border-radius: 7px;
  padding: 9px 10px;
  background: transparent;
  color: var(--text-color);
  text-align: left;
}
.slot-row > :first-child {
  flex: 1;
}
.deployment-main > span {
  display: grid;
  gap: 2px;
  min-width: 0;
}
.deployment-main small {
  overflow: hidden;
  color: var(--p-text-muted-color, var(--text-color-secondary));
  font-size: 0.7rem;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.empty-card {
  display: grid;
  place-items: center;
  gap: 6px;
  padding: 30px;
  color: var(--p-text-muted-color, var(--text-color-secondary));
  text-align: center;
}
.empty-card i {
  color: var(--primary-color);
  font-size: 25px;
}
.plan-panel {
  margin-top: 8px;
  padding: 14px;
}
.plan-panel .section-heading h2 {
  font-size: 1.05rem;
}
.plan-list {
  display: grid;
  gap: 0;
  margin: 0;
  padding: 0;
  list-style: none;
}
.plan-list li {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 0;
  border-bottom: 1px solid var(--surface-border);
  font-size: 0.8rem;
}
.plan-list li:last-child {
  border-bottom: 0;
}
.plan-list i {
  color: var(--primary-color);
}
:root.dark .source-card,
:root.dark .job-card,
:root.dark .empty-card,
:root.dark .plan-panel {
  border-color: var(--p-surface-700, #3f3f46);
  background: var(--p-surface-900, #18181b);
}
:root.dark .provider-icon {
  border-color: var(--p-surface-700, #3f3f46);
  background: var(--p-surface-800, #27272a);
}
:root.dark .destination-choice {
  border-color: var(--p-surface-700, #3f3f46);
  background: var(--p-surface-900, #18181b);
}
:root.dark .slot-row {
  border-color: var(--p-surface-700, #3f3f46);
}
:root.dark .slot-row:hover {
  background: var(--p-surface-800, #27272a);
}
.field-note {
  margin: 0;
  color: var(--p-text-muted-color, var(--text-color-secondary));
  font-size: 0.75rem;
}
.wide {
  grid-column: 1 / -1;
}
@media (max-width: 640px) {
  .section-heading,
  .job-header,
  .source-card {
    align-items: flex-start;
    flex-wrap: wrap;
  }
  .slot-row {
    align-items: flex-start;
    flex-wrap: wrap;
  }
}
</style>
