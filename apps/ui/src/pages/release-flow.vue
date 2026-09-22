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
          :disabled="!canShip"
          @click="ship"
        />
      </template>
      <main v-if="flow" class="release-page">
        <Message v-if="error" severity="error">{{ error }}</Message>
        <section v-if="plan?.graph.nodes.length" class="plan-panel">
          <div class="section-heading">
            <div>
              <span class="eyebrow">Resolved by planner</span>
              <h2>Build plan</h2>
              <p>Automatic transforms appear as plumbing, never as configurable builds.</p>
            </div>
            <Button
              :label="planExpanded ? 'Collapse' : 'View plan'"
              text
              size="small"
              @click="planExpanded = !planExpanded"
            />
          </div>
          <ol v-if="planExpanded" class="plan-list">
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
              v-if="!cardIssues('source').length"
              :value="sourcePath ? 'Ready' : 'Not configured'"
              :severity="sourcePath ? 'success' : 'secondary'"
            /><Button
              v-if="cardIssues('source').length"
              class="needs-attention-button"
              label="Needs attention"
              icon="pi pi-exclamation-triangle"
              text
              size="small"
              @click="openAttention(cardIssues('source'))"
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
                ><span
                  >{{ buildProfileSummary(catalog, build).engineLabel }} ·
                  {{
                    buildProfileSummary(catalog, build).targetLabels.join(", ") || "No targets"
                  }}</span
                >
              </div>
              <Tag
                v-if="!cardIssues(`builds.${index}`).length"
                :value="build.enabled ? 'Ready' : 'Disabled'"
                :severity="build.enabled ? 'success' : 'secondary'"
              /><Button
                v-if="cardIssues(`builds.${index}`).length"
                class="needs-attention-button"
                label="Needs attention"
                icon="pi pi-exclamation-triangle"
                text
                size="small"
                @click="openAttention(cardIssues(`builds.${index}`))"
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
              <Button
                v-if="cardIssues(`destinations.${index}`).length"
                class="needs-attention-button"
                label="Needs attention"
                icon="pi pi-exclamation-triangle"
                text
                size="small"
                @click="openAttention(cardIssues(`destinations.${index}`))"
              />
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
              <div v-for="(slot, slotIndex) in destination.slots" :key="slot.id" class="slot-row">
                <div class="deployment-main">
                  <i class="mdi mdi-package-variant-closed" /><span
                    ><strong>{{ deploymentSlotLabel(slot, slotIndex) }}</strong
                    ><small>{{ artifactLabel(slot.input) }}</small></span
                  >
                </div>
                <Button
                  v-if="!slot.input"
                  label="Choose output"
                  text
                  @click="openOutputPicker(slot)"
                />
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
                /><Button
                  v-if="slotIssues(slot).length"
                  class="needs-attention-button"
                  label="Needs attention"
                  icon="pi pi-exclamation-triangle"
                  text
                  size="small"
                  @click="openAttention(slotIssues(slot))"
                /><Button
                  v-if="slotIssues(slot).length"
                  label="Create compatible build"
                  icon="pi pi-plus"
                  text
                  @click="openCompatibleBuildPicker(slot)"
                />
              </div>
              <Button label="Add deployment" icon="pi pi-plus" text @click="addSlot(destination)" />
            </div>
          </article>
        </section>
      </main>
    </WorkflowShell>
    <Dialog v-model:visible="attentionVisible" modal header="Needs attention" :style="dialogStyle">
      <p class="attention-copy">The planner is authoritative. Fix these issues before shipping.</p>
      <ul class="issue-summary">
        <li v-for="issue in attentionIssues" :key="`${issue.code}:${issue.path}`">
          <Tag :value="issue.severity" :severity="issue.severity === 'error' ? 'danger' : 'warn'" />
          <span>{{ issue.message }}</span>
        </li>
      </ul>
    </Dialog>
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
            @update:model-value="selectBuildEngine"
          />
        </div>
        <div v-if="newBuildTargets.length" class="release-field">
          <label for="build-target">Target</label
          ><Select
            id="build-target"
            v-model="newBuildTarget"
            :options="newBuildTargets"
            optionLabel="label"
            optionValue="id"
            placeholder="Choose a target"
          />
        </div>
        <p class="field-note">
          Automatic transforms are planner plumbing and are intentionally hidden from this list.
        </p>
        <p v-if="compatibleSlot && compatibleChecking" class="field-note">
          Checking planner-compatible builds…
        </p>
        <p v-else-if="compatibleSlot && !compatibleChoiceKeys.size" class="field-note">
          No compatible build candidate is available for this destination.
        </p>
      </div>
      <template #footer
        ><Button label="Cancel" text @click="buildPickerVisible = false" /><Button
          label="Add build"
          icon="pi pi-plus"
          :disabled="
            !newBuildType || !newBuildEngine || (newBuildTargets.length > 0 && !newBuildTarget)
          "
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
      v-model:visible="buildSettingsVisible"
      modal
      header="Build settings"
      :style="wideDialogStyle"
      ><div v-if="settingsBuild" class="settings-grid">
        <div class="release-field wide">
          <label :for="`settings-engine-${settingsBuild.id}`">Engine</label
          ><Select
            :id="`settings-engine-${settingsBuild.id}`"
            :model-value="settingsBuild.engine"
            :options="buildEngines(settingsBuild.type)"
            optionLabel="label"
            optionValue="id"
            @update:model-value="switchEngine(settingsBuild, $event)"
          />
          <small
            v-for="issue in fieldIssues(`builds.${flow?.builds.indexOf(settingsBuild)}.engine`)"
            :key="`${issue.code}:${issue.path}`"
            class="field-issue"
            :class="issue.severity === 'error' ? 'field-issue-error' : 'field-issue-warning'"
            >{{ issue.message }}</small
          >
        </div>
        <div class="release-field wide">
          <span class="field-label">Targets</span>
          <div class="target-list">
            <button
              v-for="target in buildTargets(settingsBuild)"
              :key="target.id"
              class="target-row"
              :class="{ selected: isTargetEnabled(settingsBuild, target.id) }"
              :aria-pressed="isTargetEnabled(settingsBuild, target.id)"
              @click="
                toggleTarget(settingsBuild, target.id, !isTargetEnabled(settingsBuild, target.id))
              "
            >
              <i
                :class="
                  isTargetEnabled(settingsBuild, target.id)
                    ? 'mdi mdi-check-circle'
                    : 'mdi mdi-circle-outline'
                "
              /><span>{{ target.label }}</span>
            </button>
          </div>
        </div>
        <div v-if="buildInputs(settingsBuild).length" class="release-field wide">
          <label :for="`settings-input-${settingsBuild.id}`">Input</label
          ><Select
            :id="`settings-input-${settingsBuild.id}`"
            :model-value="outputRefValue(settingsBuild.input || { source: true })"
            :options="buildInputs(settingsBuild)"
            optionLabel="label"
            optionValue="value"
            @update:model-value="setBuildInput(settingsBuild, $event)"
          />
          <small
            v-for="issue in fieldIssues(`builds.${flow?.builds.indexOf(settingsBuild)}.input`)"
            :key="`${issue.code}:${issue.path}`"
            class="field-issue"
            :class="issue.severity === 'error' ? 'field-issue-error' : 'field-issue-warning'"
            >{{ issue.message }}</small
          >
        </div>
        <template
          v-for="field in producerDefinition(settingsBuild.engine)?.fields || []"
          :key="field.key"
        >
          <ReleaseFieldControl
            :field="field"
            :value="fieldValue(settingsBuild.config, field.key)"
            :options="producerFieldOptions(field)"
            :input-id="`build-${settingsBuild.id}-${field.key}`"
            :issues="
              fieldIssues(`builds.${flow?.builds.indexOf(settingsBuild)}.config.${field.key}`)
            "
            @update:value="setField(settingsBuild.config, field.key, $event)"
            @add-connection="openConnection"
          /> </template
        ><template
          v-for="target in settingsBuild.targets.filter((item) => item.enabled)"
          :key="target.id"
          ><template
            v-for="field in buildTargets(settingsBuild).find((item) => item.id === target.id)
              ?.fields || []"
            :key="`${target.id}-${field.key}`"
            ><ReleaseFieldControl
              :field="field"
              :value="fieldValue(target.config, field.key)"
              :options="producerFieldOptions(field)"
              :input-id="`target-${settingsBuild.id}-${target.id}-${field.key}`"
              :issues="
                fieldIssues(
                  `builds.${flow?.builds.indexOf(settingsBuild)}.targets.${settingsBuild.targets.indexOf(target)}.config.${field.key}`,
                )
              "
              @update:value="setField(target.config, field.key, $event)"
              @add-connection="openConnection" /></template
        ></template>
      </div>
      <template #footer><Button label="Done" @click="buildSettingsVisible = false" /></template
    ></Dialog>
    <Dialog
      v-model:visible="destinationSettingsVisible"
      modal
      header="Destination settings"
      :style="dialogStyle"
      ><div v-if="settingsDestination" class="settings-grid">
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
        ><Button label="Done" @click="destinationSettingsVisible = false" /></template
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
        <div class="release-field wide">
          <label>Output</label
          ><Select
            :model-value="outputRefValue(settingsSlot.input)"
            :options="outputOptions"
            optionLabel="label"
            optionValue="value"
            @update:model-value="setSlotInput(settingsSlot, $event)"
          />
          <small
            v-for="issue in slotIssues(settingsSlot)"
            :key="`${issue.code}:${issue.path}`"
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
      <template #footer><Button label="Done" @click="slotSettingsVisible = false" /></template
    ></Dialog>
    <Dialog v-model:visible="outputPickerVisible" modal header="Choose output" :style="dialogStyle">
      <div class="release-field wide">
        <label for="output-picker">Output</label>
        <Select
          id="output-picker"
          v-model="outputPickerValue"
          :options="outputOptions"
          optionLabel="label"
          optionValue="value"
          placeholder="Choose a source or build output"
        />
      </div>
      <template #footer
        ><Button label="Cancel" text @click="outputPickerVisible = false" /><Button
          label="Use output"
          :disabled="!outputPickerValue"
          @click="confirmOutputPicker" /></template
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
        ><Button label="Cancel" text @click="connectionVisible = false" /><Button
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
  </Layout>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { nanoid } from "nanoid";
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
import { useAppStore } from "../store/app";
import { useConnectionsStore } from "../store/connections";
import {
  buildEnginesFor,
  buildProfileSummary,
  buildTargetsFor,
  applyProducerInspection,
  connectionMatchesIntegration,
  createBuildProfile,
  createSerializedTaskQueue,
  deploymentSlotLabel,
  issuesForPath,
  planOutputOptions,
  plannerAcceptsBuildCandidate,
  releaseCanRun,
  removeBuildProfile,
  setBuildTargetEnabled,
  switchBuildProfileEngine,
} from "./release-flow-model";

const route = useRoute();
const router = useRouter();
const api = useAPI();
const appStore = useAppStore();
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
const producerInspectionIssues = ref<ValidationIssue[]>([]);
const issues = computed(() => [
  ...plannerIssues.value,
  ...inspectionIssues.value,
  ...producerInspectionIssues.value,
]);
const attentionVisible = ref(false);
const attentionIssues = ref<ValidationIssue[]>([]);
const planExpanded = ref(false);
const error = ref("");
const running = ref(false);
const planning = ref(false);
const saveState = ref<"saving" | "saved" | "error">("saved");
const inspectionOptions = ref<Record<string, ReleaseFieldOption[]>>({});
const producerInspectionOptions = ref<Record<string, ReleaseFieldOption[]>>({});
const newBuildType = ref<string>();
const newBuildEngine = ref<string>();
const newBuildTarget = ref<string>();
const compatibleChoiceKeys = ref(new Set<string>());
const compatibleChecking = ref(false);
const destinationToAdd = ref<string>();
const buildPickerVisible = ref(false);
const sourcePickerVisible = ref(false);
const sourceSettingsVisible = ref(false);
const buildSettingsVisible = ref(false);
const destinationSettingsVisible = ref(false);
const slotSettingsVisible = ref(false);
const outputPickerVisible = ref(false);
const releaseDetailsVisible = ref(false);
const settingsBuild = ref<ReleaseBuildProfileConfig>();
const settingsDestination = ref<ReleaseDestinationConfig>();
const settingsSlot = ref<ReleaseDestinationSlot>();
const outputPickerSlot = ref<ReleaseDestinationSlot>();
const outputPickerValue = ref("");
const releaseVersion = ref("1.0.0");
const releaseDescription = ref("");
const connectionVisible = ref(false);
const connectionSaving = ref(false);
const connectionDraft = ref({
  name: "",
  integration: "",
  integrationName: "",
  values: {} as Record<string, string>,
});
const compatibleSlot = ref<ReleaseDestinationSlot>();
const dialogStyle = { width: "560px", maxWidth: "94vw" };
const wideDialogStyle = { width: "760px", maxWidth: "94vw" };
const saveStateLabel = computed(() =>
  saveState.value === "saving" ? "Saving…" : saveState.value === "error" ? "Error" : "Saved",
);
const canShip = computed(() =>
  releaseCanRun(flow.value, plan.value, issues.value, running.value, planning.value),
);
const openAttention = (cardIssues: ValidationIssue[]) => {
  attentionIssues.value = cardIssues;
  attentionVisible.value = true;
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
const connectionHasValue = computed(() =>
  connectionFields.value.length
    ? connectionFields.value.some((field) => connectionDraft.value.values[field.key]?.trim())
    : Object.values(connectionDraft.value.values).some((value) => value.trim()),
);
const fieldOptions = (field: ReleaseFieldDefinition) =>
  field.type === "connection"
    ? connectionOptions(field)
    : inspectionOptions.value[field.key] || field.options || [];
const producerFieldOptions = (field: ReleaseFieldDefinition) =>
  producerInspectionOptions.value[field.key] || field.options || [];
const cardIssues = (prefix: string) => issuesForPath(issues.value, prefix);
const fieldIssues = (path: string) => issues.value.filter((issue) => issue.path === path);
const slotIssues = (slot: ReleaseDestinationSlot) => {
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
    ? fieldIssues(`destinations.${destinationIndex}.slots.${slotIndex}.input`)
    : [];
};
const sourcePath = computed(() => {
  const field = sourceDefinition.value?.fields?.find(
    (item) => item.type === "file" || item.type === "directory",
  );
  return field && flow.value ? fieldValue(flow.value.source.config, field.key) : "";
});
const outputRefValue = (ref?: ReleaseOutputRef) =>
  ref ? ("source" in ref ? "source" : `${ref.buildId}:${ref.targetId}`) : "";
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
const newBuildEngines = computed(() =>
  buildEngines(newBuildType.value || "").filter(
    (engine) =>
      !compatibleSlot.value ||
      [...compatibleChoiceKeys.value].some((key) =>
        key.startsWith(`${newBuildType.value}:${engine.id}:`),
      ),
  ),
);
const newBuildTargets = computed(() =>
  newBuildType.value && newBuildEngine.value
    ? buildTargetsFor(catalog.value, newBuildEngine.value, newBuildType.value).filter(
        (target) =>
          !compatibleSlot.value ||
          compatibleChoiceKeys.value.has(
            `${newBuildType.value}:${newBuildEngine.value}:${target.id}`,
          ),
      )
    : [],
);
const selectBuildEngine = (engine: string | undefined) => {
  newBuildEngine.value = engine;
  newBuildTarget.value = engine ? newBuildTargets.value[0]?.id : undefined;
};
const buildTypeLabel = (id: string) =>
  catalog.value.buildTypes.find((type) => type.id === id)?.label || id;
const enabledTargetCount = (build: ReleaseBuildProfileConfig) =>
  build.targets.filter((target) => target.enabled).length;
const isTargetEnabled = (build: ReleaseBuildProfileConfig, id: string) =>
  build.targets.some((target) => target.id === id && target.enabled);
const hasBuildSettings = (build: ReleaseBuildProfileConfig) => Boolean(build);
const availableDestinations = computed(() =>
  catalog.value.destinations.filter(
    (item) => !flow.value?.destinations.some((destination) => destination.provider === item.id),
  ),
);
const addBuild = async () => {
  if (!flow.value || !newBuildType.value || !newBuildEngine.value) return;
  if (
    compatibleSlot.value &&
    !compatibleChoiceKeys.value.has(
      `${newBuildType.value}:${newBuildEngine.value}:${newBuildTarget.value}`,
    )
  ) {
    error.value = "The selected build is not compatible with this destination.";
    return;
  }
  const build = createBuildProfile(
    catalog.value,
    newBuildType.value,
    newBuildEngine.value,
    nanoid(),
  );
  if (build) {
    if (newBuildTarget.value) {
      for (const target of build.targets) target.enabled = target.id === newBuildTarget.value;
    }
    flow.value.builds.push(build);
    if (compatibleSlot.value) {
      const target = build.targets.find((candidate) => candidate.enabled);
      if (target) compatibleSlot.value.input = { buildId: build.id, targetId: target.id };
    }
  }
  newBuildType.value = undefined;
  newBuildEngine.value = undefined;
  newBuildTarget.value = undefined;
  compatibleChoiceKeys.value = new Set();
  compatibleChecking.value = false;
  compatibleSlot.value = undefined;
  buildPickerVisible.value = false;
};
const removeBuild = (id: string) => {
  if (flow.value) removeBuildProfile(flow.value, id);
};
const toggleTarget = (build: ReleaseBuildProfileConfig, id: string, enabled: boolean) => {
  setBuildTargetEnabled(build, id, enabled);
};
const switchEngine = (build: ReleaseBuildProfileConfig, engine: string) => {
  const switched = switchBuildProfileEngine(catalog.value, build, engine);
  if (switched) {
    Object.assign(build, switched);
    void inspectProducer(build);
  }
};
const setBuildInput = (build: ReleaseBuildProfileConfig, value: string) => {
  const output = outputOptions.value.find((candidate) => candidate.value === value);
  if (output) build.input = output.ref;
};
const addDestination = () => {
  if (!flow.value || !destinationToAdd.value) return;
  const definition = destinationDefinition(destinationToAdd.value);
  if (definition) {
    flow.value.destinations.push({
      id: nanoid(),
      provider: destinationToAdd.value,
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
    automaticResolutionRequested = true;
  }
  destinationToAdd.value = undefined;
};
const removeDestination = (id: string) => {
  if (flow.value)
    flow.value.destinations = flow.value.destinations.filter(
      (destination) => destination.id !== id,
    );
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
  destination.slots = destination.slots.filter((slot) => slot.id !== id);
};
const setSlotInput = (slot: ReleaseDestinationSlot, value: string) => {
  const output = outputOptions.value.find((candidate) => candidate.value === value);
  if (output) slot.input = output.ref;
};
const openOutputPicker = (slot: ReleaseDestinationSlot) => {
  outputPickerSlot.value = slot;
  outputPickerValue.value = outputRefValue(slot.input);
  outputPickerVisible.value = true;
};
const confirmOutputPicker = () => {
  if (outputPickerSlot.value && outputPickerValue.value)
    setSlotInput(outputPickerSlot.value, outputPickerValue.value);
  outputPickerSlot.value = undefined;
  outputPickerValue.value = "";
  outputPickerVisible.value = false;
};
const refreshCompatibleChoices = async (slot: ReleaseDestinationSlot) => {
  if (!flow.value) return;
  compatibleChecking.value = true;
  const choices = new Set<string>();
  const destination = flow.value.destinations.find((candidate) => candidate.slots.includes(slot));
  if (!destination) return;
  const destinationIndex = flow.value.destinations.indexOf(destination);
  const slotIndex = destination.slots.indexOf(slot);
  for (const buildType of catalog.value.buildTypes) {
    for (const engine of buildEnginesFor(catalog.value, buildType.id)) {
      for (const target of buildTargetsFor(catalog.value, engine.id, buildType.id)) {
        const candidate = createBuildProfile(
          catalog.value,
          buildType.id,
          engine.id,
          `candidate-${nanoid()}`,
          [target.id],
        );
        if (!candidate) continue;
        const candidateConfig = JSON.parse(JSON.stringify(flow.value)) as ReleaseConfig;
        candidateConfig.builds.push(candidate);
        candidateConfig.destinations[destinationIndex].slots[slotIndex].input = {
          buildId: candidate.id,
          targetId: target.id,
        };
        const result = await api.execute("release:plan", { config: candidateConfig });
        if (result.type !== "success") continue;
        if (
          plannerAcceptsBuildCandidate(
            result.result,
            candidate.id,
            candidateConfig.builds.length - 1,
            destinationIndex,
            slotIndex,
          )
        )
          choices.add(`${buildType.id}:${engine.id}:${target.id}`);
      }
    }
  }
  compatibleChoiceKeys.value = choices;
  compatibleChecking.value = false;
};
const openCompatibleBuildPicker = (slot: ReleaseDestinationSlot) => {
  compatibleSlot.value = slot;
  newBuildType.value = undefined;
  newBuildEngine.value = undefined;
  newBuildTarget.value = undefined;
  compatibleChoiceKeys.value = new Set();
  void refreshCompatibleChoices(slot);
  buildPickerVisible.value = true;
};
const artifactLabel = (ref?: ReleaseOutputRef) =>
  ref
    ? outputOptions.value.find((output) => output.value === outputRefValue(ref))?.label ||
      "Invalid output reference"
    : "Choose output";
const openBuildSettings = (build: ReleaseBuildProfileConfig) => {
  settingsBuild.value = build;
  void inspectProducer(build);
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
      error.value = result.ipcError;
      return;
    }
    await connectionsStore.load(true);
    connectionVisible.value = false;
  } catch (err) {
    error.value = err instanceof Error ? err.message : "Unable to save connection.";
  } finally {
    connectionSaving.value = false;
  }
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
    inspectionIssues.value = (data.issues || []).map((issue) => ({
      ...issue,
      path: issue.path?.startsWith("source.")
        ? issue.path
        : issue.path
          ? `source.${issue.path}`
          : "source",
    }));
    for (const [key, options] of Object.entries(data.fieldOptions || {}))
      inspectionOptions.value[key] = options;
  }
};
const inspectProducer = async (build: ReleaseBuildProfileConfig) => {
  const buildIndex = flow.value?.builds.indexOf(build) ?? -1;
  if (buildIndex < 0) return;
  const result = await api.execute("release:producer:inspect", {
    provider: build.engine,
    sourceConfig: flow.value?.source.config,
    config: {
      id: build.id,
      provider: build.engine,
      enabled: build.enabled,
      config: build.config,
      targets: build.targets,
    },
  });
  if (result.type !== "success") {
    producerInspectionIssues.value = [
      {
        code: "release.producer.inspect",
        message: result.ipcError,
        severity: "error",
        path: `builds.${buildIndex}`,
      },
    ];
    return;
  }
  const data = result.result as {
    fieldOptions?: Record<string, ReleaseFieldOption[]>;
    fieldValues?: Record<string, unknown>;
    issues?: ValidationIssue[];
  };
  const applied = applyProducerInspection(build, buildIndex, {
    ...data,
    issues: data.issues || [],
  });
  producerInspectionOptions.value = applied.options;
  producerInspectionIssues.value = applied.issues;
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
let automaticResolutionRequested = false;
const refreshPlan = async (resolveDefaults = false) => {
  if (!flow.value) return;
  const requestId = ++latestPlanRequest;
  planning.value = true;
  try {
    const result = await api.execute("release:plan", { config: flow.value });
    if (requestId !== latestPlanRequest) return;
    if (result.type === "success") {
      plan.value = result.result;
      plannerIssues.value = result.result.issues;
      if (resolveDefaults && automaticResolutionRequested) {
        automaticResolutionRequested = false;
        const resolved = await api.execute("release:resolve-defaults", { config: flow.value });
        if (
          resolved.type === "success" &&
          JSON.stringify(resolved.result) !== JSON.stringify(flow.value)
        ) {
          flow.value = resolved.result as ReleaseConfig;
          changeRevision += 1;
          await save();
          await refreshPlan(false);
        } else if (resolved.type === "error") {
          error.value = resolved.ipcError;
        }
      }
    } else error.value = result.ipcError;
  } finally {
    if (requestId === latestPlanRequest) planning.value = false;
  }
};
let latestPlanRequest = 0;
let changeRevision = 0;
let persistedRevision = 0;
const save = createSerializedTaskQueue(async () => {
  if (!flow.value) return;
  const revision = changeRevision;
  saveState.value = "saving";
  const result = await api.execute("workflow:save-by-name", {
    name: `workflows/${flowId.value}`,
    data: JSON.stringify(flow.value),
  });
  if (result.type === "error") {
    saveState.value = "error";
    error.value = result.ipcError;
    return;
  }
  persistedRevision = revision;
  if (persistedRevision !== changeRevision) save();
  else saveState.value = "saved";
});
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
    changeRevision += 1;
    planning.value = true;
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
    automaticResolutionRequested = true;
    await inspectSource();
    await refreshPlan(true);
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
.needs-attention-button {
  flex: 0 0 auto;
  border: 1px solid color-mix(in srgb, var(--p-orange-500, #f97316) 45%, transparent);
  border-radius: 6px;
  padding: 0.35rem 0.6rem;
  color: var(--p-orange-700, #c2410c);
  background: color-mix(in srgb, var(--p-orange-100, #ffedd5) 72%, transparent);
  font-weight: 600;
  white-space: nowrap;
}
.needs-attention-button:hover {
  border-color: var(--p-orange-500, #f97316);
  background: color-mix(in srgb, var(--p-orange-100, #ffedd5) 100%, transparent);
}
.needs-attention-button:focus-visible {
  outline: 2px solid var(--p-orange-500, #f97316);
  outline-offset: 2px;
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
