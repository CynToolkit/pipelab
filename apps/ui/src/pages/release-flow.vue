<template>
  <Layout>
    <WorkflowShell
      :flow-id="flowId"
      :project-id="projectId"
      :title="flow?.name || 'Release'"
      :subtitle="flow?.description || 'Build once, then ship everywhere.'"
      active="configuration"
    >
      <template #actions>
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
          :disabled="!flow || running"
          @click="ship"
        />
      </template>
      <main v-if="flow" class="release-page">
        <Message v-if="error" severity="error">{{ error }}</Message>
        <Message v-if="issues.length" :severity="errorCount ? 'error' : 'warn'"
          ><strong
            >{{ issues.length }} configuration issue{{ issues.length === 1 ? "" : "s" }}</strong
          ><span class="summary-copy"
            >The planner is authoritative. Fix the highlighted fields before shipping.</span
          >
          <ul class="issue-summary">
            <li v-for="issue in issues" :key="`${issue.code}:${issue.path}`">
              <Tag
                :value="issue.severity"
                :severity="issue.severity === 'error' ? 'danger' : 'warn'"
              />
              {{ issue.message }}
            </li>
          </ul></Message
        >
        <section v-if="plan?.graph.nodes.length" class="plan-panel">
          <div class="section-heading">
            <div>
              <span class="eyebrow">Resolved by planner</span>
              <h2>Build plan</h2>
              <p>Automatic transforms appear as plumbing, never as configurable builds.</p>
            </div>
          </div>
          <ol class="plan-list">
            <li v-for="node in plan.graph.nodes" :key="node.id">
              <i :class="nodeIcon(node.kind)" /><span>{{ planNodeLabel(node.id, node.kind) }}</span>
            </li>
          </ol>
        </section>
        <section class="release-section">
          <div class="section-heading">
            <div>
              <span class="eyebrow">Pipeline</span>
              <h2>Source</h2>
              <p>Choose the project or files this release represents.</p>
            </div>
            <Button label="Change" text icon="pi pi-pencil" @click="sourcePickerVisible = true" />
          </div>
          <article class="source-card" :class="{ invalid: cardIssues('source').length }">
            <div class="provider-icon">
              <i :class="providerIcon(sourceDefinition?.icon, 'mdi mdi-source-branch')" />
            </div>
            <div class="source-copy">
              <strong>{{ sourceDefinition?.label || flow.source.provider }}</strong
              ><span>{{ sourcePath || "No source selected" }}</span
              ><small>{{
                sourceDefinition?.description || "Source fields are defined by the catalog."
              }}</small>
            </div>
            <Tag
              :value="
                cardIssues('source').length
                  ? 'Needs attention'
                  : sourcePath
                    ? 'Ready'
                    : 'Not configured'
              "
              :severity="
                cardIssues('source').length ? 'warn' : sourcePath ? 'success' : 'secondary'
              "
            /><Button
              v-if="sourceDefinition?.fields?.length"
              icon="pi pi-cog"
              text
              rounded
              aria-label="Source settings"
              @click="sourceSettingsVisible = true"
            />
          </article>
        </section>
        <div class="pipeline-divider"><span>Builds</span></div>
        <section class="release-section">
          <div class="section-heading">
            <div>
              <span class="eyebrow">Build profiles</span>
              <h2>Build</h2>
              <p>Configure one or more profiles, including multiple profiles of the same type.</p>
            </div>
            <Button label="Add build" icon="pi pi-plus" @click="buildPickerVisible = true" />
          </div>
          <div v-if="!flow.builds.length" class="empty-card">
            <i class="mdi mdi-hammer-wrench" /><strong>No build profiles yet</strong
            ><span>Add a build profile to create release artifacts.</span>
          </div>
          <article
            v-for="(build, index) in flow.builds"
            :key="build.id"
            class="job-card"
            :class="{ disabled: !build.enabled, invalid: cardIssues(`builds.${index}`).length }"
          >
            <div class="job-header">
              <div class="provider-icon">
                <i
                  :class="
                    providerIcon(producerDefinition(build.engine)?.icon, 'mdi mdi-hammer-wrench')
                  "
                />
              </div>
              <div class="job-title">
                <strong>{{ build.name || buildTypeLabel(build.type) }}</strong
                ><span>{{ producerDefinition(build.engine)?.label || build.engine }}</span>
              </div>
              <Tag
                :value="
                  build.enabled
                    ? cardIssues(`builds.${index}`).length
                      ? 'Needs attention'
                      : 'Ready'
                    : 'Disabled'
                "
                :severity="
                  build.enabled
                    ? cardIssues(`builds.${index}`).length
                      ? 'warn'
                      : 'success'
                    : 'secondary'
                "
              /><ToggleSwitch
                v-model="build.enabled"
                :inputId="`build-${build.id}`"
                :aria-label="`${build.name || build.type} enabled`"
              /><Button
                v-if="hasBuildSettings(build)"
                icon="pi pi-cog"
                text
                rounded
                :aria-label="`Configure ${build.name || build.engine}`"
                @click="openBuildSettings(build)"
              /><Button
                icon="pi pi-trash"
                text
                rounded
                severity="danger"
                aria-label="Remove build"
                @click="removeBuild(build.id)"
              />
            </div>
            <div v-if="build.enabled" class="profile-fields">
              <div class="release-field">
                <label :for="`engine-${build.id}`">Engine</label
                ><Select
                  :id="`engine-${build.id}`"
                  :model-value="build.engine"
                  :options="buildEngines(build.type)"
                  optionLabel="label"
                  optionValue="id"
                  @update:model-value="switchEngine(build, $event)"
                />
              </div>
              <div class="release-field">
                <span class="field-label">Build type</span
                ><span class="field-value">{{ buildTypeLabel(build.type) }}</span>
              </div>
            </div>
            <div v-if="build.enabled" class="target-list">
              <span class="field-label">Targets</span
              ><button
                v-for="target in buildTargets(build)"
                :key="target.id"
                class="target-row"
                :class="{ selected: isTargetEnabled(build, target.id) }"
                :aria-pressed="isTargetEnabled(build, target.id)"
                @click="toggleTarget(build, target.id, !isTargetEnabled(build, target.id))"
              >
                <i
                  :class="
                    isTargetEnabled(build, target.id)
                      ? 'mdi mdi-check-circle'
                      : 'mdi mdi-circle-outline'
                  "
                /><span
                  ><strong>{{ target.label }}</strong
                  ><small>{{
                    target.buildType ? buildTypeLabel(target.buildType) : "Output target"
                  }}</small></span
                >
              </button>
            </div>
            <div v-if="build.enabled && buildInputs(build).length" class="routing-row">
              <span><i class="mdi mdi-source-branch" /> Input</span
              ><Select
                :model-value="outputRefValue(build.input || { source: true })"
                :options="buildInputs(build)"
                optionLabel="label"
                optionValue="value"
                @update:model-value="setBuildInput(build, $event)"
              />
            </div>
            <Message
              v-for="issue in cardIssues(`builds.${index}`)"
              :key="issue.code + issue.path"
              severity="warn"
              >{{ issue.message }}</Message
            >
          </article>
        </section>
        <div class="pipeline-divider"><span>Deploy</span></div>
        <section class="release-section">
          <div class="section-heading">
            <div>
              <span class="eyebrow">Environments</span>
              <h2>Deploy</h2>
              <p>Select explicit Source or Build Profile outputs for each destination.</p>
            </div>
            <Select
              v-model="destinationToAdd"
              :options="availableDestinations"
              optionLabel="label"
              optionValue="id"
              placeholder="Add destination"
              @change="addDestination"
            />
          </div>
          <div v-if="!flow.destinations.length" class="empty-card">
            <i class="mdi mdi-cloud-upload-outline" /><strong>No deployment jobs yet</strong
            ><span>Add a destination to create deployment slots.</span>
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
              <ToggleSwitch
                v-model="destination.enabled"
                :inputId="`destination-${destination.id}`"
                aria-label="Destination enabled"
              /><Button
                v-if="destinationDefinition(destination.provider)?.fields?.length"
                icon="pi pi-cog"
                text
                rounded
                aria-label="Destination settings"
                @click="openDestinationSettings(destination)"
              /><Button
                icon="pi pi-trash"
                text
                rounded
                severity="danger"
                aria-label="Remove destination"
                @click="removeDestination(destination.id)"
              />
            </div>
            <div v-if="destination.enabled" class="slot-list">
              <div v-for="slot in destination.slots" :key="slot.id" class="slot-row">
                <div class="deployment-main">
                  <i class="mdi mdi-package-variant-closed" /><span>{{
                    artifactLabel(slot.input)
                  }}</span>
                </div>
                <Button
                  icon="pi pi-cog"
                  text
                  rounded
                  aria-label="Configure deployment slot"
                  @click="openSlotSettings(destination, slot)"
                /><Button
                  icon="pi pi-trash"
                  text
                  rounded
                  severity="danger"
                  aria-label="Remove deployment slot"
                  @click="removeSlot(destination, slot.id)"
                />
              </div>
              <Button
                label="Add deployment"
                icon="pi pi-plus"
                text
                :disabled="!outputOptions.length"
                @click="addSlot(destination)"
              />
              <Button
                v-if="
                  cardIssues(`destinations.${index}`).some((issue) =>
                    issue.path?.includes('.input'),
                  )
                "
                label="Create compatible build"
                icon="pi pi-plus"
                text
                @click="buildPickerVisible = true"
              />
            </div>
            <Message
              v-for="issue in cardIssues(`destinations.${index}`)"
              :key="issue.code + issue.path"
              severity="warn"
              >{{ issue.message }}</Message
            >
          </article>
        </section>
      </main>
    </WorkflowShell>
    <Dialog
      v-model:visible="buildPickerVisible"
      modal
      header="Add build profile"
      :style="dialogStyle"
      ><div class="settings-grid">
        <div class="release-field">
          <label for="build-type">Build type</label
          ><Select
            id="build-type"
            v-model="newBuildType"
            :options="catalog.buildTypes"
            optionLabel="label"
            optionValue="id"
            placeholder="Choose a type"
          />
        </div>
        <div class="release-field">
          <label for="build-engine">Engine</label
          ><Select
            id="build-engine"
            v-model="newBuildEngine"
            :options="newBuildEngines"
            optionLabel="label"
            optionValue="id"
            placeholder="Choose a compatible engine"
            :disabled="!newBuildType"
          />
        </div>
        <p class="field-note">
          Automatic transforms are planner plumbing and are intentionally hidden from this list.
        </p>
      </div>
      <template #footer
        ><Button label="Cancel" text @click="buildPickerVisible = false" /><Button
          label="Add build"
          icon="pi pi-plus"
          :disabled="!newBuildType || !newBuildEngine"
          @click="addBuild" /></template
    ></Dialog>
    <Dialog v-model:visible="sourcePickerVisible" modal header="Choose source" :style="dialogStyle"
      ><div class="choice-grid">
        <button
          v-for="source in catalog.sources"
          :key="source.id"
          class="choice-card"
          :class="{ selected: flow?.source.provider === source.id }"
          @click="selectSource(source.id)"
        >
          <i :class="providerIcon(source.icon, 'mdi mdi-source-branch')" /><strong>{{
            source.label
          }}</strong
          ><small>{{ source.description }}</small>
        </button>
      </div></Dialog
    >
    <Dialog
      v-model:visible="sourceSettingsVisible"
      modal
      header="Source settings"
      :style="dialogStyle"
      ><div v-if="flow && sourceDefinition" class="settings-grid">
        <ReleaseFieldControl
          v-for="field in sourceDefinition.fields || []"
          :key="field.key"
          :field="field"
          :value="fieldValue(flow.source.config, field.key)"
          :options="fieldOptions(field)"
          :input-id="`source-${field.key}`"
          @update:value="setSourceField(field.key, $event)"
          @add-connection="openConnection"
        />
      </div>
      <template #footer><Button label="Done" @click="sourceSettingsVisible = false" /></template
    ></Dialog>
    <Dialog
      v-model:visible="buildSettingsVisible"
      modal
      header="Build settings"
      :style="wideDialogStyle"
      ><div v-if="settingsBuild" class="settings-grid">
        <ReleaseFieldControl
          v-for="field in producerDefinition(settingsBuild.engine)?.fields || []"
          :key="field.key"
          :field="field"
          :value="fieldValue(settingsBuild.config, field.key)"
          :options="fieldOptions(field)"
          :input-id="`build-${settingsBuild.id}-${field.key}`"
          @update:value="setField(settingsBuild.config, field.key, $event)"
          @add-connection="openConnection"
        /><template
          v-for="target in settingsBuild.targets.filter((item) => item.enabled)"
          :key="target.id"
          ><ReleaseFieldControl
            v-for="field in buildTargets(settingsBuild).find((item) => item.id === target.id)
              ?.fields || []"
            :key="`${target.id}-${field.key}`"
            :field="field"
            :value="fieldValue(target.config, field.key)"
            :options="fieldOptions(field)"
            :input-id="`target-${settingsBuild.id}-${target.id}-${field.key}`"
            @update:value="setField(target.config, field.key, $event)"
            @add-connection="openConnection"
        /></template>
      </div>
      <template #footer><Button label="Done" @click="buildSettingsVisible = false" /></template
    ></Dialog>
    <Dialog
      v-model:visible="destinationSettingsVisible"
      modal
      header="Destination settings"
      :style="dialogStyle"
      ><div v-if="settingsDestination" class="settings-grid">
        <ReleaseFieldControl
          v-for="field in destinationDefinition(settingsDestination.provider)?.fields || []"
          :key="field.key"
          :field="field"
          :value="fieldValue(settingsDestination.config, field.key)"
          :options="fieldOptions(field)"
          :input-id="`destination-${settingsDestination.id}-${field.key}`"
          @update:value="setField(settingsDestination.config, field.key, $event)"
          @add-connection="openConnection"
        />
      </div>
      <template #footer
        ><Button label="Done" @click="destinationSettingsVisible = false" /></template
    ></Dialog>
    <Dialog
      v-model:visible="slotSettingsVisible"
      modal
      header="Deployment settings"
      :style="dialogStyle"
      ><div v-if="settingsDestination && settingsSlot" class="settings-grid">
        <div class="release-field wide">
          <label>Output</label
          ><Select
            :model-value="outputRefValue(settingsSlot.input)"
            :options="outputOptions"
            optionLabel="label"
            optionValue="value"
            @update:model-value="setSlotInput(settingsSlot, $event)"
          />
        </div>
        <ReleaseFieldControl
          v-for="field in destinationDefinition(settingsDestination.provider)?.slotFields || []"
          :key="field.key"
          :field="field"
          :value="fieldValue(settingsSlot.config, field.key)"
          :options="fieldOptions(field)"
          :input-id="`slot-${settingsSlot.id}-${field.key}`"
          @update:value="setField(settingsSlot.config, field.key, $event)"
          @add-connection="openConnection"
        />
      </div>
      <template #footer><Button label="Done" @click="slotSettingsVisible = false" /></template
    ></Dialog>
    <Dialog v-model:visible="connectionVisible" modal header="Add connection" :style="dialogStyle"
      ><div class="settings-grid">
        <div class="release-field">
          <label for="connection-name">Name</label
          ><InputText
            id="connection-name"
            v-model="connectionDraft.name"
            placeholder="My account"
          />
        </div>
        <div class="release-field">
          <label for="connection-value">Credential</label
          ><InputText
            id="connection-value"
            v-model="connectionDraft.value"
            type="password"
            placeholder="Stored securely"
          />
        </div>
      </div>
      <template #footer
        ><Button label="Cancel" text @click="connectionVisible = false" /><Button
          label="Add connection"
          :loading="connectionSaving"
          :disabled="!connectionDraft.name.trim() || !connectionDraft.value.trim()"
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
          :disabled="!releaseVersion.trim()"
          @click="runShip" /></template
    ></Dialog>
  </Layout>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import Button from "primevue/button";
import Dialog from "primevue/dialog";
import InputText from "primevue/inputtext";
import Message from "primevue/message";
import Select from "primevue/select";
import Tag from "primevue/tag";
import Textarea from "primevue/textarea";
import ToggleSwitch from "primevue/toggleswitch";
import type {
  IconType,
  ReleaseBuildProfileConfig,
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
import Layout from "../components/Layout.vue";
import WorkflowShell from "../components/WorkflowShell.vue";
import ReleaseFieldControl from "../components/ReleaseFieldControl.vue";
import { useAPI } from "../composables/api";
import { useConnectionsStore } from "../store/connections";
import {
  buildEnginesFor,
  buildTargetsFor,
  createBuildProfile,
  issuesForPath,
  planOutputOptions,
  switchBuildProfileEngine,
} from "./release-flow-model";

const route = useRoute();
const router = useRouter();
const api = useAPI();
const connectionsStore = useConnectionsStore();
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
const error = ref("");
const running = ref(false);
const saveState = ref<"saving" | "saved" | "error">("saved");
const inspectionOptions = ref<Record<string, ReleaseFieldOption[]>>({});
const newBuildType = ref<string>();
const newBuildEngine = ref<string>();
const destinationToAdd = ref<string>();
const buildPickerVisible = ref(false);
const sourcePickerVisible = ref(false);
const sourceSettingsVisible = ref(false);
const buildSettingsVisible = ref(false);
const destinationSettingsVisible = ref(false);
const slotSettingsVisible = ref(false);
const releaseDetailsVisible = ref(false);
const settingsBuild = ref<ReleaseBuildProfileConfig>();
const settingsDestination = ref<ReleaseDestinationConfig>();
const settingsSlot = ref<ReleaseDestinationSlot>();
const releaseVersion = ref("1.0.0");
const releaseDescription = ref("");
const connectionVisible = ref(false);
const connectionSaving = ref(false);
const connectionDraft = ref({ name: "", value: "", integration: "" });
const dialogStyle = { width: "560px", maxWidth: "94vw" };
const wideDialogStyle = { width: "760px", maxWidth: "94vw" };
const saveStateLabel = computed(() =>
  saveState.value === "saving" ? "Saving…" : saveState.value === "error" ? "Error" : "Saved",
);
const errorCount = computed(
  () => issues.value.filter((issue) => issue.severity === "error").length,
);
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
    .filter(
      (connection) =>
        !field.integration ||
        connection.pluginName === field.integration ||
        connection.integrationName === field.integration,
    )
    .map((connection) => ({ label: connection.name || connection.id, value: connection.id }));
const fieldOptions = (field: ReleaseFieldDefinition) =>
  field.type === "connection"
    ? connectionOptions(field)
    : inspectionOptions.value[field.key] || field.options || [];
const cardIssues = (prefix: string) => issuesForPath(issues.value, prefix);
const sourcePath = computed(() => {
  const field = sourceDefinition.value?.fields?.find(
    (item) => item.type === "file" || item.type === "directory",
  );
  return field && flow.value ? fieldValue(flow.value.source.config, field.key) : "";
});
const outputRefValue = (ref: ReleaseOutputRef) =>
  "source" in ref ? "source" : `${ref.buildId}:${ref.targetId}`;
const outputOptions = computed(() =>
  flow.value && plan.value ? planOutputOptions(flow.value, plan.value, catalog.value) : [],
);
const buildInputs = (build: ReleaseBuildProfileConfig) =>
  outputOptions.value.filter(
    (output) => !("buildId" in output.ref && output.ref.buildId === build.id),
  );
const buildEngines = (type: string) => buildEnginesFor(catalog.value, type);
const buildTargets = (build: ReleaseBuildProfileConfig) =>
  buildTargetsFor(catalog.value, build.engine, build.type);
const newBuildEngines = computed(() => buildEngines(newBuildType.value || ""));
const buildTypeLabel = (id: string) =>
  catalog.value.buildTypes.find((type) => type.id === id)?.label || id;
const enabledTargetCount = (build: ReleaseBuildProfileConfig) =>
  build.targets.filter((target) => target.enabled).length;
const isTargetEnabled = (build: ReleaseBuildProfileConfig, id: string) =>
  build.targets.some((target) => target.id === id && target.enabled);
const hasBuildSettings = (build: ReleaseBuildProfileConfig) =>
  Boolean(
    producerDefinition(build.engine)?.fields?.length ||
    buildTargets(build).some((target) => target.fields?.length),
  );
const availableDestinations = computed(() =>
  catalog.value.destinations.filter(
    (item) => !flow.value?.destinations.some((destination) => destination.provider === item.id),
  ),
);
const addBuild = () => {
  if (!flow.value || !newBuildType.value || !newBuildEngine.value) return;
  const build = createBuildProfile(
    catalog.value,
    newBuildType.value,
    newBuildEngine.value,
    `${newBuildType.value}-${Date.now()}`,
  );
  if (build) flow.value.builds.push(build);
  newBuildType.value = undefined;
  newBuildEngine.value = undefined;
  buildPickerVisible.value = false;
};
const removeBuild = (id: string) => {
  if (flow.value) flow.value.builds = flow.value.builds.filter((build) => build.id !== id);
};
const toggleTarget = (build: ReleaseBuildProfileConfig, id: string, enabled: boolean) => {
  const target = build.targets.find((candidate) => candidate.id === id);
  if (target) target.enabled = enabled;
};
const switchEngine = (build: ReleaseBuildProfileConfig, engine: string) => {
  const switched = switchBuildProfileEngine(catalog.value, build, engine);
  if (switched) Object.assign(build, switched);
};
const setBuildInput = (build: ReleaseBuildProfileConfig, value: string) => {
  const output = outputOptions.value.find((candidate) => candidate.value === value);
  if (output) build.input = output.ref;
};
const addDestination = () => {
  if (!flow.value || !destinationToAdd.value) return;
  const definition = destinationDefinition(destinationToAdd.value);
  if (definition)
    flow.value.destinations.push({
      id: `${destinationToAdd.value.split("/").pop()}-${Date.now()}`,
      provider: destinationToAdd.value,
      enabled: true,
      config: { ...definition.defaultConfig },
      slots: [],
    });
  destinationToAdd.value = undefined;
};
const removeDestination = (id: string) => {
  if (flow.value)
    flow.value.destinations = flow.value.destinations.filter(
      (destination) => destination.id !== id,
    );
};
const addSlot = (destination: ReleaseDestinationConfig) => {
  const output = outputOptions.value[0];
  if (output)
    destination.slots.push({
      id: `${destination.id}-${destination.slots.length + 1}`,
      enabled: true,
      input: output.ref,
      config: {},
    });
};
const removeSlot = (destination: ReleaseDestinationConfig, id: string) => {
  destination.slots = destination.slots.filter((slot) => slot.id !== id);
};
const setSlotInput = (slot: ReleaseDestinationSlot, value: string) => {
  const output = outputOptions.value.find((candidate) => candidate.value === value);
  if (output) slot.input = output.ref;
};
const artifactLabel = (ref: ReleaseOutputRef) =>
  outputOptions.value.find((output) => output.value === outputRefValue(ref))?.label ||
  "Invalid output reference";
const openBuildSettings = (build: ReleaseBuildProfileConfig) => {
  settingsBuild.value = build;
  buildSettingsVisible.value = true;
};
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
  if (definition) flow.value.source = { provider, config: { ...definition.defaultConfig } };
  sourcePickerVisible.value = false;
  void inspectSource();
};
const setSourceField = (key: string, value: unknown) => {
  if (flow.value) {
    setField(flow.value.source.config, key, value);
    void inspectSource();
  }
};
const openConnection = (integration: string) => {
  connectionDraft.value = { name: "", value: "", integration };
  connectionVisible.value = true;
};
const createConnection = async () => {
  connectionSaving.value = true;
  const integration = connectionDraft.value.integration;
  const record = {
    id: crypto.randomUUID(),
    pluginName: integration,
    integrationName: integration,
    name: connectionDraft.value.name.trim(),
    value: connectionDraft.value.value.trim(),
    createdAt: new Date().toISOString(),
    isDefault: false,
  };
  const result = await api.execute("connections:save", {
    data: { version: "1.0.0", connections: [...connections.value, record] },
  });
  connectionSaving.value = false;
  if (result.type === "error") {
    error.value = result.ipcError;
    return;
  }
  await connectionsStore.init();
  connectionVisible.value = false;
};
const inspectSource = async () => {
  if (!flow.value) return;
  const result = await api.execute("release:source:inspect", {
    provider: flow.value.source.provider,
    config: flow.value.source.config,
  });
  if (result.type === "success") {
    const data = result.result as {
      issues?: ValidationIssue[];
      fieldOptions?: Record<string, ReleaseFieldOption[]>;
    };
    inspectionIssues.value = data.issues || [];
    for (const [key, options] of Object.entries(data.fieldOptions || {}))
      inspectionOptions.value[key] = options;
  }
};
const planNodeLabel = (id: string, kind: string) => {
  if (kind === "source") return sourceDefinition.value?.label || id;
  if (kind === "build") {
    const build = flow.value?.builds.find((candidate) => candidate.id === id);
    return build
      ? `${buildTypeLabel(build.type)} / ${producerDefinition(build.engine)?.label || build.engine}`
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
const refreshPlan = async () => {
  if (!flow.value) return;
  const result = await api.execute("release:plan", { config: flow.value });
  if (result.type === "success") {
    plan.value = result.result;
    plannerIssues.value = result.result.issues;
  } else error.value = result.ipcError;
};
const save = async () => {
  if (!flow.value) return;
  saveState.value = "saving";
  const result = await api.execute("workflow:save-by-name", {
    name: `workflows/${flowId.value}`,
    data: JSON.stringify(flow.value),
  });
  saveState.value = result.type === "error" ? "error" : "saved";
  if (result.type === "error") error.value = result.ipcError;
};
const validate = async () => {
  await refreshPlan();
  return !issues.value.some((issue) => issue.severity === "error");
};
const ship = async () => {
  if (await validate()) {
    releaseVersion.value = "1.0.0";
    releaseDescription.value = flow.value?.description || flow.value?.name || "";
    releaseDetailsVisible.value = true;
  }
};
const runShip = async () => {
  if (!flow.value) return;
  releaseDetailsVisible.value = false;
  running.value = true;
  await save();
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
      if (event.type === "workflow-run")
        await router.push(`/workflows/${flowId.value}/${projectId.value}/runs/${event.data.runId}`);
    },
  );
  if (result.type === "error") error.value = result.ipcError;
  running.value = false;
};
let saveTimer: ReturnType<typeof setTimeout> | undefined;
let planTimer: ReturnType<typeof setTimeout> | undefined;
watch(
  flow,
  () => {
    clearTimeout(saveTimer);
    clearTimeout(planTimer);
    if (flow.value) {
      saveTimer = setTimeout(() => void save(), 700);
      planTimer = setTimeout(() => void refreshPlan(), 300);
    }
  },
  { deep: true },
);
onMounted(async () => {
  await connectionsStore.init();
  const [catalogResult, flowResult] = await Promise.all([
    api.execute("release:catalog:get"),
    api.execute("workflow:load-by-name", { name: `workflows/${flowId.value}` }),
  ]);
  if (catalogResult.type === "success") catalog.value = catalogResult.result;
  if (flowResult.type === "success") {
    flow.value = flowResult.result as ReleaseConfig;
    await inspectSource();
    await refreshPlan();
  } else error.value = flowResult.ipcError;
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
.autosave-state i {
  margin-right: 4px;
}
.state-saved i {
  color: var(--green-500, #22c55e);
}
.state-error i {
  color: var(--red-500, #ef4444);
}
.summary-copy {
  display: block;
  margin-top: 4px;
  font-size: 0.8rem;
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
  gap: 12px;
}
.section-heading {
  display: flex;
  align-items: end;
  justify-content: space-between;
  gap: 16px;
  margin: 22px 2px 4px;
}
.section-heading h2 {
  margin: 3px 0 0;
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
.job-header {
  padding: 12px 14px;
}
.profile-fields,
.target-list,
.settings-grid,
.slot-list {
  display: grid;
  gap: 8px;
  padding: 0 14px 14px;
}
.profile-fields {
  grid-template-columns: 1fr 1fr;
}
.release-field {
  display: grid;
  gap: 5px;
}
.release-field label,
.field-label {
  letter-spacing: 0.02em;
}
.target-row,
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
.target-row {
  cursor: pointer;
}
.target-row.selected {
  border-color: var(--primary-color);
  background: color-mix(in srgb, var(--primary-color) 7%, transparent);
}
.target-row span {
  display: grid;
  gap: 2px;
  flex: 1;
}
.target-row small {
  color: var(--p-text-muted-color, var(--text-color-secondary));
  font-size: 0.7rem;
}
.routing-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 0 14px 14px;
  font-size: 0.78rem;
}
.slot-row > :first-child {
  flex: 1;
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
.pipeline-divider {
  display: flex;
  align-items: center;
  gap: 12px;
  margin: 28px 0 -8px;
  color: var(--p-text-muted-color, var(--text-color-secondary));
  font-size: 0.68rem;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}
.pipeline-divider::after {
  height: 1px;
  flex: 1;
  background: var(--surface-border);
  content: "";
}
.plan-panel {
  padding: 0 14px 14px;
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
  .profile-fields {
    grid-template-columns: 1fr;
  }
}
</style>
