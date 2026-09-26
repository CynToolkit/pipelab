<template>
  <Layout>
    <WorkflowShell
      :flow-id="flowId"
      :project-id="projectId"
      :title="flow?.name || 'Workflow'"
      subtitle="Build profiles and their outputs"
      active="builds"
    >
      <template #actions>
        <span v-if="flow" class="autosave-state" :class="`state-${saveState}`">
          <i
            :class="
              saveState === 'saving'
                ? 'pi pi-spin pi-spinner'
                : saveState === 'error'
                  ? 'pi pi-exclamation-circle'
                  : 'pi pi-check-circle'
            "
          />
          {{ saveStateLabel }}
        </span>
        <Button
          v-if="saveState === 'error'"
          label="Retry save"
          text
          size="small"
          @click="save().catch(() => {})"
        />
        <Button label="Add build" icon="pi pi-plus" @click="openAddBuild" />
      </template>

      <main class="builds-page">
        <Message v-if="loadError" severity="error" role="alert">
          <div class="state-copy">
            <strong>Couldn’t load workflow builds</strong>
            <span>{{ loadError }}</span>
            <Button label="Retry" text size="small" @click="loadWorkflow" />
          </div>
        </Message>
        <template v-else-if="flow">
          <Message v-if="plannerError" severity="error" role="alert">
            <div class="state-copy">
              <strong>Build readiness is unavailable</strong>
              <span>{{ plannerError }}</span>
              <Button label="Retry planning" text size="small" @click="refreshPlan" />
            </div>
          </Message>
          <Message v-if="saveError" severity="error" role="alert">
            <div class="state-copy">
              <strong>Couldn’t save workflow changes</strong>
              <span>{{ saveError }}</span>
              <Button label="Retry save" text size="small" @click="save().catch(() => {})" />
            </div>
          </Message>
          <Message v-if="requestedBuildUnavailable" severity="warn" role="status">
            <div class="state-copy">
              <span>
                The requested build “{{ requestedBuildId }}” no longer exists. Choose another build
                or return to Configuration.
              </span>
              <Button label="Dismiss" text size="small" @click="dismissBuildIssueRequest" />
            </div>
          </Message>

          <section v-if="compatibleRouteRequested" class="compatible-section">
            <div class="section-heading">
              <div>
                <span class="eyebrow">Configuration shortcut</span>
                <h2>Create a compatible build</h2>
                <p v-if="compatibleSlot">
                  Choices below were checked against {{ compatibleDestinationLabel }} ·
                  {{ deploymentSlotLabel(compatibleSlot, compatibleSlotIndex) }}.
                </p>
                <p v-else>The requested destination slot is no longer available.</p>
              </div>
              <Button label="Clear" text size="small" @click="clearCompatibleRoute" />
            </div>
            <Message v-if="compatibleError" severity="error" role="alert">
              <div class="state-copy">
                <span>{{ compatibleError }}</span>
                <Button label="Retry choices" text size="small" @click="refreshCompatibleBuilds" />
              </div>
            </Message>
            <p v-else-if="compatibleChecking" class="inline-state" aria-live="polite">
              Checking build choices with the planner…
            </p>
            <div v-else-if="compatibleSlot && compatibleCandidates.length" class="choice-list">
              <article
                v-for="choice in compatibleCandidates"
                :key="`${choice.type}:${choice.engine}:${choice.target}`"
                class="compatible-choice"
              >
                <div class="choice-copy">
                  <strong>{{ choice.typeLabel }} · {{ choice.engineLabel }}</strong>
                  <span>{{ choice.targetLabel }}</span>
                </div>
                <Button
                  label="Create build"
                  icon="pi pi-plus"
                  text
                  size="small"
                  @click="createCompatibleBuild(choice)"
                />
              </article>
            </div>
            <p v-else-if="compatibleSlot" class="inline-state" role="status">
              No available build choice passed planner validation for this slot.
            </p>
          </section>

          <section class="build-section">
            <header class="section-heading">
              <div>
                <span class="eyebrow">Workflow configuration</span>
                <h2>Build profiles</h2>
                <p>Choose engines and targets for outputs used by your destinations.</p>
              </div>
              <span v-if="!planning && plan" class="build-count">
                {{ flow.builds.length }} {{ flow.builds.length === 1 ? "build" : "builds" }}
              </span>
            </header>

            <div v-if="!flow.builds.length" class="empty-state" role="status">
              <i class="mdi mdi-hammer-wrench" aria-hidden="true" />
              <strong>No build profiles</strong>
              <span
                >Add a build when a destination needs an artifact the Source cannot provide.</span
              >
              <Button label="Add build" icon="pi pi-plus" text @click="openAddBuild" />
            </div>

            <div v-else class="build-list" role="list" aria-label="Build profiles">
              <article
                v-for="(build, index) in flow.builds"
                :key="build.id"
                class="build-row"
                :class="{
                  'build-disabled': !build.enabled,
                  'build-invalid': buildIssues(build, index).length,
                }"
                role="listitem"
              >
                <div class="build-main">
                  <div class="build-icon">
                    <i :class="producerIcon(build.engine)" aria-hidden="true" />
                  </div>
                  <div class="build-copy">
                    <strong>{{ build.name || buildTypeLabel(build.type) }}</strong>
                    <span>{{ buildTypeLabel(build.type) }} · {{ engineLabel(build.engine) }}</span>
                    <small
                      >Targets:
                      {{ enabledTargetLabels(build).join(", ") || "None selected" }}</small
                    >
                    <small>Input: {{ outputLabel(build.input) }}</small>
                  </div>
                </div>
                <div class="build-status">
                  <Tag
                    :value="buildReadiness(build, index)"
                    :severity="
                      buildReadiness(build, index) === 'Needs attention' ? 'warn' : 'secondary'
                    "
                  />
                  <ToggleSwitch
                    :model-value="build.enabled"
                    :inputId="`build-enabled-${build.id}`"
                    :aria-label="`${build.name || buildTypeLabel(build.type)} enabled`"
                    @update:model-value="setBuildEnabled(build, $event)"
                  />
                  <Button
                    label="Configure"
                    icon="pi pi-cog"
                    text
                    size="small"
                    :aria-label="`Configure ${build.name || engineLabel(build.engine)}`"
                    @click="openBuildSettings(build)"
                  />
                </div>
                <ul v-if="buildIssues(build, index).length" class="build-issues">
                  <li
                    v-for="issue in buildIssues(build, index)"
                    :key="`${issue.code}:${issue.path}:${issue.severity}:${issue.message}`"
                  >
                    {{ issue.message }}
                  </li>
                </ul>
              </article>
            </div>
          </section>
        </template>
      </main>
    </WorkflowShell>

    <Dialog v-model:visible="addVisible" modal header="Add build" :style="dialogStyle">
      <div class="settings-grid">
        <div class="release-field">
          <label for="new-build-type">Type</label>
          <Select
            id="new-build-type"
            v-model="newBuildType"
            :options="catalog.buildTypes"
            optionLabel="label"
            optionValue="id"
            placeholder="Choose a build type"
            @update:model-value="onNewBuildTypeChange"
          />
        </div>
        <div class="release-field">
          <label for="new-build-engine">Engine</label>
          <Select
            id="new-build-engine"
            v-model="newBuildEngine"
            :options="newBuildEngines"
            optionLabel="label"
            optionValue="id"
            placeholder="Choose an engine"
            :disabled="!newBuildType"
            @update:model-value="onNewBuildEngineChange"
          />
        </div>
        <div v-if="newBuildEngine" class="release-field wide">
          <span class="field-label">Target</span>
          <div class="target-list">
            <button
              v-for="target in newBuildTargets"
              :key="target.id"
              type="button"
              class="target-row"
              :class="{ selected: newBuildTarget === target.id }"
              :disabled="!buildTargetIsAvailable(target)"
              :aria-pressed="newBuildTarget === target.id"
              @click="newBuildTarget = target.id"
            >
              <i
                :class="
                  newBuildTarget === target.id ? 'mdi mdi-check-circle' : 'mdi mdi-circle-outline'
                "
              />
              <span>{{ target.label }}</span>
              <small v-if="buildTargetAvailabilityReason(target)">{{
                buildTargetAvailabilityReason(target)
              }}</small>
            </button>
          </div>
          <small
            v-if="newBuildEngine && !newBuildTargets.some(buildTargetIsAvailable)"
            class="field-note"
          >
            This engine has no available target for the selected build type.
          </small>
        </div>
      </div>
      <template #footer>
        <Button label="Cancel" text @click="addVisible = false" />
        <Button label="Add build" icon="pi pi-plus" :disabled="!canCreateBuild" @click="addBuild" />
      </template>
    </Dialog>

    <Dialog
      v-model:visible="settingsVisible"
      modal
      header="Build settings"
      :style="wideDialogStyle"
      @show="focusSettingsIssue"
      @hide="discardBuildSettings"
    >
      <div v-if="draftBuild" class="settings-grid">
        <div v-if="settingsIssuePath" class="build-issue-context" role="status">
          <strong>Configuration needs this build setting</strong>
          <span>{{ settingsIssueMessage }}</span>
          <code>{{ settingsIssuePath }}</code>
        </div>
        <p v-if="producerInspectionChecking" class="inline-state" role="status">
          Checking provider settings…
        </p>
        <div class="release-field wide">
          <label :for="`settings-engine-${draftBuild.id}`">Engine</label>
          <Select
            :id="`settings-engine-${draftBuild.id}`"
            :class="{ 'issue-focus': isSettingsIssueControl(`settings-engine-${draftBuild.id}`) }"
            :model-value="draftBuild.engine"
            :options="buildEnginesFor(catalog, draftBuild.type)"
            optionLabel="label"
            optionValue="id"
            @update:model-value="stageEngineChange"
          />
          <small v-if="engineChangeNotice" class="field-note">
            Select at least one available target before applying this engine.
          </small>
        </div>

        <div class="release-field wide">
          <span class="field-label">Enabled targets</span>
          <div class="target-list">
            <button
              v-for="target in draftTargets"
              :key="target.id"
              type="button"
              :id="buildTargetControlId(draftBuild.id, target.id)"
              class="target-row"
              :class="{
                selected: draftTargetEnabled(target.id),
                'issue-focus': isSettingsIssueControl(
                  buildTargetControlId(draftBuild.id, target.id),
                ),
              }"
              :disabled="!buildTargetIsAvailable(target) && !draftTargetEnabled(target.id)"
              :aria-pressed="draftTargetEnabled(target.id)"
              @click="toggleDraftTarget(target)"
            >
              <i
                :class="
                  draftTargetEnabled(target.id) ? 'mdi mdi-check-circle' : 'mdi mdi-circle-outline'
                "
              />
              <span>{{ target.label }}</span>
              <small v-if="buildTargetAvailabilityReason(target)">{{
                buildTargetAvailabilityReason(target)
              }}</small>
            </button>
          </div>
        </div>

        <div class="release-field wide">
          <label :for="`settings-input-${draftBuild.id}`">Input</label>
          <Select
            :id="`settings-input-${draftBuild.id}`"
            :class="{ 'issue-focus': isSettingsIssueControl(`settings-input-${draftBuild.id}`) }"
            :model-value="releaseOutputRefValue(draftBuild.input)"
            :options="draftBuildInputOptions"
            optionLabel="label"
            optionValue="value"
            placeholder="No compatible input found"
            :loading="buildInputChecking"
            :disabled="!draftBuildInputOptions.length || buildInputChecking"
            @update:model-value="setDraftBuildInput"
          />
          <small v-if="buildInputError" class="field-issue field-issue-error">{{
            buildInputError
          }}</small>
          <small v-else-if="buildInputChecking" class="field-note"
            >Checking planner-compatible inputs…</small
          >
          <small v-else-if="!draftBuildInputOptions.length" class="field-note">
            No planner-compatible Source or build output is available.
          </small>
        </div>

        <template
          v-for="field in producerDefinition(draftBuild.engine)?.fields || []"
          :key="field.key"
        >
          <ReleaseFieldControl
            :field="field"
            :class="{
              'issue-focus': isSettingsIssueControl(`build-${draftBuild.id}-${field.key}`),
            }"
            :value="fieldValue(draftBuild.config, field.key)"
            :options="fieldOptions(field)"
            :input-id="`build-${draftBuild.id}-${field.key}`"
            :issues="producerFieldIssues(draftBuild, field.key)"
            @update:value="setField(draftBuild.config, field.key, $event)"
            @add-connection="openConnection"
          />
        </template>
        <template
          v-for="target in draftBuild.targets.filter((item) => item.enabled)"
          :key="target.id"
        >
          <template
            v-for="field in targetDefinition(draftBuild.engine, draftBuild.type, target.id)
              ?.fields || []"
            :key="`${target.id}-${field.key}`"
          >
            <ReleaseFieldControl
              :field="field"
              :class="{
                'issue-focus': isSettingsIssueControl(
                  `target-${draftBuild.id}-${target.id}-${field.key}`,
                ),
              }"
              :value="fieldValue(target.config, field.key)"
              :options="fieldOptions(field)"
              :input-id="`target-${draftBuild.id}-${target.id}-${field.key}`"
              :issues="producerTargetFieldIssues(draftBuild, target.id, field.key)"
              @update:value="setField(target.config, field.key, $event)"
              @add-connection="openConnection"
            />
          </template>
        </template>
      </div>
      <template #footer>
        <div class="settings-footer">
          <Button
            v-if="draftBuild"
            label="Remove build"
            icon="pi pi-trash"
            text
            severity="danger"
            @click="removeBuild(draftBuild)"
          />
          <span class="settings-footer-spacer" />
          <Button label="Cancel" text @click="discardBuildSettings" />
          <Button
            label="Apply changes"
            :disabled="!canApplyBuildSettings"
            @click="applyBuildSettings"
          />
        </div>
      </template>
    </Dialog>

    <Dialog v-model:visible="connectionVisible" modal header="Add connection" :style="dialogStyle">
      <div class="settings-grid">
        <div class="release-field">
          <label for="build-connection-name">Name</label>
          <InputText
            id="build-connection-name"
            v-model="connectionDraft.name"
            placeholder="My account"
          />
        </div>
        <div v-for="field in connectionFields" :key="field.key" class="release-field">
          <label :for="`build-connection-${field.key}`">{{ field.label }}</label>
          <InputText
            :id="`build-connection-${field.key}`"
            v-model="connectionDraft.values[field.key]"
            :type="field.type === 'password' ? 'password' : 'text'"
            :placeholder="field.placeholder || 'Stored securely'"
          />
        </div>
      </div>
      <template #footer>
        <Button label="Cancel" text @click="connectionVisible = false" />
        <Button
          label="Add connection"
          :loading="connectionSaving"
          :disabled="!connectionDraft.name.trim() || !connectionHasValue"
          @click="createConnection"
        />
      </template>
    </Dialog>
    <ConfirmDialog />
  </Layout>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, toRaw, watch } from "vue";
import { nanoid } from "nanoid";
import { onBeforeRouteLeave, onBeforeRouteUpdate, useRoute, useRouter } from "vue-router";
import Button from "primevue/button";
import ConfirmDialog from "primevue/confirmdialog";
import Dialog from "primevue/dialog";
import InputText from "primevue/inputtext";
import Message from "primevue/message";
import Select from "primevue/select";
import Tag from "primevue/tag";
import ToggleSwitch from "primevue/toggleswitch";
import { useConfirm } from "primevue/useconfirm";
import type {
  IconType,
  ProducerInspection,
  ReleaseBuildProfileConfig,
  ReleaseCatalog,
  ReleaseCatalogTarget,
  ReleaseConfig,
  ReleaseFieldDefinition,
  ReleaseFieldOption,
  ReleaseOutputRef,
  ReleasePlan,
  ValidationIssue,
} from "@pipelab/shared";
import Layout from "../components/Layout.vue";
import WorkflowShell from "../components/WorkflowShell.vue";
import ReleaseFieldControl from "../components/ReleaseFieldControl.vue";
import { useAPI } from "../composables/api";
import { useAppStore } from "../store/app";
import { useConnectionsStore } from "../store/connections";
import {
  applyProducerInspection,
  buildEnginesFor,
  buildProfileSummary,
  buildTargetAvailabilityReason,
  buildTargetIsAvailable,
  buildTargetsFor,
  createBuildProfile,
  createSerializedTaskQueue,
  deploymentSlotLabel,
  deduplicateValidationIssues,
  issuesForPath,
  outputReferenceChangeImpact,
  outputReferenceConsumers,
  planOutputOptions,
  probeBuildInputCandidates,
  probeCompatibleBuildCandidates,
  releaseOutputRefValue,
  removeBuildProfile,
  selectBuildInput,
  setBuildTargetEnabled,
  switchBuildProfileEngine,
  type CompatibleBuildCandidate,
  type ReleaseOutputOption,
} from "./release-flow-model";
import {
  buildIssueControlId,
  buildInspectionSignature,
  persistBuildChangesBeforeNavigation,
  producerInspectionResponseIsCurrent,
  resolveBuildIssueRequest,
} from "./workflow-builds-state";

const route = useRoute();
const router = useRouter();
const api = useAPI();
const confirm = useConfirm();
const appStore = useAppStore();
const connectionsStore = useConnectionsStore();
const flowId = computed(() => String(route.params.flowId));
const projectId = computed(() => String(route.params.projectId));
const basePath = computed(() => `/workflows/${flowId.value}/${projectId.value}`);
const queryString = (value: unknown) => (typeof value === "string" ? value : "");
const requestedBuildId = computed(() => queryString(route.query.buildId));
const requestedIssuePath = computed(() => queryString(route.query.issuePath));
const requestedBuildIssueKey = computed(() =>
  requestedBuildId.value || requestedIssuePath.value
    ? `${flowId.value}/${projectId.value}/${requestedBuildId.value}/${requestedIssuePath.value}`
    : "",
);
const compatibleDestinationId = computed(() => queryString(route.query.destinationId));
const compatibleSlotId = computed(() => queryString(route.query.slotId));
const compatibleRouteRequested = computed(() =>
  Boolean(compatibleDestinationId.value || compatibleSlotId.value),
);
const catalog = ref<ReleaseCatalog>({
  buildTypes: [],
  sources: [],
  producers: [],
  destinations: [],
});
const flow = ref<ReleaseConfig>();
const plan = ref<ReleasePlan>();
const planning = ref(false);
const plannerError = ref("");
const loadError = ref("");
const saveError = ref("");
const saveState = ref<"saving" | "saved" | "error">("saved");
const producerInspectionIssues = ref<ValidationIssue[]>([]);
const producerInspectionOptions = ref<Record<string, ReleaseFieldOption[]>>({});
const compatibleCandidates = ref<CompatibleBuildCandidate[]>([]);
const compatibleChecking = ref(false);
const compatibleError = ref("");
const buildInputOptions = ref<Record<string, ReleaseOutputOption[]>>({});
const buildInputChecking = ref(false);
const buildInputError = ref("");
const producerInspectionChecking = ref(false);
const requestedBuildUnavailable = ref(false);
const settingsIssuePath = ref("");
const settingsIssueControlId = ref("");
const addVisible = ref(false);
const settingsVisible = ref(false);
const connectionVisible = ref(false);
const connectionSaving = ref(false);
const draftBuild = ref<ReleaseBuildProfileConfig>();
const newBuildType = ref<string>();
const newBuildEngine = ref<string>();
const newBuildTarget = ref<string>();
const connectionDraft = ref({
  name: "",
  integration: "",
  integrationName: "",
  values: {} as Record<string, string>,
});
const dialogStyle = { width: "560px", maxWidth: "94vw" };
const wideDialogStyle = { width: "760px", maxWidth: "94vw" };
const settingsIssueMessage = computed(
  () =>
    [...(plan.value?.issues || []), ...producerInspectionIssues.value].find(
      (issue) => issue.path === settingsIssuePath.value,
    )?.message || "Review the highlighted control and update the build configuration.",
);
const saveStateLabel = computed(() =>
  saveState.value === "saving" ? "Saving…" : saveState.value === "error" ? "Save failed" : "Saved",
);
const connections = computed(() => connectionsStore.connections?.connections || []);
const connectionHasValue = computed(() =>
  connectionFields.value.some((field) => connectionDraft.value.values[field.key]?.trim()),
);
const connectionFields = computed(() => {
  const definition = appStore.pluginDefinitions.find(
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
const compatibleDestination = computed(() =>
  flow.value?.destinations.find((destination) => destination.id === compatibleDestinationId.value),
);
const compatibleSlotIndex = computed(
  () =>
    compatibleDestination.value?.slots.findIndex((slot) => slot.id === compatibleSlotId.value) ??
    -1,
);
const compatibleSlot = computed(() =>
  compatibleDestinationIndex.value >= 0 && compatibleSlotIndex.value >= 0
    ? flow.value?.destinations[compatibleDestinationIndex.value].slots[compatibleSlotIndex.value]
    : undefined,
);
const compatibleDestinationIndex = computed(
  () =>
    flow.value?.destinations.findIndex(
      (destination) => destination.id === compatibleDestinationId.value,
    ) ?? -1,
);
const compatibleDestinationLabel = computed(
  () =>
    catalog.value.destinations.find(
      (destination) => destination.id === compatibleDestination.value?.provider,
    )?.label ||
    compatibleDestination.value?.provider ||
    "Destination",
);
const newBuildEngines = computed(() =>
  newBuildType.value ? buildEnginesFor(catalog.value, newBuildType.value) : [],
);
const newBuildTargets = computed(() =>
  newBuildType.value && newBuildEngine.value
    ? buildTargetsFor(catalog.value, newBuildEngine.value, newBuildType.value)
    : [],
);
const canCreateBuild = computed(() =>
  Boolean(
    flow.value &&
    newBuildType.value &&
    newBuildEngine.value &&
    newBuildTarget.value &&
    newBuildTargets.value.some(
      (target) => target.id === newBuildTarget.value && buildTargetIsAvailable(target),
    ),
  ),
);
const draftTargets = computed(() =>
  draftBuild.value
    ? buildTargetsFor(catalog.value, draftBuild.value.engine, draftBuild.value.type)
    : [],
);
const draftTargetSelectionSignature = computed(
  () =>
    draftBuild.value?.targets.map((target) => `${target.id}:${target.enabled ? 1 : 0}`).join(",") ||
    "",
);
const producerInspectionSignature = computed(() => buildInspectionSignature(draftBuild.value));
const engineChangeNotice = computed(() =>
  Boolean(draftBuild.value && draftBuild.value.engine !== originalEngine.value),
);
const originalEngine = ref("");
const canApplyBuildSettings = computed(() => {
  if (!draftBuild.value) return false;
  if (!engineChangeNotice.value) return true;
  return draftBuild.value.targets.some((target) => {
    const definition = draftTargets.value.find((candidate) => candidate.id === target.id);
    return target.enabled && Boolean(definition && buildTargetIsAvailable(definition));
  });
});
const draftBuildInputOptions = computed(() =>
  draftBuild.value ? buildInputOptions.value[draftBuild.value.id] || [] : [],
);
const buildTypeLabel = (id: string) =>
  catalog.value.buildTypes.find((type) => type.id === id)?.label || id;
const engineDefinition = (id: string) =>
  catalog.value.producers.find((producer) => producer.id === id);
const producerDefinition = (id: string) => engineDefinition(id);
const engineLabel = (id: string) => engineDefinition(id)?.label || id;
const targetDefinition = (engine: string, type: string, targetId: string) =>
  buildTargetsFor(catalog.value, engine, type).find((target) => target.id === targetId);
const enabledTargetLabels = (build: ReleaseBuildProfileConfig) =>
  buildProfileSummary(catalog.value, build).targetLabels;
const outputLabel = (ref?: ReleaseOutputRef) => {
  if (!ref) return "No input selected";
  if ("source" in ref)
    return `Source · ${catalog.value.sources.find((source) => source.id === flow.value?.source.provider)?.label || flow.value?.source.provider || "output"}`;
  const build = flow.value?.builds.find((candidate) => candidate.id === ref.buildId);
  const target = build && targetDefinition(build.engine, build.type, ref.targetId);
  return `${build?.name || (build ? buildTypeLabel(build.type) : "Missing build")} · ${target?.label || ref.targetId}`;
};
const buildIssues = (build: ReleaseBuildProfileConfig, index: number) =>
  deduplicateValidationIssues([
    ...(plan.value ? issuesForPath(plan.value.issues, `builds.${index}`) : []),
    ...producerInspectionIssues.value.filter(
      (issue) => issue.path === `builds.${index}` || issue.path?.startsWith(`builds.${index}.`),
    ),
  ]);
const buildReadiness = (build: ReleaseBuildProfileConfig, index: number) => {
  if (!build.enabled) return "Disabled";
  if (!plan.value || planning.value) return "Checking";
  if (buildIssues(build, index).some((issue) => issue.severity === "error"))
    return "Needs attention";
  if (!build.targets.some((target) => target.enabled)) return "Select a target";
  return "Ready";
};
const sourceFieldOptions = (field: ReleaseFieldDefinition) =>
  field.type === "connection"
    ? connections.value
        .filter(
          (connection) =>
            !field.integration ||
            connection.pluginName === field.integration ||
            connection.integrationName === field.integration,
        )
        .map((connection) => ({ label: connection.name || connection.id, value: connection.id }))
    : producerInspectionOptions.value[field.key] || field.options || [];
const fieldOptions = (field: ReleaseFieldDefinition) => sourceFieldOptions(field);
const producerFieldIssues = (build: ReleaseBuildProfileConfig, key: string) => {
  const index = flow.value?.builds.findIndex((item) => item.id === build.id) ?? -1;
  return index < 0
    ? []
    : producerInspectionIssues.value.filter(
        (issue) => issue.path === `builds.${index}.config.${key}`,
      );
};
const producerTargetFieldIssues = (
  build: ReleaseBuildProfileConfig,
  targetId: string,
  key: string,
) => {
  const index = flow.value?.builds.findIndex((item) => item.id === build.id) ?? -1;
  const targetIndex = build.targets.findIndex((target) => target.id === targetId);
  return index < 0 || targetIndex < 0
    ? []
    : producerInspectionIssues.value.filter(
        (issue) => issue.path === `builds.${index}.targets.${targetIndex}.config.${key}`,
      );
};
const fieldValue = (config: Record<string, unknown>, key: string) => String(config[key] ?? "");
const setField = (config: Record<string, unknown>, key: string, value: unknown) => {
  config[key] = String(value ?? "");
};

let loadGeneration = 0;
let latestPlanRequest = 0;
let latestCompatibleRequest = 0;
let latestBuildInputRequest = 0;
let latestProducerInspectRequest = 0;
let changeRevision = 0;
let persistedRevision = 0;
let hydrating = false;
let saveTimer: ReturnType<typeof setTimeout> | undefined;
let planTimer: ReturnType<typeof setTimeout> | undefined;
let producerInspectTimer: ReturnType<typeof setTimeout> | undefined;
let handledBuildIssueKey = "";
const persistPendingChanges = () =>
  persistBuildChangesBeforeNavigation(
    () => changeRevision !== persistedRevision,
    () => {
      clearTimeout(saveTimer);
      saveTimer = undefined;
    },
    save,
  );
onBeforeRouteLeave(() => persistPendingChanges());
onBeforeRouteUpdate((to, from) => {
  if (to.params.flowId === from.params.flowId && to.params.projectId === from.params.projectId)
    return true;
  return persistPendingChanges();
});
const loadWorkflow = async () => {
  const generation = ++loadGeneration;
  const requestedFlowId = flowId.value;
  const requestedProjectId = projectId.value;
  latestPlanRequest += 1;
  latestCompatibleRequest += 1;
  if (
    flow.value &&
    (flow.value.id !== requestedFlowId || flow.value.project !== requestedProjectId)
  ) {
    clearTimeout(saveTimer);
    saveTimer = undefined;
    clearTimeout(planTimer);
    if (!(await persistPendingChanges())) return;
    discardBuildSettings();
    handledBuildIssueKey = "";
  }
  if (generation !== loadGeneration) return;
  loadError.value = "";
  plannerError.value = "";
  try {
    const [catalogResult, workflowResult] = await Promise.all([
      api.execute("release:catalog:get"),
      api.execute("workflow:load", { workflowId: requestedFlowId, projectId: requestedProjectId }),
    ]);
    if (generation !== loadGeneration) return;
    if (catalogResult.type === "error") throw new Error(catalogResult.ipcError);
    if (workflowResult.type === "error") throw new Error(workflowResult.ipcError);
    if (
      workflowResult.result.id !== requestedFlowId ||
      workflowResult.result.project !== requestedProjectId
    )
      throw new Error("Loaded workflow identity does not match the requested route.");

    hydrating = true;
    catalog.value = catalogResult.result;
    flow.value = workflowResult.result;
    await nextTick();
    hydrating = false;
    changeRevision = 0;
    persistedRevision = 0;
    saveState.value = "saved";
    saveError.value = "";
    await refreshPlan();
    if (generation === loadGeneration) await openRequestedBuildIssue();
    if (generation === loadGeneration && compatibleRouteRequested.value)
      await refreshCompatibleBuilds();
  } catch (cause) {
    if (generation === loadGeneration) {
      hydrating = false;
      loadError.value = cause instanceof Error ? cause.message : String(cause);
    }
  }
};

const refreshPlan = async () => {
  if (!flow.value) return;
  const requestId = ++latestPlanRequest;
  const config = structuredClone(toRaw(flow.value));
  planning.value = true;
  plannerError.value = "";
  try {
    const result = await api.execute("release:plan", { config });
    if (requestId !== latestPlanRequest) return;
    if (result.type === "error") {
      plan.value = undefined;
      plannerError.value = result.ipcError;
      return;
    }
    plan.value = result.result;
  } catch (cause) {
    if (requestId === latestPlanRequest) {
      plan.value = undefined;
      plannerError.value = cause instanceof Error ? cause.message : String(cause);
    }
  } finally {
    if (requestId === latestPlanRequest) planning.value = false;
  }
};

const save = createSerializedTaskQueue(async () => {
  if (!flow.value) return;
  const revision = changeRevision;
  const snapshot = structuredClone(toRaw(flow.value));
  saveState.value = "saving";
  saveError.value = "";
  const result = await api.execute("workflow:save", {
    workflowId: snapshot.id,
    projectId: snapshot.project,
    data: snapshot,
  });
  if (result.type === "error") {
    saveState.value = "error";
    saveError.value = result.ipcError;
    throw new Error(result.ipcError);
  }
  persistedRevision = revision;
  if (persistedRevision !== changeRevision) void save().catch(() => {});
  else {
    saveState.value = "saved";
    saveError.value = "";
  }
});

watch(
  flow,
  () => {
    if (hydrating || !flow.value) return;
    changeRevision += 1;
    latestPlanRequest += 1;
    latestCompatibleRequest += 1;
    latestBuildInputRequest += 1;
    if (compatibleRouteRequested.value) {
      compatibleCandidates.value = [];
      compatibleChecking.value = true;
    }
    clearTimeout(saveTimer);
    clearTimeout(planTimer);
    planning.value = true;
    saveTimer = setTimeout(() => void save().catch(() => {}), 700);
    planTimer = setTimeout(async () => {
      await refreshPlan();
      if (compatibleRouteRequested.value) void refreshCompatibleBuilds();
    }, 300);
  },
  { deep: true, flush: "sync" },
);

const refreshCompatibleBuilds = async () => {
  const requestId = ++latestCompatibleRequest;
  const destinationId = compatibleDestinationId.value;
  const slotId = compatibleSlotId.value;
  if (!flow.value || !destinationId || !slotId) {
    compatibleCandidates.value = [];
    compatibleError.value = "";
    compatibleChecking.value = false;
    return;
  }
  if (!compatibleSlot.value) {
    compatibleCandidates.value = [];
    compatibleError.value = "This destination or deployment slot no longer exists.";
    return;
  }
  const snapshot = structuredClone(toRaw(flow.value));
  compatibleChecking.value = true;
  compatibleError.value = "";
  try {
    const choices = await probeCompatibleBuildCandidates(
      snapshot,
      catalog.value,
      destinationId,
      slotId,
      async (candidateConfig) => {
        const result = await api.execute("release:plan", { config: candidateConfig });
        if (result.type === "error") throw new Error(result.ipcError);
        return result.result;
      },
      () => requestId === latestCompatibleRequest,
    );
    if (requestId === latestCompatibleRequest) compatibleCandidates.value = choices;
  } catch (cause) {
    if (requestId === latestCompatibleRequest)
      compatibleError.value = cause instanceof Error ? cause.message : String(cause);
  } finally {
    if (requestId === latestCompatibleRequest) compatibleChecking.value = false;
  }
};

const refreshBuildInputs = async () => {
  if (!settingsVisible.value || !draftBuild.value || !flow.value || !plan.value) return;
  const requestId = ++latestBuildInputRequest;
  const buildId = draftBuild.value.id;
  const buildIndex = flow.value.builds.findIndex((build) => build.id === buildId);
  if (buildIndex < 0) return;
  const candidateConfig = structuredClone(toRaw(flow.value));
  candidateConfig.builds[buildIndex] = structuredClone(toRaw(draftBuild.value));
  const candidates = planOutputOptions(candidateConfig, plan.value, catalog.value);
  buildInputChecking.value = true;
  buildInputError.value = "";
  try {
    const options = await probeBuildInputCandidates(
      candidateConfig,
      buildId,
      candidates,
      async (config) => {
        const result = await api.execute("release:plan", { config });
        if (result.type === "error") throw new Error(result.ipcError);
        return result.result;
      },
      () => requestId === latestBuildInputRequest && settingsVisible.value,
    );
    if (requestId === latestBuildInputRequest)
      buildInputOptions.value = { ...buildInputOptions.value, [buildId]: options };
  } catch (cause) {
    if (requestId === latestBuildInputRequest)
      buildInputError.value = cause instanceof Error ? cause.message : String(cause);
  } finally {
    if (requestId === latestBuildInputRequest) buildInputChecking.value = false;
  }
};
watch(
  [settingsVisible, () => draftBuild.value?.engine, draftTargetSelectionSignature, plan],
  ([visible]) => {
    if (visible) void refreshBuildInputs();
    else {
      latestBuildInputRequest += 1;
      buildInputChecking.value = false;
    }
  },
);

const inspectDraftBuild = async () => {
  if (!flow.value || !draftBuild.value) return;
  const requestId = ++latestProducerInspectRequest;
  const build = structuredClone(toRaw(draftBuild.value));
  const sourceConfig = structuredClone(toRaw(flow.value.source.config));
  const buildIndex = flow.value.builds.findIndex((candidate) => candidate.id === build.id);
  if (buildIndex < 0) return;
  const isCurrent = () =>
    producerInspectionResponseIsCurrent(
      requestId,
      latestProducerInspectRequest,
      settingsVisible.value,
      build.id,
      draftBuild.value?.id,
    );
  producerInspectionChecking.value = true;
  try {
    const result = await api.execute("release:producer:inspect", {
      provider: build.engine,
      sourceConfig,
      config: {
        id: build.id,
        provider: build.engine,
        enabled: build.enabled,
        config: build.config,
        targets: build.targets,
      },
    });
    if (!isCurrent()) return;
    if (result.type === "error") throw new Error(result.ipcError);
    const data = result.result as ProducerInspection;
    const applied = applyProducerInspection(
      build,
      buildIndex,
      { ...data, issues: data.issues || [] },
      { applyFieldValues: false },
    );
    producerInspectionOptions.value = applied.options;
    producerInspectionIssues.value = applied.issues;
  } catch (cause) {
    if (!isCurrent()) return;
    producerInspectionOptions.value = {};
    producerInspectionIssues.value = [
      {
        code: "release.producer.inspect",
        message: cause instanceof Error ? cause.message : String(cause),
        severity: "error",
        path: `builds.${buildIndex}`,
      },
    ];
  } finally {
    if (isCurrent()) producerInspectionChecking.value = false;
  }
};

watch(
  [settingsVisible, producerInspectionSignature],
  ([visible]) => {
    latestProducerInspectRequest += 1;
    clearTimeout(producerInspectTimer);
    producerInspectTimer = undefined;
    producerInspectionChecking.value = false;
    producerInspectionOptions.value = {};
    producerInspectionIssues.value = [];
    if (!visible || !draftBuild.value) return;
    producerInspectionChecking.value = true;
    producerInspectTimer = setTimeout(() => void inspectDraftBuild(), 250);
  },
  { flush: "sync" },
);

const openAddBuild = () => {
  newBuildType.value = undefined;
  newBuildEngine.value = undefined;
  newBuildTarget.value = undefined;
  addVisible.value = true;
};
const onNewBuildTypeChange = () => {
  newBuildEngine.value = undefined;
  newBuildTarget.value = undefined;
};
const onNewBuildEngineChange = () => {
  newBuildTarget.value = undefined;
};
const addBuild = () => {
  if (
    !flow.value ||
    !canCreateBuild.value ||
    !newBuildType.value ||
    !newBuildEngine.value ||
    !newBuildTarget.value
  )
    return;
  const build = createBuildProfile(
    catalog.value,
    newBuildType.value,
    newBuildEngine.value,
    nanoid(),
    [newBuildTarget.value],
  );
  if (!build) return;
  flow.value.builds.push(build);
  addVisible.value = false;
};
const createCompatibleBuild = (choice: CompatibleBuildCandidate) => {
  if (!flow.value || !compatibleSlot.value) return;
  const target = buildTargetsFor(catalog.value, choice.engine, choice.type).find(
    (candidate) => candidate.id === choice.target,
  );
  if (!target || !buildTargetIsAvailable(target)) return;
  const build = createBuildProfile(catalog.value, choice.type, choice.engine, nanoid(), [
    choice.target,
  ]);
  if (!build) return;
  flow.value.builds.push(build);
  compatibleSlot.value.input = { buildId: build.id, targetId: choice.target };
  compatibleCandidates.value = compatibleCandidates.value.filter(
    (candidate) =>
      !(
        candidate.type === choice.type &&
        candidate.engine === choice.engine &&
        candidate.target === choice.target
      ),
  );
};
const clearCompatibleRoute = () => router.replace({ path: `${basePath.value}/builds` });
const openRequestedBuildIssue = async () => {
  const routeKey = requestedBuildIssueKey.value;
  if (
    !routeKey ||
    !flow.value ||
    flow.value.id !== flowId.value ||
    flow.value.project !== projectId.value ||
    routeKey === handledBuildIssueKey
  )
    return;
  handledBuildIssueKey = routeKey;
  const build = resolveBuildIssueRequest(
    flow.value.builds,
    requestedBuildId.value,
    requestedIssuePath.value,
  );
  if (!build) {
    requestedBuildUnavailable.value = true;
    return;
  }
  requestedBuildUnavailable.value = false;
  await openBuildSettings(build, requestedIssuePath.value);
};
const dismissBuildIssueRequest = () => {
  requestedBuildUnavailable.value = false;
  handledBuildIssueKey = "";
  void router.replace({
    path: `${basePath.value}/builds`,
    query: { ...route.query, buildId: undefined, issuePath: undefined },
  });
};

const buildTargetControlId = (buildId: string, targetId: string) =>
  `build-target-${buildId}-${targetId}`;
const isSettingsIssueControl = (controlId: string) =>
  Boolean(controlId && settingsIssueControlId.value === controlId);
const focusSettingsIssue = () => {
  const controlId = settingsIssueControlId.value;
  if (!controlId) return;
  requestAnimationFrame(() => {
    if (settingsIssueControlId.value !== controlId) return;
    const direct = document.getElementById(controlId);
    const wrapper = [...document.querySelectorAll<HTMLElement>("[data-control-id]")].find(
      (element) => element.dataset.controlId === controlId,
    );
    const target =
      direct || wrapper?.querySelector<HTMLElement>("input, button, [tabindex]") || wrapper;
    if (!target) return;
    target.scrollIntoView({ block: "center", behavior: "smooth" });
    target.focus({ preventScroll: true });
  });
};
const openBuildSettings = (build: ReleaseBuildProfileConfig, issuePath = "") => {
  if (!flow.value) return;
  originalEngine.value = build.engine;
  draftBuild.value = structuredClone(toRaw(build));
  settingsIssuePath.value = issuePath;
  const buildIndex = flow.value.builds.findIndex((candidate) => candidate.id === build.id);
  settingsIssueControlId.value =
    issuePath && buildIndex >= 0 ? buildIssueControlId(build, buildIndex, issuePath) || "" : "";
  producerInspectionIssues.value = [];
  producerInspectionOptions.value = {};
  buildInputError.value = "";
  settingsVisible.value = true;
  void nextTick().then(focusSettingsIssue);
};
const discardBuildSettings = () => {
  settingsVisible.value = false;
  draftBuild.value = undefined;
  settingsIssuePath.value = "";
  settingsIssueControlId.value = "";
  latestBuildInputRequest += 1;
  latestProducerInspectRequest += 1;
  clearTimeout(producerInspectTimer);
  producerInspectTimer = undefined;
  producerInspectionChecking.value = false;
  buildInputChecking.value = false;
};
const stageEngineChange = (engine: string) => {
  if (!draftBuild.value || engine === draftBuild.value.engine) return;
  const switched = switchBuildProfileEngine(catalog.value, draftBuild.value, engine);
  if (!switched) return;
  draftBuild.value = switched;
};
const draftTargetEnabled = (targetId: string) =>
  Boolean(draftBuild.value?.targets.some((target) => target.id === targetId && target.enabled));
const toggleDraftTarget = (target: ReleaseCatalogTarget) => {
  if (!draftBuild.value) return;
  setBuildTargetEnabled(
    draftBuild.value,
    target.id,
    !draftTargetEnabled(target.id),
    target.availability,
  );
};
const setDraftBuildInput = (value: string) => {
  if (draftBuild.value) selectBuildInput(draftBuild.value, draftBuildInputOptions.value, value);
};
const applyBuildSettings = () => {
  if (!flow.value || !draftBuild.value || !canApplyBuildSettings.value) return;
  const currentBuild = flow.value.builds.find((build) => build.id === draftBuild.value?.id);
  if (!currentBuild) return;
  const nextBuild = structuredClone(toRaw(draftBuild.value));
  const commit = () => {
    const index = flow.value?.builds.findIndex((build) => build.id === nextBuild.id) ?? -1;
    if (index < 0 || !flow.value) return;
    flow.value.builds[index] = nextBuild;
    settingsVisible.value = false;
    draftBuild.value = undefined;
  };
  if (nextBuild.engine !== currentBuild.engine) {
    const discardedSettings = Object.keys(currentBuild.config).filter(
      (key) =>
        !(key in nextBuild.config) &&
        currentBuild.config[key] !== undefined &&
        currentBuild.config[key] !== null &&
        currentBuild.config[key] !== "",
    );
    const nextTargets = new Map(nextBuild.targets.map((target) => [target.id, target]));
    const disabledTargets = currentBuild.targets
      .filter((target) => target.enabled && !nextTargets.get(target.id)?.enabled)
      .map(
        (target) =>
          buildTargetsFor(catalog.value, currentBuild.engine, currentBuild.type).find(
            (definition) => definition.id === target.id,
          )?.label || target.id,
      );
    const consumers = outputReferenceConsumers(
      flow.value,
      { buildId: currentBuild.id },
      catalog.value,
    );
    const impact = outputReferenceChangeImpact(
      {
        kind: "build-engine",
        buildName: buildLabel(currentBuild),
        newEngine: engineLabel(nextBuild.engine),
        discardedSettings,
        disabledTargets,
      },
      consumers,
    );
    if (impact.confirmationRequired) {
      confirm.require({
        header: `Change engine for ${buildLabel(currentBuild)}`,
        message: impact.message,
        icon: "pi pi-exclamation-triangle",
        rejectProps: { label: "Cancel", severity: "secondary", outlined: true },
        acceptProps: { label: "Apply engine" },
        accept: commit,
      });
      return;
    }
  }
  commit();
};
const buildLabel = (build: ReleaseBuildProfileConfig) =>
  build.name?.trim() || buildTypeLabel(build.type);
const buildConsumerList = (build: ReleaseBuildProfileConfig) =>
  flow.value ? outputReferenceConsumers(flow.value, { buildId: build.id }, catalog.value) : [];
const setBuildEnabled = (build: ReleaseBuildProfileConfig, enabled: boolean) => {
  if (!flow.value || build.enabled === enabled) return;
  if (enabled) {
    build.enabled = true;
    return;
  }
  const impact = outputReferenceChangeImpact(
    { kind: "build-disable", buildName: buildLabel(build) },
    buildConsumerList(build),
  );
  if (!impact.confirmationRequired) {
    build.enabled = false;
    return;
  }
  confirm.require({
    header: `Disable ${buildLabel(build)}`,
    message: impact.message,
    icon: "pi pi-exclamation-triangle",
    rejectProps: { label: "Keep enabled", severity: "secondary", outlined: true },
    acceptProps: { label: "Disable build", severity: "danger" },
    accept: () => {
      build.enabled = false;
    },
  });
};
const removeBuild = (build: ReleaseBuildProfileConfig) => {
  if (!flow.value) return;
  const impact = outputReferenceChangeImpact(
    { kind: "build-remove", buildName: buildLabel(build) },
    buildConsumerList(build),
  );
  confirm.require({
    header: `Remove ${buildLabel(build)}`,
    message:
      impact.message || `Removing “${buildLabel(build)}” will delete its build configuration.`,
    icon: "pi pi-exclamation-triangle",
    rejectProps: { label: "Keep build", severity: "secondary", outlined: true },
    acceptProps: { label: "Remove build", severity: "danger" },
    accept: () => {
      if (settingsVisible.value && draftBuild.value?.id === build.id) discardBuildSettings();
      if (flow.value) removeBuildProfile(flow.value, build.id);
    },
  });
};

const providerIcon = (icon: IconType | undefined) =>
  icon?.type === "icon"
    ? icon.icon.includes("mdi") || icon.icon.includes("pi-")
      ? icon.icon
      : `mdi ${icon.icon}`
    : "mdi mdi-hammer-wrench";
const producerIcon = (id: string) => providerIcon(engineDefinition(id)?.icon);
const openConnection = (integration: string) => {
  const definition = appStore.pluginDefinitions.find(
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
const createConnection = async () => {
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
      buildInputError.value = result.ipcError;
      return;
    }
    await connectionsStore.load(true);
    connectionVisible.value = false;
  } catch (cause) {
    buildInputError.value = cause instanceof Error ? cause.message : "Unable to save connection.";
  } finally {
    connectionSaving.value = false;
  }
};

onMounted(async () => {
  await connectionsStore.init();
  await loadWorkflow();
});
watch([flowId, projectId], () => {
  if (flow.value) void loadWorkflow();
});
watch(requestedBuildIssueKey, () => {
  if (flow.value) void openRequestedBuildIssue();
});
watch([compatibleDestinationId, compatibleSlotId], () => {
  if (flow.value) void refreshCompatibleBuilds();
});
onUnmounted(() => {
  loadGeneration += 1;
  latestPlanRequest += 1;
  latestCompatibleRequest += 1;
  latestBuildInputRequest += 1;
  latestProducerInspectRequest += 1;
  clearTimeout(saveTimer);
  clearTimeout(planTimer);
  clearTimeout(producerInspectTimer);
});
</script>

<style scoped>
.builds-page {
  max-width: 1040px;
  margin: 0 auto;
  padding-bottom: 48px;
}
.autosave-state {
  color: var(--p-text-muted-color, var(--text-color-secondary));
  font-size: 0.75rem;
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
.section-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 14px;
}
.eyebrow {
  color: var(--p-text-muted-color, var(--text-color-secondary));
  font-size: 0.68rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}
.section-heading h2 {
  margin: 3px 0 0;
  font-size: 1rem;
}
.section-heading p {
  margin: 4px 0 0;
  color: var(--p-text-muted-color, var(--text-color-secondary));
  font-size: 0.8rem;
}
.build-count {
  color: var(--p-text-muted-color, var(--text-color-secondary));
  font-size: 0.8rem;
}
.build-section,
.compatible-section {
  margin-bottom: 28px;
}
.build-list,
.choice-list {
  display: grid;
  gap: 8px;
}
.build-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 12px 20px;
  padding: 14px 16px;
  border: 1px solid var(--p-surface-200, var(--surface-border));
  border-radius: 8px;
  background: var(--p-surface-0, var(--surface-card));
}
.build-row.build-invalid {
  border-color: color-mix(
    in srgb,
    var(--p-orange-500, #f97316) 40%,
    var(--p-surface-200, var(--surface-border))
  );
}
.build-row.build-disabled {
  opacity: 0.72;
}
.build-main {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  min-width: 0;
}
.build-icon {
  display: grid;
  width: 34px;
  height: 34px;
  flex: 0 0 auto;
  place-items: center;
  color: var(--p-text-muted-color, var(--text-color-secondary));
  background: var(--p-surface-100, var(--surface-ground));
  border-radius: 7px;
  font-size: 17px;
}
.build-copy {
  display: grid;
  gap: 3px;
  min-width: 0;
}
.build-copy strong {
  overflow-wrap: anywhere;
  font-size: 0.88rem;
}
.build-copy span {
  color: var(--p-text-muted-color, var(--text-color-secondary));
  font-size: 0.78rem;
}
.build-copy small {
  color: var(--p-text-muted-color, var(--text-color-secondary));
  font-size: 0.72rem;
  overflow-wrap: anywhere;
}
.build-status {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
}
.build-issues {
  grid-column: 1 / -1;
  margin: 0;
  padding: 9px 0 0 46px;
  border-top: 1px solid var(--p-surface-100, var(--surface-border));
  color: var(--p-orange-700, #c2410c);
  font-size: 0.75rem;
}
.compatible-section {
  padding: 16px;
  border: 1px solid var(--p-surface-200, var(--surface-border));
  border-radius: 8px;
  background: var(--p-surface-50, var(--surface-ground));
}
.compatible-choice {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 12px;
  border: 1px solid var(--p-surface-200, var(--surface-border));
  border-radius: 6px;
  background: var(--p-surface-0, var(--surface-card));
}
.choice-copy {
  display: grid;
  gap: 3px;
}
.choice-copy strong {
  font-size: 0.8rem;
}
.choice-copy span,
.inline-state {
  color: var(--p-text-muted-color, var(--text-color-secondary));
  font-size: 0.75rem;
}
.empty-state {
  display: grid;
  justify-items: center;
  gap: 8px;
  padding: 44px 20px;
  border: 1px dashed var(--p-surface-300, var(--surface-border));
  border-radius: 8px;
  text-align: center;
}
.empty-state > i {
  color: var(--p-text-muted-color, var(--text-color-secondary));
  font-size: 1.6rem;
}
.empty-state strong {
  font-size: 0.9rem;
}
.empty-state span {
  max-width: 340px;
  color: var(--p-text-muted-color, var(--text-color-secondary));
  font-size: 0.78rem;
}
.state-copy {
  display: grid;
  justify-items: start;
  gap: 6px;
}
.state-copy span {
  font-size: 0.8rem;
}
.build-issue-context {
  display: grid;
  grid-column: 1 / -1;
  gap: 5px;
  padding: 10px 12px;
  border: 1px solid color-mix(in srgb, var(--primary-color) 35%, var(--surface-border));
  border-radius: 7px;
  background: var(--p-surface-50, var(--surface-ground));
  font-size: 0.75rem;
}
.build-issue-context span {
  color: var(--p-text-muted-color, var(--text-color-secondary));
}
.build-issue-context code {
  overflow-wrap: anywhere;
  color: var(--p-text-muted-color, var(--text-color-secondary));
  font-size: 0.68rem;
}
.issue-focus {
  outline: 2px solid var(--primary-color);
  outline-offset: 3px;
}
.settings-footer {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
}
.settings-footer-spacer {
  flex: 1;
}
.settings-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 18px 16px;
}
.release-field {
  display: grid;
  gap: 6px;
  min-width: 0;
}
.release-field.wide {
  grid-column: 1 / -1;
}
.release-field > label,
.field-label {
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--p-text-muted-color, var(--text-color-secondary));
}
.target-list {
  display: grid;
  gap: 6px;
}
.target-row {
  display: grid;
  grid-template-columns: 18px minmax(0, auto) minmax(0, 1fr);
  align-items: center;
  gap: 8px;
  min-height: 38px;
  padding: 7px 9px;
  border: 1px solid var(--p-surface-200, var(--surface-border));
  border-radius: 6px;
  background: var(--p-surface-0, var(--surface-card));
  color: var(--text-color);
  text-align: left;
  cursor: pointer;
}
.target-row.selected {
  border-color: var(--primary-color);
  background: var(--p-primary-50, var(--p-surface-50, var(--surface-ground)));
}
.target-row:disabled {
  cursor: not-allowed;
  opacity: 0.62;
}
.target-row small {
  justify-self: end;
  color: var(--p-text-muted-color, var(--text-color-secondary));
  font-size: 0.68rem;
  text-align: right;
}
.field-note,
.inline-state {
  color: var(--p-text-muted-color, var(--text-color-secondary));
  font-size: 0.72rem;
}
.field-issue-error {
  color: var(--p-red-500, #ef4444);
}
:root.dark .build-row,
:root.dark .compatible-choice,
:root.dark .target-row {
  border-color: var(--p-surface-700, #3f3f46);
  background: var(--p-surface-900, #18181b);
}
:root.dark .compatible-section {
  border-color: var(--p-surface-700, #3f3f46);
  background: var(--p-surface-900, #18181b);
}
:root.dark .build-icon {
  background: var(--p-surface-800, #27272a);
}
:root.dark .target-row.selected {
  border-color: var(--primary-color);
  background: var(--p-surface-800, #27272a);
}
:root.dark .build-issues {
  border-color: var(--p-surface-700, #3f3f46);
  color: var(--p-orange-300, #fdba74);
}
:root.dark .build-issue-context {
  border-color: var(--p-surface-700, #3f3f46);
  background: var(--p-surface-900, #18181b);
}
@media (max-width: 720px) {
  .build-row {
    grid-template-columns: minmax(0, 1fr);
  }
  .build-status {
    justify-content: flex-start;
  }
  .build-issues {
    padding-left: 0;
  }
  .section-heading {
    align-items: flex-start;
  }
  .settings-grid {
    grid-template-columns: minmax(0, 1fr);
  }
  .release-field.wide {
    grid-column: 1;
  }
  .compatible-choice {
    align-items: flex-start;
    flex-direction: column;
  }
}
</style>
