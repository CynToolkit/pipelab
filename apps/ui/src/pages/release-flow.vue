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
            <h1>{{ flow?.name || "Release flow" }}</h1>
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
          </div>
          <Button label="Change" text @click="browseSource" />
          <Button
            v-if="flow.source.type === 'construct3'"
            icon="mdi mdi-cog-outline"
            text
            rounded
            aria-label="Configure source"
            v-tooltip.bottom="'Configure source'"
            @click="sourceDialogVisible = true"
          />
        </section>
        <section class="destinations-section" aria-label="Release destinations">
          <article
            v-for="destination in flow.destinations"
            :key="destination.type"
            class="destination card"
          >
            <div class="destination-heading">
              <div class="card-icon">
                <i class="mdi" :class="destinationIcon(destination.type)" />
              </div>
              <div class="destination-details">
                <h3>{{ destinationLabel(destination.type) }}</h3>
                <span>{{ destinationStatus(destination.type) }}</span>
              </div>
              <i
                v-if="!destinationReady(destination)"
                class="mdi mdi-alert-circle destination-warning"
                aria-label="Destination needs configuration"
                v-tooltip.bottom="'Destination needs configuration'"
              />
              <Tag
                v-if="runResults[destination.type]"
                :value="runResults[destination.type].status"
                :severity="
                  runResults[destination.type].status === 'completed'
                    ? 'success'
                    : runResults[destination.type].status === 'failed'
                      ? 'danger'
                      : 'info'
                "
              />
              <Button
                icon="mdi mdi-cog-outline"
                text
                rounded
                :aria-label="`Configure ${destinationLabel(destination.type)}`"
                v-tooltip.bottom="`Configure ${destinationLabel(destination.type)}`"
                @click="openDestinationSettings(destination)"
              />
            </div>
          </article>
        </section>
        <section v-if="logs.length" class="logs card">
          <div class="section-title">
            <h2>Run log</h2>
            <Button v-if="running" label="Cancel" text severity="danger" @click="cancel" />
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
        <label
          >Browser profile
          <div class="input-row">
            <Select
              v-model="constructSource().profileConnectionId"
              :options="browserProfiles"
              optionLabel="name"
              optionValue="id"
              placeholder="Default browser session"
              showClear
              class="w-full"
            /><Button
              icon="pi pi-plus"
              text
              rounded
              aria-label="Add browser profile"
              @click="openConnection('browser-profile')"
            /></div
        ></label>
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
        <label
          >Butler connection
          <div class="input-row">
            <Select
              v-model="activeDestination.accountConnectionId"
              :options="itchConnections"
              optionLabel="name"
              optionValue="id"
              placeholder="Select connection"
              class="w-full"
            /><Button
              icon="pi pi-plus"
              text
              rounded
              aria-label="Add Itch.io connection"
              @click="openConnection('itch')"
            /></div
        ></label>
        <label>Username<InputText v-model="activeDestination.user" /></label
        ><label>Project<InputText v-model="activeDestination.project" placeholder="game" /></label
        ><label>Channel<InputText v-model="activeDestination.channel" placeholder="web" /></label>
      </div>
      <div v-else class="settings-grid">
        <label
          >Steam SDK
          <div class="input-row">
            <Select
              v-model="steam(activeDestination).sdkConnectionId"
              :options="steamSdkConnections"
              optionLabel="name"
              optionValue="id"
              placeholder="Select SDK"
              class="w-full"
            /><Button
              icon="pi pi-plus"
              text
              rounded
              aria-label="Add Steam SDK connection"
              @click="openConnection('steam-sdk')"
            /></div
        ></label>
        <label
          >Steam account
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
            /></div
        ></label>
        <label>App ID<InputText v-model="steam(activeDestination).appId" /></label
        ><label>Depot ID<InputText v-model="steam(activeDestination).depotId" /></label
        ><label>App name<InputText v-model="steam(activeDestination).appName" /></label
        ><label>Bundle ID<InputText v-model="steam(activeDestination).appBundleId" /></label
        ><label>Version<InputText v-model="steam(activeDestination).appVersion" /></label
        ><label
          >Build description<InputText v-model="steam(activeDestination).description"
        /></label>
        <label class="wide"
          >Icon
          <div class="input-row">
            <InputText v-model="steam(activeDestination).icon" class="w-full" /><Button
              icon="pi pi-folder-open"
              outlined
              aria-label="Choose icon"
              @click="browseIcon(steam(activeDestination))"
            /></div
        ></label>
        <small class="wide platform-note"
          ><i class="mdi mdi-information-outline" /> Steam builds use this computer’s
          {{ platformLabel }} {{ processArch }} target.</small
        >
      </div>
      <template #footer><Button label="Done" @click="destinationDialogVisible = false" /></template>
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
        ><label
          >{{ connectionDialog.fieldLabel }}
          <div class="input-row">
            <InputText
              v-model="connectionDialog.value"
              class="w-full"
              :type="connectionDialog.kind === 'itch' ? 'password' : 'text'"
            /><Button
              v-if="connectionDialog.kind !== 'steam-account' && connectionDialog.kind !== 'itch'"
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
          :disabled="!connectionDialog.name.trim() || !connectionDialog.value.trim()"
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
import { useAPI } from "@renderer/composables/api";
import type { ReleaseFlow, ReleaseFlowDestination } from "@pipelab/shared";
const route = useRoute();
const router = useRouter();
const api = useAPI();
const flow = ref<ReleaseFlow>();
const connections = ref<any[]>([]);
const loadError = ref("");
const saving = ref(false);
const running = ref(false);
const activeDestination = ref<ReleaseFlowDestination>();
const destinationDialogVisible = ref(false);
const sourceDialogVisible = ref(false);
const logs = ref<string[]>([]);
const runResults = ref<Record<string, { status: string; error?: string }>>({});
const connectionDialog = ref({
  visible: false,
  saving: false,
  kind: "",
  label: "",
  fieldLabel: "",
  name: "",
  value: "",
});
const failureOptions = [
  { label: "Continue with other destinations", value: true },
  { label: "Stop after the first failure", value: false },
];
const platformLabel = navigator.platform.includes("Mac")
  ? "macOS"
  : navigator.platform.includes("Win")
    ? "Windows"
    : "Linux";
const processArch =
  navigator.userAgent.includes("arm64") || navigator.userAgent.includes("aarch64")
    ? "ARM64"
    : "x64";
const browserProfiles = computed(() =>
  connections.value.filter(
    (c) => c.pluginName === "@pipelab/plugin-construct" && c.integrationName === "Browser Profile",
  ),
);
const steamSdkConnections = computed(() =>
  connections.value.filter(
    (c) => c.pluginName === "@pipelab/plugin-steam" && c.integrationName === "Steam SDK",
  ),
);
const steamAccountConnections = computed(() =>
  connections.value.filter(
    (c) => c.pluginName === "@pipelab/plugin-steam" && c.integrationName === "Steam Account",
  ),
);
const itchConnections = computed(() =>
  connections.value.filter((c) => c.pluginName === "@pipelab/plugin-itch"),
);
const readiness = computed(() => {
  if (!flow.value) return [];
  const errors: string[] = [];
  if (!flow.value.source.path) errors.push("Choose a source");
  for (const d of flow.value.destinations) {
    if (d.type === "web" && !d.outputDir) errors.push("Choose a web output folder");
    if (d.type === "itch" && (!d.accountConnectionId || !d.user || !d.project || !d.channel))
      errors.push("Complete the Itch.io destination");
    if (
      d.type === "steam" &&
      (!d.sdkConnectionId ||
        !d.accountConnectionId ||
        !d.appId ||
        !d.depotId ||
        !d.appName ||
        !d.appBundleId ||
        !d.appVersion)
    )
      errors.push("Complete the Steam destination");
  }
  return [...new Set(errors)];
});
const canShip = computed(() => !!flow.value && !readiness.value.length && !running.value);
const destinationReady = (destination: ReleaseFlowDestination) => {
  if (destination.type === "web") return !!destination.outputDir;
  if (destination.type === "itch") {
    return !!(
      destination.accountConnectionId &&
      destination.user &&
      destination.project &&
      destination.channel
    );
  }
  return !!(
    destination.sdkConnectionId &&
    destination.accountConnectionId &&
    destination.appId &&
    destination.depotId &&
    destination.appName &&
    destination.appBundleId &&
    destination.appVersion
  );
};
const normalize = (value: ReleaseFlow) => {
  value.continueOnError ??= true;
  for (const d of value.destinations) {
    if (d.type === "web") {
      d.overwrite ??= false;
      d.cleanup ??= false;
    }
    if (d.type === "steam") {
      d.sdkConnectionId ??= "";
      d.accountConnectionId ??= "";
      d.depotId ??= "";
      d.description ??= value.name;
      d.appName ??= value.name;
      d.appBundleId ??= "com.pipelab.app.game";
      d.appVersion ??= "1.0.0";
    }
    if (d.type === "itch") {
      d.accountConnectionId ??= "";
      d.user ??= "";
    }
  }
  return value;
};
const load = async () => {
  const [loaded, accountResult] = await Promise.all([
    api.execute("release-flow:load-by-name", { name: `release-flows/${route.params.flowId}` }),
    api.execute("connections:load"),
  ]);
  if (loaded.type === "success") flow.value = normalize(loaded.result as ReleaseFlow);
  else loadError.value = loaded.ipcError;
  if (accountResult.type === "success") connections.value = accountResult.result.connections;
};
onMounted(load);
const openDestinationSettings = (destination: ReleaseFlowDestination) => {
  activeDestination.value = destination;
  destinationDialogVisible.value = true;
};
const constructSource = () =>
  flow.value!.source as Extract<ReleaseFlow["source"], { type: "construct3" }>;
const openConnection = (kind: string) => {
  const details: Record<string, { label: string; fieldLabel: string }> = {
    "browser-profile": { label: "browser profile", fieldLabel: "Chrome profile directory" },
    "steam-sdk": { label: "Steam SDK", fieldLabel: "Steam SDK directory" },
    "steam-account": { label: "Steam account", fieldLabel: "Steam username" },
    itch: { label: "Itch.io connection", fieldLabel: "Butler API key" },
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
    "browser-profile": {
      pluginName: "@pipelab/plugin-construct",
      integrationName: "Browser Profile",
      field: "path",
    },
    "steam-sdk": {
      pluginName: "@pipelab/plugin-steam",
      integrationName: "Steam SDK",
      field: "path",
    },
    "steam-account": {
      pluginName: "@pipelab/plugin-steam",
      integrationName: "Steam Account",
      field: "email",
    },
    itch: {
      pluginName: "@pipelab/plugin-itch",
      integrationName: "Itch Butler Account",
      field: "apiKey",
    },
  }[dialog.kind as "browser-profile" | "steam-sdk" | "steam-account" | "itch"];
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
    if (dialog.kind === "browser-profile") {
      (
        flow.value.source as Extract<ReleaseFlow["source"], { type: "construct3" }>
      ).profileConnectionId = record.id;
    } else if (dialog.kind === "itch") {
      const destination = flow.value.destinations.find((d) => d.type === "itch");
      if (destination?.type === "itch") destination.accountConnectionId = record.id;
    } else {
      const destination = flow.value.destinations.find((d) => d.type === "steam");
      if (destination?.type === "steam") {
        if (dialog.kind === "steam-sdk") destination.sdkConnectionId = record.id;
        else destination.accountConnectionId = record.id;
      }
    }
  }
  dialog.visible = false;
};
const save = async () => {
  if (!flow.value) return;
  saving.value = true;
  const result = await api.execute("release-flow:save-by-name", {
    name: `release-flows/${flow.value.id}`,
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
const browseFolder = async (d: Extract<ReleaseFlowDestination, { type: "web" }>) => {
  const result = await api.execute("dialog:showOpenDialog", {
    title: "Choose output folder",
    properties: ["openDirectory", "createDirectory", "promptToCreate"],
  });
  if (result.type === "success" && !result.result.canceled)
    d.outputDir = result.result.filePaths[0] || "";
};
const browseIcon = async (d: Extract<ReleaseFlowDestination, { type: "steam" }>) => {
  const result = await api.execute("dialog:showOpenDialog", {
    title: "Choose application icon",
    properties: ["openFile"],
    filters: [{ name: "Image", extensions: ["png", "ico", "icns"] }],
  });
  if (result.type === "success" && !result.result.canceled)
    d.icon = result.result.filePaths[0] || "";
};
const ship = async () => {
  if (!flow.value || !canShip.value) return;
  if (
    flow.value.destinations.some((d) => d.type === "web" && d.cleanup) &&
    !window.confirm("This release will clean the selected output folder before copying. Continue?")
  )
    return;
  await save();
  running.value = true;
  logs.value = [];
  runResults.value = {};
  const result = await api.execute(
    "release-flow:execute",
    { name: `release-flows/${flow.value.id}` },
    async (event: any) => {
      if (event.type === "release-log") logs.value.push(event.data.message);
      if (event.type === "release-destination")
        runResults.value[event.data.type] = { status: event.data.status, error: event.data.error };
    },
  );
  if (result.type === "success") runResults.value = result.result.destinations;
  else logs.value.push(result.ipcError);
  running.value = false;
};
const cancel = async () => {
  await api.execute("release-flow:cancel");
};
const destinationLabel = (type: string) =>
  type === "steam" ? "Steam" : type === "itch" ? "Itch.io" : "Web folder";
const destinationIcon = (type: string) =>
  type === "steam" ? "mdi-steam" : type === "itch" ? "mdi-puzzle-outline" : "mdi-web";
const destinationStatus = (type: string) =>
  runResults.value[type]?.error ||
  (runResults.value[type]?.status === "completed"
    ? "Published successfully"
    : "Configure this destination");
const steam = (destination: ReleaseFlowDestination) =>
  destination as Extract<ReleaseFlowDestination, { type: "steam" }>;
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
.settings-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
  margin-top: 18px;
}
.settings-grid label {
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
