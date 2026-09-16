<template>
  <Layout>
    <div class="flow-page">
      <header class="flow-header">
        <div class="flow-heading">
          <Button
            text
            icon="mdi mdi-arrow-left"
            aria-label="Back"
            @click="router.push('/dashboard')"
          />
          <div class="flow-title-icon"><i class="mdi mdi-rocket-launch-outline" /></div>
          <div class="heading">
            <h1>{{ flow?.name || "Workflow" }}</h1>
            <p>{{ flow?.description || "Build once, then ship everywhere." }}</p>
          </div>
        </div>
        <Button
          label="Ship"
          icon="mdi mdi-rocket-launch-outline"
          :loading="running"
          :disabled="!canShip"
          @click="ship"
        />
        <Select
          v-if="flow"
          v-model="flow.continueOnError"
          :options="failureOptions"
          optionLabel="label"
          optionValue="value"
          aria-label="Workflow failure policy"
          class="failure-policy"
        />
      </header>
      <Message v-if="loadError" severity="error">{{ loadError }}</Message>
      <template v-if="flow">
        <section class="card source-card">
          <div class="card-icon"><i class="mdi mdi-source-branch" /></div>
          <div class="card-body">
            <strong>{{
              flow.source.type === "construct3" ? "Construct 3 project" : "Built folder"
            }}</strong
            ><span>{{ flow.source.path || "No source selected" }}</span>
            <small v-if="flow.source.type === 'construct3' && profileError" class="error">{{ profileError }}</small>
          </div>
          <Button label="Change" text @click="browseSource" />
          <Button
            v-if="flow.source.type === 'construct3'"
            icon="mdi mdi-cog-outline"
            text
            rounded
            aria-label="Configure source"
            v-tooltip.bottom="'Configure source'"
            @click="openSourceSettings"
          />
        </section>
        <WorkflowArtifactsPanel
          :model-value="flow"
          :capabilities="capabilities"
          :connections="connections"
          @add-connection="openConnection($event === 'itch' ? 'itch-account' : 'steam-account')"
          @update:model-value="flow = $event"
        />
        <section v-if="runArtifacts.length || runDeliveries.length" class="build-results card" aria-label="Build results">
          <div class="section-title">
            <div><h2>Build {{ releaseVersion }}</h2><span>Build once, then deliver the same artifacts independently.</span></div>
            <Tag :value="buildResultStatus === 'completed' ? 'Completed' : 'Completed with errors'" :severity="buildResultStatus === 'completed' ? 'success' : 'danger'" />
          </div>
          <div class="results-section">
            <h3>Artifacts</h3>
            <div class="artifact-summary">
              <div v-for="artifact in runArtifacts" :key="artifact.id" class="artifact-summary-row">
                <i class="mdi mdi-package-variant-closed" aria-hidden="true" />
                <div class="artifact-main">
                  <strong>{{ artifactOutputLabel(artifact.outputId) }}</strong>
                  <span>{{ packagerLabel(artifact) }} · {{ artifact.format }} · {{ formatSize(artifact.size) }}</span>
                  <small>{{ artifact.path }}</small>
                </div>
                <div class="artifact-consumers" aria-label="Artifact deliveries">
                  <span>Used by</span>
                  <span v-for="delivery in deliveriesForArtifact(artifact.id)" :key="delivery.id" class="consumer-chip">
                    {{ destinationLabelForId(delivery.destinationId) }} / {{ deliverySlotLabel(delivery) }}
                    <i :class="delivery.status === 'completed' ? 'pi pi-check' : 'pi pi-times'" aria-hidden="true" />
                  </span>
                  <small v-if="!deliveriesForArtifact(artifact.id).length">No deliveries</small>
                </div>
              </div>
            </div>
          </div>
          <div class="results-section deliveries-section">
            <h3>Deliveries</h3>
            <div v-if="!runDeliveries.length" class="results-empty">No deliveries recorded.</div>
            <div v-for="group in deliveryGroups" :key="group.destinationId" class="delivery-group">
              <h4>{{ group.label }}</h4>
              <div v-for="delivery in group.deliveries" :key="delivery.id" class="delivery-row">
                <span>{{ deliverySlotLabel(delivery) }}</span>
                <Tag :value="delivery.status === 'completed' ? 'Delivered' : 'Failed'" :severity="delivery.status === 'completed' ? 'success' : 'danger'" />
                <small v-if="delivery.error" class="delivery-error">{{ delivery.error }}</small>
              </div>
            </div>
          </div>
        </section>
        <section v-if="logs.length || Object.keys(runSteps).length" class="logs card">
          <div class="section-title">
            <h2>Run log</h2>
            <Button v-if="running" label="Cancel" text severity="danger" @click="cancel" />
          </div>
          <div v-if="Object.keys(runSteps).length" class="run-steps">
            <div v-for="(status, id) in runSteps" :key="id" class="run-step">
              <span>{{ id }}</span><Tag :value="status" />
            </div>
          </div>
          <pre>{{ logs.join("\n") }}</pre>
        </section>
      </template>
    </div>
    <Dialog
      v-model:visible="sourceDialogVisible"
      modal
      header="Source settings"
      :style="{ width: '440px', maxWidth: '94vw' }"
    >
      <div class="settings-grid">
        <div class="field">
          <span>Browser profile</span>
          <div class="input-row">
            <Select
              v-model="constructSource().profilePath"
              :options="browserProfiles"
              optionLabel="label"
              optionValue="path"
              optionDisabled="disabled"
              placeholder="Choose a browser profile"
              :disabled="profileLoading"
              class="w-full"
            /><Button
              icon="pi pi-refresh"
              text
              rounded
              aria-label="Refresh browser profiles"
              :loading="profileLoading"
              :disabled="profileLoading"
              @click="() => discoverProfiles()"
            /></div>
          <small v-if="profileLoading">Searching browser profiles and Construct addons…</small>
          <small v-if="profileError" class="error">{{ profileError }}</small>
          <small v-if="!browserProfiles.some((profile) => profile.usable) && !profileError">No usable browser profile found. Choose a folder manually.</small>
          <Button label="Choose folder manually" text @click="browseProfile" />
        </div>
      </div>
      <template #footer><Button label="Done" @click="sourceDialogVisible = false" /></template>
    </Dialog>
    <Dialog
      v-if="activeDestination"
      v-model:visible="destinationDialogVisible"
      modal
      :header="`${destinationLabel(activeDestination.type)} settings`"
      :style="{ width: '560px', maxWidth: '94vw' }"
    >
      <div v-if="activeDestination.type === 'web'" class="settings-grid">
        <label class="wide"
          >Output folder
          <div class="input-row">
            <InputText v-model="activeDestination.outputDir" class="w-full" /><Button
              icon="pi pi-folder-open"
              outlined
              aria-label="Choose output folder"
              @click="browseFolder(activeDestination)"
            /></div
        ></label>
        <label class="check"
          ><Checkbox v-model="activeDestination.overwrite" binary /> Overwrite existing files</label
        >
        <label class="check"
          ><Checkbox v-model="activeDestination.cleanup" binary /> Clean destination first</label
        >
      </div>
      <div v-else-if="activeDestination.type === 'itch'" class="settings-grid">
        <div class="field">
          <span>Itch.io account</span>
          <div class="input-row">
            <Select
              v-model="activeDestination.accountConnectionId"
              :options="itchAccountConnections"
              optionLabel="name"
              optionValue="id"
              placeholder="Select account"
              class="w-full"
            /><Button
              icon="pi pi-plus"
              text
              rounded
              aria-label="Add Itch.io account connection"
              @click="openConnection('itch-account')"
            />
          </div>
        </div>
        <label>Project<InputText v-model="activeDestination.project" placeholder="game" /></label
        ><label>Channel<InputText v-model="activeDestination.channel" placeholder="web" /></label>
        <small class="wide platform-note"
          ><i class="mdi mdi-information-outline" /> Butler is downloaded automatically. The
          account connection supplies the API key and the owner username is read from it.</small
        >
      </div>
      <div v-else class="settings-grid">
        <div class="field">
          <span>Steam account</span>
          <div class="input-row">
            <Select
              v-model="steam(activeDestination).accountConnectionId"
              :options="steamAccountConnections"
              optionLabel="name"
              optionValue="id"
              placeholder="Select account"
              class="w-full"
            /><Button
              icon="pi pi-plus"
              text
              rounded
              aria-label="Add Steam account connection"
              @click="openConnection('steam-account')"
            /></div>
        </div>
        <label>App ID<InputText v-model="steam(activeDestination).appId" /></label
        ><label>Depot ID<InputText v-model="steam(activeDestination).depotId" /></label
        /><small class="wide platform-note"
          ><i class="mdi mdi-information-outline" /> App name, bundle ID, version, description, and
          icon are taken from the workflow/source when shipping.</small
        >
      </div>
      <template #footer><Button label="Done" @click="destinationDialogVisible = false" /></template>
    </Dialog>
    <Dialog
      v-model:visible="releaseDialogVisible"
      modal
      header="Release details"
      :style="{ width: '440px', maxWidth: '94vw' }"
    >
      <div class="connection-form">
        <label>Version<InputText v-model="releaseVersion" placeholder="1.0.0" /></label>
        <label>Description<InputText v-model="releaseDescription" placeholder="Build description" /></label>
      </div>
      <template #footer>
        <Button label="Cancel" text severity="secondary" @click="releaseDialogVisible = false" />
        <Button
          label="Ship"
          :disabled="!releaseVersion.trim() || !releaseDescription.trim()"
          @click="runShip"
        />
      </template>
    </Dialog>
    <Dialog
      v-model:visible="connectionDialog.visible"
      modal
      :header="`Add ${connectionDialog.label}`"
      :style="{ width: '440px', maxWidth: '94vw' }"
    >
      <div class="connection-form">
        <label
          >Name<InputText
            v-model="connectionDialog.name"
            autofocus
            placeholder="My connection" /></label
        ><template v-if="connectionDialog.kind === 'steam-account'"
          ><label>Steam username<InputText v-model="connectionDialog.value" class="w-full" /></label
          ><label
            >Steam password<InputText
              v-model="connectionDialog.password"
              type="password"
              class="w-full" /></label></template
        ><label v-else
          >{{ connectionDialog.fieldLabel }}
          <div class="input-row">
            <InputText
              v-model="connectionDialog.value"
              class="w-full"
              :type="connectionDialog.kind === 'itch-account' ? 'password' : 'text'"
            /><Button
              v-if="!['steam-account', 'itch-account'].includes(connectionDialog.kind)"
              icon="pi pi-folder-open"
              outlined
              aria-label="Choose path"
              @click="browseConnectionPath"
            /></div
        ></label>
      </div>
      <template #footer
        ><Button
          label="Cancel"
          text
          severity="secondary"
          @click="connectionDialog.visible = false" /><Button
          label="Add connection"
          :loading="connectionDialog.saving"
          :disabled="
            !connectionDialog.name.trim() ||
            !connectionDialog.value.trim() ||
            (connectionDialog.kind === 'steam-account' && !connectionDialog.password.trim())
          "
          @click="createConnection"
      /></template>
    </Dialog>
  </Layout>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import Layout from "@renderer/components/Layout.vue";
import Button from "primevue/button";
import Message from "primevue/message";
import Tag from "primevue/tag";
import InputText from "primevue/inputtext";
import Select from "primevue/select";
import Checkbox from "primevue/checkbox";
import Dialog from "primevue/dialog";
import WorkflowArtifactsPanel from "@renderer/components/WorkflowArtifactsPanel.vue";
import { useAPI } from "@renderer/composables/api";
import { getReleaseHostCapabilities, migrateWorkflowConfig, outputDescriptor, SERVICE_DEFINITIONS, type BrowserProfileCandidate, type WorkflowConfig, type WorkflowDestination } from "@pipelab/shared";
const route = useRoute();
const router = useRouter();
const api = useAPI();
const flow = ref<any>();
const capabilities = ref<ReturnType<typeof getReleaseHostCapabilities>>();
const connections = ref<any[]>([]);
const loadError = ref("");
const saving = ref(false);
const running = ref(false);
const activeDestination = ref<WorkflowDestination>();
const destinationDialogVisible = ref(false);
const sourceDialogVisible = ref(false);
const profileCandidates = ref<BrowserProfileCandidate[]>([]);
const profileError = ref("");
const profileLoading = ref(false);
const releaseDialogVisible = ref(false);
const releaseVersion = ref("1.0.0");
const releaseDescription = ref("");
const logs = ref<string[]>([]);
const runSteps = ref<Record<string, string>>({});
const runArtifacts = ref<any[]>([]);
const runDeliveries = ref<any[]>([]);
const buildResultStatus = ref<"completed" | "completed-with-errors">("completed");
const connectionDialog = ref({
  visible: false,
  saving: false,
  kind: "",
  label: "",
  fieldLabel: "",
  name: "",
  value: "",
  password: "",
});
const failureOptions = [
  { label: "Continue independent destinations", value: true },
  { label: "Stop on failure", value: false },
];
const browserProfiles = computed(() => profileCandidates.value.map((p) => ({ ...p, disabled: !p.usable, label: `${p.browser} — ${p.profileName} (${p.addonCount ?? "?"} addons${p.score !== null ? `, score ${p.score}` : ", unavailable"})` })));
const steamAccountConnections = computed(() =>
  connections.value.filter(
    (c) => c.pluginName === "@pipelab/plugin-steam" && c.integrationName === "Steam Account",
  ),
);
const itchAccountConnections = computed(() =>
  connections.value.filter(
    (c) => c.pluginName === "@pipelab/plugin-itch" && c.integrationName === "Itch Butler Account",
  ),
);
const steamAccountReady = (id?: string) => {
  const account = connections.value.find((connection) => connection.id === id);
  return !!(account?.password && (account.username || account.email));
};
const readiness = computed(() => {
  if (!flow.value) return [];
  const errors: string[] = [];
  if (!flow.value.source.path) errors.push("Choose a source");
  if (flow.value.source.type === "construct3" && !flow.value.source.profilePath) errors.push("Choose a browser profile");
  if (!flow.value.destinations.some((destination: any) => destination.enabled))
    errors.push("Enable at least one destination");
  for (const d of flow.value.destinations) {
    if (!d.enabled) continue;
    if (!d.slots.length) errors.push(`Add a delivery slot to ${d.serviceId}`);
    if (d.config.migration?.unresolved) errors.push(`Resolve migrated ${d.serviceId} slots`);
    if (d.serviceId === "steam") {
      if (!d.config.accountConnectionId || !steamAccountReady(String(d.config.accountConnectionId))) errors.push("Select a valid Steam account connection");
      if (!String(d.config.appId || "").trim()) errors.push("Add a Steam App ID");
      if (d.slots.some((slot: any) => !String(slot.config.depotId || "").trim())) errors.push("Add a Depot ID to every Steam depot");
    }
    if (d.serviceId === "itch") {
      if (!d.config.accountConnectionId) errors.push("Select an Itch.io account connection");
      if (!String(d.config.project || "").trim()) errors.push("Add an Itch.io project");
      if (d.slots.some((slot: any) => !String(slot.config.channel || "").trim())) errors.push("Add a channel to every Itch.io channel");
    }
    if (d.serviceId === "web-folder" && d.slots.some((slot: any) => !String(slot.config.outputDir || d.config.outputDir || "").trim())) errors.push("Add an output folder to every web folder");
    if (d.serviceId === "zip" && d.slots.some((slot: any) => !String(slot.config.outputPath || "").trim())) errors.push("Choose a ZIP file path for every ZIP file");
    for (const slot of d.slots as any[]) {
      const packager = flow.value.packagers.find((item: any) => item.id === slot.input.packagerId);
      const output = outputDescriptor(slot.input.outputId);
      const availability = (capabilities.value?.packagers as Record<string, any> | undefined)?.[packager?.definitionId || "electron"]?.targets.find((target: any) => target.outputId === slot.input.outputId);
      if (slot.config.migration?.unresolved || !packager || !packager.enabled || !output || !availability?.available) errors.push(`Resolve ${d.serviceId} delivery inputs`);
    }
  }
  return [...new Set(errors)];
});
const canShip = computed(() => !!flow.value && !readiness.value.length && !running.value);
const deliveryGroups = computed(() => {
  const groups = new Map<string, { destinationId: string; label: string; deliveries: any[] }>();
  for (const delivery of runDeliveries.value) {
    const group: { destinationId: string; label: string; deliveries: any[] } = groups.get(delivery.destinationId) || {
      destinationId: delivery.destinationId,
      label: destinationLabelForId(delivery.destinationId),
      deliveries: [],
    };
    group.deliveries.push(delivery);
    groups.set(delivery.destinationId, group);
  }
  return [...groups.values()];
});
const load = async () => {
  const [loaded, accountResult, hostResult] = await Promise.all([
    api.execute("workflow:load-by-name", { name: `workflows/${route.params.flowId}` }),
    api.execute("connections:load"),
    api.execute("workflow:capabilities:get"),
  ]);
  if (loaded.type === "success") {
    flow.value = migrateWorkflowConfig(loaded.result);
    if (flow.value.source.type === "construct3" && flow.value.source.profilePath) {
      await discoverProfiles(flow.value.source.profilePath);
    }
  }
  else loadError.value = loaded.ipcError;
  if (accountResult.type === "success") connections.value = accountResult.result.connections;
  if (hostResult.type === "success") capabilities.value = hostResult.result;
};
onMounted(load);
const openDestinationSettings = (destination: WorkflowDestination) => {
  activeDestination.value = destination;
  destinationDialogVisible.value = true;
};
const constructSource = () =>
  flow.value!.source as Extract<WorkflowConfig["source"], { type: "construct3" }>;
const openSourceSettings = async () => {
  sourceDialogVisible.value = true;
  if (!profileCandidates.value.length) await discoverProfiles();
};
const discoverProfiles = async (path?: string) => {
  const selectedPath = constructSource().profilePath;
  profileLoading.value = true;
  profileError.value = "";
  try {
    const result = await api.execute("construct:profiles:discover", path ? { path } : {});
    if (result.type === "success") {
      profileCandidates.value = result.result;
      if (selectedPath) {
        const selected = result.result.find((profile) => profile.path === selectedPath);
        if (!selected) profileError.value = `The selected browser profile was not found: ${selectedPath}`;
        else if (!selected.usable) profileError.value = `The selected browser profile is unavailable or locked: ${selectedPath}`;
      }
    } else profileError.value = result.ipcError;
  } finally {
    profileLoading.value = false;
  }
};
const browseProfile = async () => {
  const result = await api.execute("dialog:showOpenDialog", { title: "Choose browser profile folder", properties: ["openDirectory"] });
  const path = result.type === "success" && !result.result.canceled ? result.result.filePaths[0] : undefined;
  if (!path) return;
  await discoverProfiles(path);
  const match = profileCandidates.value.find((candidate) => candidate.path === path);
  if (match?.usable) constructSource().profilePath = path;
  else profileError.value = "This folder is not a readable supported browser profile";
};
const openConnection = (kind: string) => {
  const details: Record<string, { label: string; fieldLabel: string }> = {
    "steam-account": { label: "Steam account", fieldLabel: "Steam username" },
    "itch-account": { label: "Itch.io account", fieldLabel: "Butler API key" },
  };
  const detail = details[kind];
  if (!detail) return;
  Object.assign(connectionDialog.value, {
    visible: true,
    saving: false,
    kind,
    ...detail,
    name: "",
    value: "",
    password: "",
  });
};
const browseConnectionPath = async () => {
  const result = await api.execute("dialog:showOpenDialog", {
    title: connectionDialog.value.fieldLabel,
    properties: ["openDirectory"],
  });
  if (result.type === "success" && !result.result.canceled)
    connectionDialog.value.value = result.result.filePaths[0] || "";
};
const createConnection = async () => {
  const dialog = connectionDialog.value;
  const config = {
    "steam-account": {
      pluginName: "@pipelab/plugin-steam",
      integrationName: "Steam Account",
      field: "username",
    },
    "itch-account": {
      pluginName: "@pipelab/plugin-itch",
      integrationName: "Itch Butler Account",
      field: "apiKey",
    },
  }[dialog.kind as "steam-account" | "itch-account"];
  if (!config) return;
  dialog.saving = true;
  const record: any = {
    id: crypto.randomUUID(),
    pluginName: config.pluginName,
    integrationName: config.integrationName,
    name: dialog.name.trim(),
    createdAt: new Date().toISOString(),
    isDefault: false,
    [config.field]: dialog.value.trim(),
    ...(dialog.kind === "steam-account" ? { email: dialog.value.trim() } : {}),
    ...(dialog.kind === "steam-account" ? { password: dialog.password.trim() } : {}),
  };
  const result = await api.execute("connections:save", {
    data: { version: "1.0.0", connections: [...connections.value, record] },
  });
  dialog.saving = false;
  if (result.type === "error") {
    loadError.value = result.ipcError;
    return;
  }
  connections.value.push(record);
  if (flow.value) {
    const serviceId = dialog.kind === "itch-account" ? "itch" : "steam";
    const destination = flow.value.destinations.find((d: any) => d.serviceId === serviceId);
    if (destination) destination.config.accountConnectionId = record.id;
  }
  dialog.visible = false;
};
const save = async () => {
  if (!flow.value) return;
  saving.value = true;
  const result = await api.execute("workflow:save-by-name", {
    name: `workflows/${flow.value.id}`,
    data: JSON.stringify(flow.value),
  });
  saving.value = false;
  if (result.type === "error") loadError.value = result.ipcError;
};
let saveTimer: ReturnType<typeof setTimeout> | undefined;
watch(
  flow,
  () => {
    if (!flow.value) return;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(save, 300);
  },
  { deep: true },
);
const browseSource = async () => {
  if (!flow.value) return;
  const isFolder = flow.value.source.type === "folder";
  const result = await api.execute("dialog:showOpenDialog", {
    title: isFolder ? "Choose build folder" : "Choose Construct project",
    properties: [isFolder ? "openDirectory" : "openFile"],
    ...(isFolder
      ? {}
      : { filters: [{ name: "Construct project", extensions: ["c3p", "c3proj"] }] }),
  });
  if (result.type === "success" && !result.result.canceled)
    flow.value.source.path = result.result.filePaths[0] || "";
};
const browseFolder = async (d: Extract<WorkflowDestination, { type: "web" }>) => {
  const result = await api.execute("dialog:showOpenDialog", {
    title: "Choose output folder",
    properties: ["openDirectory", "createDirectory", "promptToCreate"],
  });
  if (result.type === "success" && !result.result.canceled)
    d.outputDir = result.result.filePaths[0] || "";
};
const ship = async () => {
  if (!flow.value || !canShip.value) return;
  releaseVersion.value = "1.0.0";
  releaseDescription.value = flow.value.description || flow.value.name;
  releaseDialogVisible.value = true;
};
const runShip = async () => {
  if (!flow.value || !canShip.value) return;
  releaseDialogVisible.value = false;
  if (
    flow.value.destinations.some((d: any) => d.type === "web" && d.cleanup) &&
    !window.confirm("This release will clean the selected output folder before copying. Continue?")
  )
    return;
  await save();
  running.value = true;
  logs.value = [];
  runSteps.value = {};
  runArtifacts.value = [];
  runDeliveries.value = [];
  buildResultStatus.value = "completed";
  const result = await api.execute(
    "workflow:execute",
    {
      name: `workflows/${flow.value.id}`,
      release: { version: releaseVersion.value.trim(), description: releaseDescription.value.trim() },
    },
    async (event: any) => {
      if (event.type !== "workflow-event") return;
      const workflowEvent = event.data;
      if (workflowEvent.type === "step.log") {
        logs.value.push(`[${workflowEvent.stepId}] ${workflowEvent.message}`);
      }
      if (workflowEvent.type === "step.started") runSteps.value[workflowEvent.stepId] = "running";
      if (workflowEvent.type === "step.completed") runSteps.value[workflowEvent.stepId] = "completed";
      if (workflowEvent.type === "step.failed") {
        runSteps.value[workflowEvent.stepId] = "failed";
        logs.value.push(`[${workflowEvent.stepId}] ${workflowEvent.error.message}`);
      }
      if (workflowEvent.type === "step.skipped") runSteps.value[workflowEvent.stepId] = "skipped";
      if (workflowEvent.type === "step.skipped") {
        const reason = `Skipped because ${workflowEvent.blockedBy.join(", ")} failed`;
        logs.value.push(`[${workflowEvent.stepId}] ${reason}`);
      }
    },
  );
  if (result.type === "success") {
    releaseVersion.value = result.result.result.version || releaseVersion.value;
    runArtifacts.value = result.result.result.artifacts || [];
    runDeliveries.value = result.result.result.deliveries || [];
    buildResultStatus.value = result.result.result.status;
    if (result.result.result.status === "completed-with-errors")
      logs.value.push("Workflow completed with errors.");
  }
  else logs.value.push(result.ipcError);
  running.value = false;
};
const cancel = async () => {
  await api.execute("workflow:cancel");
};
const artifactOutputLabel = (id: string) => outputDescriptor(id as any)?.label || id;
const formatSize = (size?: number) => typeof size === "number" ? `${Math.round(size / 1024 / 1024)} MB` : "Size pending";
const packagerLabel = (artifact: any) => {
  const packager = flow.value?.packagers.find((item: any) => artifact.producerStep?.startsWith(`packager-${item.id}-`));
  return packager?.name || artifact.producerStep || "Packager";
};
const deliveriesForArtifact = (artifactId: string) => runDeliveries.value.filter((delivery) => delivery.artifactId === artifactId);
const destinationLabelForId = (id: string) => {
  const destination = flow.value?.destinations.find((item: any) => item.id === id);
  return destination ? SERVICE_DEFINITIONS[destination.serviceId as keyof typeof SERVICE_DEFINITIONS]?.label || id : id;
};
const deliverySlotLabel = (delivery: any) => {
  const destination = flow.value?.destinations.find((item: any) => item.id === delivery.destinationId);
  const slot = destination?.slots.find((item: any) => item.id === delivery.slotId);
  return slot?.input?.outputId ? artifactOutputLabel(slot.input.outputId) : delivery.slotId;
};
const destinationLabel = (type: string) =>
  type === "steam" ? "Steam" : type === "itch" ? "Itch.io" : "Web folder";
const steam = (destination: WorkflowDestination) =>
  destination as Extract<WorkflowDestination, { type: "steam" }>;
</script>

<style scoped>
.flow-page {
  width: 100%;
  max-width: 1100px;
  box-sizing: border-box;
  margin: 0 auto;
  padding: 24px clamp(16px, 2.5vw, 32px) 48px;
}
.flow-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 16px;
}
.flow-heading {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  min-width: 0;
}
.flow-heading > .p-button {
  flex: 0 0 auto;
}
.heading {
  min-width: 0;
  flex: 1;
}
.flow-title-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  flex-shrink: 0;
  border-radius: 8px;
  color: var(--primary-color);
  background: var(--p-surface-100, var(--surface-ground));
}
h1 {
  margin: 0;
  font-size: 1.05rem;
  font-weight: 700;
  letter-spacing: -0.02em;
}
.heading p {
  margin: 0;
  font-size: 0.8rem;
  font-weight: 500;
  color: var(--p-text-muted-color, var(--text-color-secondary));
}
.card {
  border: 1px solid var(--p-surface-200, var(--surface-border));
  border-radius: 8px;
  padding: 8px 12px;
  margin: 0;
  background: var(--p-surface-0, var(--surface-card));
  transition: border-color 0.2s;
}
.source-card:hover,
.destination:hover {
  border-color: var(--p-surface-300, var(--p-surface-200, var(--surface-border)));
}
.destinations-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 16px;
}
.source-card,
.destination-heading {
  display: flex;
  align-items: center;
  gap: 14px;
}
.destination-heading {
  min-width: 0;
}
.source-card {
  min-width: 0;
}
.card-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 28px;
  flex-shrink: 0;
  color: var(--primary-color);
  font-size: 20px;
  background: var(--p-surface-50, var(--surface-ground));
  border: 1px solid var(--p-surface-100, var(--surface-border));
  border-radius: 6px;
}
.card-body,
.destination-details {
  display: flex;
  flex-direction: column;
  gap: 4px;
  flex: 1;
  min-width: 0;
}
.card-body strong,
.destination h3 {
  font-size: 0.875rem;
  font-weight: 600;
}
.card-body span,
.destination-heading span {
  font-size: 0.75rem;
  color: var(--p-text-muted-color, var(--text-color-secondary));
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.destination h3 {
  margin: 0;
}
.destination {
  min-width: 0;
}
.destination.inactive {
  opacity: 0.58;
}
.destination-active-label {
  font-size: 11px;
  color: var(--p-text-muted-color, var(--text-color-secondary));
}
.settings-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
  margin-top: 18px;
}
.settings-grid label,
.settings-grid .field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 12px;
}
.settings-grid .wide,
.platform-note {
  grid-column: 1/-1;
}
.input-row {
  display: flex;
  gap: 8px;
}
.check {
  flex-direction: row !important;
  align-items: center;
}
.platform-note {
  color: var(--text-color-secondary);
}
.platform-note i {
  color: var(--primary-color);
}
.destination-warning {
  color: var(--red-500, #ef4444);
  font-size: 20px;
}
.logs.card {
  margin-top: 12px;
  padding: 16px;
}
.build-results.card {
  margin-top: 12px;
  padding: 16px;
}
.build-results .section-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.build-results h2 {
  margin: 0 0 3px;
  font-size: 15px;
}
.build-results .section-title span {
  color: var(--text-color-secondary);
  font-size: 12px;
}
.results-section + .results-section {
  border-top: 1px solid var(--surface-border);
  margin-top: 16px;
  padding-top: 16px;
}
.build-results h3,
.build-results h4 {
  margin: 0;
  font-size: 13px;
}
.artifact-main {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 3px;
}
.artifact-main strong {
  font-size: 13px;
}
.artifact-main span,
.artifact-main small,
.results-empty {
  color: var(--text-color-secondary);
  font-size: 12px;
}
.artifact-main small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.artifact-consumers {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-end;
  gap: 5px;
  color: var(--text-color-secondary);
  font-size: 11px;
}
.consumer-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  border: 1px solid var(--surface-border);
  border-radius: 4px;
  padding: 3px 5px;
  color: var(--text-color);
}
.consumer-chip .pi-check {
  color: var(--green-500, #22c55e);
}
.consumer-chip .pi-times {
  color: var(--red-500, #ef4444);
}
.delivery-group + .delivery-group {
  margin-top: 12px;
}
.delivery-group h4 {
  margin-bottom: 6px;
  font-weight: 600;
}
.delivery-row {
  display: grid;
  grid-template-columns: minmax(130px, 0.3fr) auto minmax(0, 1fr);
  align-items: center;
  gap: 8px;
  border-top: 1px solid var(--surface-border);
  padding: 7px 0;
  font-size: 12px;
}
.delivery-error {
  color: var(--red-500, #ef4444);
  overflow-wrap: anywhere;
}
.artifact-summary {
  display: grid;
  gap: 7px;
  margin-top: 12px;
}
.artifact-summary-row {
  display: grid;
  grid-template-columns: 22px minmax(0, 1fr) minmax(220px, auto);
  align-items: start;
  gap: 8px;
  font-size: 12px;
}
.artifact-summary-row i {
  color: var(--primary-color);
  font-size: 17px;
}
@media (max-width: 700px) {
  .artifact-summary-row {
    grid-template-columns: 22px minmax(0, 1fr);
  }
  .artifact-consumers {
    grid-column: 2;
    justify-content: flex-start;
  }
  .delivery-row {
    grid-template-columns: 1fr auto;
  }
  .delivery-error {
    grid-column: 1 / -1;
  }
}
.run-steps {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 12px;
}
.run-step {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
}
.logs pre {
  max-height: 280px;
  overflow: auto;
  white-space: pre-wrap;
  font-size: 12px;
  margin: 0;
  color: var(--text-color-secondary);
}
@media (max-width: 640px) {
  .flow-page {
    padding: 24px 16px 48px;
  }
  .flow-header {
    align-items: flex-start;
  }
  .flow-header .p-button:last-child {
    margin-left: auto;
  }
  .source-card {
    align-items: flex-start;
    flex-wrap: wrap;
  }
  .source-card .card-body {
    flex-basis: calc(100% - 48px);
  }
  .source-card .p-button {
    margin-left: 48px;
  }
  .destination-heading {
    align-items: flex-start;
    flex-wrap: wrap;
  }
  .destination-heading .destination-details {
    padding-top: 2px;
  }
  .destination-heading .destination-warning {
    margin-left: auto;
  }
  .destination-heading > .p-button {
    margin-left: auto;
  }
  .settings-grid {
    grid-template-columns: 1fr;
  }
}
</style>
