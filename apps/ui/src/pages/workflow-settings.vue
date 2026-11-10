<template>
  <WorkflowShell
    :flow-id="flowId"
    :project-id="projectId"
    :title="flow?.name || 'Workflow'"
    active="settings"
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
        {{ saveState === "saving" ? "Saving…" : saveState === "error" ? "Save failed" : "Saved" }}
      </span>
      <Button
        v-if="saveState === 'error'"
        label="Retry save"
        text
        size="small"
        @click="save().catch(() => {})"
      />
    </template>

    <main class="settings-page" :aria-busy="!flow && !loadError && agent.isReady.value">
      <Message v-if="loadError" severity="error" role="alert">
        <div class="state-copy">
          <strong>Couldn’t load workflow settings</strong>
          <span>{{ loadError }}</span>
          <Button label="Retry" text size="small" @click="loadWorkflow" />
        </div>
      </Message>
      <p v-else-if="!agent.isReady.value" class="inline-state" role="status">
        Waiting for the engine…
      </p>
      <p v-else-if="!flow" class="inline-state" role="status">Loading settings…</p>
      <Message v-if="saveError" severity="error" role="alert">{{ saveError }}</Message>

      <div v-if="flow" class="settings-layout">
        <nav class="settings-tabs" role="tablist" aria-orientation="vertical">
          <button
            v-for="tab in tabs"
            :key="tab.id"
            :id="`settings-tab-${tab.id}`"
            type="button"
            role="tab"
            class="settings-tab"
            :aria-selected="activeTab === tab.id"
            :aria-controls="`settings-panel-${tab.id}`"
            :tabindex="activeTab === tab.id ? 0 : -1"
            @click="activeTab = tab.id"
            @keydown="onTabKeydown"
          >
            <i :class="tab.icon" aria-hidden="true" />{{ tab.label }}
          </button>
        </nav>

        <section
          :id="`settings-panel-${activeTab}`"
          class="settings-panel"
          role="tabpanel"
          :aria-labelledby="`settings-tab-${activeTab}`"
        >
          <template v-if="activeTab === 'general'">
            <h2>General</h2>
            <label class="check-row">
              <Checkbox
                binary
                :model-value="flow.continueOnError === false"
                input-id="stop-on-first-failure"
                @update:model-value="flow.continueOnError = !$event"
              />
              <span>Stop on first failure</span>
            </label>
            <label class="check-row">
              <Checkbox
                binary
                :model-value="flow.settings?.checkDestinations !== false"
                input-id="check-destinations"
                @update:model-value="setSetting('checkDestinations', $event)"
              />
              <span>Check destinations before running</span>
            </label>
            <label class="check-row">
              <Checkbox
                binary
                :model-value="flow.settings?.keepFailedArtifacts !== false"
                input-id="keep-failed-artifacts"
                @update:model-value="setSetting('keepFailedArtifacts', $event)"
              />
              <span>Keep artifacts of failed runs</span>
            </label>
          </template>

          <template v-else-if="activeTab === 'retention'">
            <h2>Retention</h2>
            <fieldset v-for="group in retentionGroups" :key="group.title" class="rule-group">
              <legend>{{ group.title }}</legend>
              <div v-for="rule in group.rules" :key="rule.id" class="rule-row">
                <Checkbox
                  binary
                  :model-value="rule.get() !== undefined"
                  :input-id="`retention-${rule.id}`"
                  @update:model-value="rule.set($event ? rule.default : undefined)"
                />
                <label :for="`retention-${rule.id}`">{{ rule.before }}</label>
                <InputNumber
                  class="rule-number"
                  :model-value="rule.get() ?? null"
                  :disabled="rule.get() === undefined"
                  :min="1"
                  :use-grouping="false"
                  show-buttons
                  button-layout="horizontal"
                  :aria-label="`${rule.before} ${rule.unit}`"
                  @update:model-value="rule.set($event ?? undefined)"
                />
                <span class="rule-unit">{{ rule.unit }}</span>
              </div>
            </fieldset>
            <fieldset class="rule-group">
              <legend>Protection</legend>
              <label class="check-row">
                <Checkbox
                  binary
                  :model-value="flow.settings?.retention?.keepLatestSuccessful !== false"
                  input-id="retention-keep-latest"
                  @update:model-value="setKeepLatestSuccessful($event)"
                />
                <span>Always keep the latest successful run</span>
              </label>
            </fieldset>
            <section class="retention-preview" aria-live="polite" aria-label="Retention preview">
              <div class="preview-heading">
                <h3>Preview</h3>
                <Button
                  label="Apply now"
                  icon="pi pi-trash"
                  size="small"
                  severity="danger"
                  outlined
                  :disabled="!canApplyRetention"
                  :loading="applying"
                  @click="confirmApplyRetention"
                />
              </div>
              <Message v-if="applyResult" severity="success" role="status" :closable="false">{{
                applyResult
              }}</Message>
              <Message v-if="applyError" severity="error" role="alert">{{ applyError }}</Message>
              <p v-if="!historyLoaded" class="preview-summary">Loading runs…</p>
              <template v-else>
                <p class="preview-summary">{{ previewSummary }}</p>
                <ul v-if="preview.rows.length" class="preview-list">
                  <li v-for="row in shownPreviewRows" :key="row.entry.id" class="preview-row">
                    <i :class="previewIcon(row.action)" aria-hidden="true" />
                    <span class="preview-run">{{ runLabel(row.entry) }}</span>
                    <span class="preview-meta">{{ runDate(row.entry) }}</span>
                    <span class="preview-tag" :class="`tag-${row.action}`">{{
                      previewAction(row.action)
                    }}</span>
                  </li>
                  <li v-if="hiddenPreviewRows" class="preview-more">
                    and {{ hiddenPreviewRows }} more
                  </li>
                </ul>
              </template>
            </section>
          </template>

          <template v-else>
            <h2>Notifications</h2>
            <label class="check-row">
              <Checkbox
                binary
                :model-value="flow.settings?.notifications?.onSuccess !== false"
                input-id="notify-success"
                @update:model-value="setNotification('onSuccess', $event)"
              />
              <span>When a run succeeds</span>
            </label>
            <label class="check-row">
              <Checkbox
                binary
                :model-value="flow.settings?.notifications?.onFailure !== false"
                input-id="notify-failure"
                @update:model-value="setNotification('onFailure', $event)"
              />
              <span>When a run fails</span>
            </label>
            <Message v-if="notificationsBlocked" severity="warn" role="status">
              Notifications are blocked for Pipelab. Allow them in your system or browser settings.
            </Message>
          </template>
        </section>
      </div>
    </main>
  </WorkflowShell>
  <ConfirmDialog group="retention-apply" />
</template>

<script setup lang="ts">
import { computed, nextTick, onUnmounted, ref, toRaw, watch } from "vue";
import { onBeforeRouteLeave, useRoute } from "vue-router";
import Button from "primevue/button";
import Checkbox from "primevue/checkbox";
import ConfirmDialog from "primevue/confirmdialog";
import { useConfirm } from "primevue/useconfirm";
import InputNumber from "primevue/inputnumber";
import Message from "primevue/message";
import type { BuildHistoryEntry, ReleaseConfig, ReleaseWorkflowSettings } from "@pipelab/shared";
import { useRouteReadiness } from "@renderer/composables/useRouteReadiness";
import { useAgentAvailability } from "@renderer/composables/useAgentAvailability";
import WorkflowShell from "../components/WorkflowShell.vue";
import { useAPI } from "../composables/api";
import { requestNotificationPermission } from "../utils/run-notifications";
import { createSerializedTaskQueue } from "./release-flow-model";
import { retentionPreview, type RetentionPreviewRow } from "./workflow-retention-preview";

const route = useRoute();
const api = useAPI();
const agent = useAgentAvailability();
const confirm = useConfirm();
const flowId = computed(() => String(route.params.flowId));
const projectId = computed(() => String(route.params.projectId));

const tabs = [
  { id: "general", label: "General", icon: "mdi mdi-tune" },
  { id: "retention", label: "Retention", icon: "mdi mdi-database-clock-outline" },
  { id: "notifications", label: "Notifications", icon: "mdi mdi-bell-outline" },
] as const;
type TabId = (typeof tabs)[number]["id"];
const activeTab = ref<TabId>("general");
const onTabKeydown = (event: KeyboardEvent) => {
  const step = event.key === "ArrowDown" ? 1 : event.key === "ArrowUp" ? -1 : 0;
  if (!step) return;
  event.preventDefault();
  const index = tabs.findIndex((tab) => tab.id === activeTab.value);
  activeTab.value = tabs[(index + step + tabs.length) % tabs.length]!.id;
  void nextTick(() => document.getElementById(`settings-tab-${activeTab.value}`)?.focus());
};

const flow = ref<ReleaseConfig>();
const loadError = ref("");
const saveError = ref("");
const saveState = ref<"saving" | "saved" | "error">("saved");
const notificationsBlocked = ref(false);
useRouteReadiness(computed(() => !agent.isReady.value || !!flow.value || !!loadError.value));

let hydrating = false;
let loadGeneration = 0;
let changeRevision = 0;
let persistedRevision = 0;
let saveTimer: ReturnType<typeof setTimeout> | undefined;

const settings = (): ReleaseWorkflowSettings => (flow.value!.settings ??= {});
const setSetting = (key: "checkDestinations" | "keepFailedArtifacts", value: boolean) => {
  settings()[key] = value;
};
type RuleGroup = "history" | "artifacts";
const retention = () => flow.value?.settings?.retention;
const setGroupRule = (group: RuleGroup, key: "maxRuns" | "maxAgeDays", value?: number) => {
  const policy = { ...settings().retention };
  const rules: { maxRuns?: number; maxAgeDays?: number } = { ...policy[group] };
  if (value === undefined) delete rules[key];
  else rules[key] = value;
  if (Object.keys(rules).length) policy[group] = rules;
  else delete policy[group];
  commitRetention(policy);
};
const setFailedMaxAgeDays = (value?: number) => {
  const policy = { ...settings().retention };
  if (value === undefined) delete policy.failedMaxAgeDays;
  else policy.failedMaxAgeDays = value;
  commitRetention(policy);
};
const setKeepLatestSuccessful = (value: boolean) => {
  // Absent means on, so only the opt-out is stored.
  const policy = { ...settings().retention };
  if (value) delete policy.keepLatestSuccessful;
  else policy.keepLatestSuccessful = false;
  commitRetention(policy);
};
const commitRetention = (policy: NonNullable<ReleaseWorkflowSettings["retention"]>) => {
  if (Object.keys(policy).length) settings().retention = policy;
  else delete settings().retention;
};
interface RetentionRule {
  id: string;
  before: string;
  unit: string;
  default: number;
  get: () => number | undefined;
  set: (value?: number) => void;
}
const retentionGroups: { title: string; rules: RetentionRule[] }[] = [
  {
    title: "Run history",
    rules: [
      {
        id: "history-runs",
        before: "Keep only the last",
        unit: "runs",
        default: 20,
        get: () => retention()?.history?.maxRuns,
        set: (value) => setGroupRule("history", "maxRuns", value),
      },
      {
        id: "history-age",
        before: "Delete runs older than",
        unit: "days",
        default: 90,
        get: () => retention()?.history?.maxAgeDays,
        set: (value) => setGroupRule("history", "maxAgeDays", value),
      },
    ],
  },
  {
    title: "Artifact files",
    rules: [
      {
        id: "artifacts-runs",
        before: "Keep files for only the last",
        unit: "runs",
        default: 3,
        get: () => retention()?.artifacts?.maxRuns,
        set: (value) => setGroupRule("artifacts", "maxRuns", value),
      },
      {
        id: "artifacts-age",
        before: "Delete files older than",
        unit: "days",
        default: 30,
        get: () => retention()?.artifacts?.maxAgeDays,
        set: (value) => setGroupRule("artifacts", "maxAgeDays", value),
      },
    ],
  },
  {
    title: "Failed runs",
    rules: [
      {
        id: "failed-age",
        before: "Delete failed runs older than",
        unit: "days",
        default: 7,
        get: () => retention()?.failedMaxAgeDays,
        set: setFailedMaxAgeDays,
      },
    ],
  },
];
const setNotification = async (key: "onSuccess" | "onFailure", value: boolean) => {
  // Ask while the user is looking at the switch, not in the middle of a run.
  notificationsBlocked.value = value ? !(await requestNotificationPermission()) : false;
  settings().notifications = { ...settings().notifications, [key]: value };
};

const historyEntries = ref<BuildHistoryEntry[]>([]);
const historyLoaded = ref(false);
const loadHistory = async () => {
  if (!agent.isReady.value) return;
  const requestedFlowId = flowId.value;
  const result = await api.execute("build-history:get-all", {
    query: { workflowId: requestedFlowId, projectId: projectId.value },
  });
  if (requestedFlowId !== flowId.value) return;
  historyEntries.value = result.type === "success" ? result.result.entries : [];
  historyLoaded.value = true;
};
const preview = computed(() =>
  retentionPreview(historyEntries.value, flowId.value, flow.value?.settings?.retention),
);
const PREVIEW_LIMIT = 8;
const shownPreviewRows = computed(() => preview.value.rows.slice(0, PREVIEW_LIMIT));
const hiddenPreviewRows = computed(() => Math.max(0, preview.value.rows.length - PREVIEW_LIMIT));
const formatBytes = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[unit]}`;
};
const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`;
const previewSummary = computed(() => {
  const { runCount, fileCount, bytes, total } = preview.value;
  if (!total) return "This workflow has no finished runs yet.";
  if (!runCount && !fileCount) return `Nothing would be removed from ${plural(total, "run")}.`;
  const parts = [
    ...(runCount ? [`${plural(runCount, "run")} deleted`] : []),
    ...(fileCount ? [`files removed from ${plural(fileCount, "run")}`] : []),
  ];
  return `${parts.join(", ")} · ${formatBytes(bytes)} freed · ${plural(total - runCount, "run")} kept`;
});
const runLabel = (entry: BuildHistoryEntry) =>
  entry.version ? `v${entry.version}` : `Run ${entry.id.slice(0, 8)}`;
const runDate = (entry: BuildHistoryEntry) =>
  new Date(entry.createdAt).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
const previewAction = (action: RetentionPreviewRow["action"]) =>
  action === "delete-run" ? "Delete run" : action === "delete-files" ? "Remove files" : "Protected";
const previewIcon = (action: RetentionPreviewRow["action"]) =>
  action === "delete-run"
    ? "mdi mdi-delete-outline"
    : action === "delete-files"
      ? "mdi mdi-file-remove-outline"
      : "mdi mdi-shield-check-outline";

const applying = ref(false);
const applyResult = ref("");
const applyError = ref("");
const canApplyRetention = computed(
  () => historyLoaded.value && (preview.value.runCount > 0 || preview.value.fileCount > 0),
);
const applyRetentionNow = async () => {
  applying.value = true;
  applyResult.value = "";
  applyError.value = "";
  try {
    // The server applies the saved policy, so make sure the edits on screen are saved first.
    clearTimeout(saveTimer);
    await save();
    const result = await api.execute("workflow:retention:apply", {
      workflowId: flowId.value,
      projectId: projectId.value,
    });
    if (result.type === "error") throw new Error(result.ipcError);
    applyResult.value = `Deleted ${plural(result.result.runs, "run")} and removed files from ${plural(result.result.files, "run")}.`;
    await loadHistory();
  } catch (cause) {
    applyError.value = cause instanceof Error ? cause.message : String(cause);
  } finally {
    applying.value = false;
  }
};
const confirmApplyRetention = () =>
  confirm.require({
    group: "retention-apply",
    header: "Apply retention now",
    message: `${previewSummary.value}. This cannot be undone.`,
    icon: "pi pi-exclamation-triangle",
    rejectProps: { label: "Cancel", severity: "secondary", outlined: true },
    acceptProps: { label: "Apply now", severity: "danger" },
    defaultFocus: "reject",
    accept: () => void applyRetentionNow(),
  });

const loadWorkflow = async () => {
  if (!agent.isReady.value) return;
  const generation = ++loadGeneration;
  const requestedFlowId = flowId.value;
  const requestedProjectId = projectId.value;
  loadError.value = "";
  try {
    const result = await api.execute("workflow:load", {
      workflowId: requestedFlowId,
      projectId: requestedProjectId,
    });
    if (generation !== loadGeneration) return;
    if (result.type === "error") throw new Error(result.ipcError);
    if (result.result.id !== requestedFlowId || result.result.project !== requestedProjectId)
      throw new Error("Loaded workflow identity does not match the requested route.");
    hydrating = true;
    flow.value = result.result;
    await nextTick();
    hydrating = false;
    changeRevision = 0;
    persistedRevision = 0;
    saveState.value = "saved";
    saveError.value = "";
  } catch (cause) {
    if (generation === loadGeneration) {
      hydrating = false;
      loadError.value = cause instanceof Error ? cause.message : String(cause);
    }
  }
};

const save = createSerializedTaskQueue(async () => {
  if (!flow.value || persistedRevision === changeRevision) return;
  if (!agent.isReady.value) {
    saveState.value = "error";
    saveError.value = "The engine disconnected before these settings could be saved.";
    throw new Error(saveError.value);
  }
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
  else saveState.value = "saved";
});

watch(
  flow,
  () => {
    if (hydrating || !flow.value) return;
    changeRevision += 1;
    saveState.value = "saving";
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => void save().catch(() => {}), 500);
  },
  { deep: true, flush: "sync" },
);

watch(
  [flowId, projectId, () => agent.isReady.value],
  () => {
    void loadWorkflow();
    void loadHistory();
  },
  { immediate: true },
);

onBeforeRouteLeave(async () => {
  clearTimeout(saveTimer);
  try {
    await save();
    return true;
  } catch {
    return false;
  }
});
onUnmounted(() => clearTimeout(saveTimer));
</script>

<style scoped>
.settings-page {
  display: grid;
  gap: 16px;
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
.inline-state {
  margin: 0;
  color: var(--pl-muted);
  font-size: 0.85rem;
}
.state-copy {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 12px;
}
.settings-layout {
  display: grid;
  grid-template-columns: 200px minmax(0, 1fr);
  gap: 28px;
  align-items: start;
}
.settings-tabs {
  display: grid;
  gap: 2px;
}
.settings-tab {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  border: 0;
  border-radius: 10px;
  background: transparent;
  color: var(--pl-muted);
  font: inherit;
  font-size: 0.88rem;
  font-weight: 500;
  text-align: left;
  cursor: pointer;
  transition:
    color 0.15s var(--pl-ease),
    background 0.15s var(--pl-ease);
}
.settings-tab:hover {
  color: var(--p-text-color);
  background: var(--pl-hover);
}
.settings-tab[aria-selected="true"] {
  color: var(--p-text-color);
  background: var(--pl-sunken);
  font-weight: 600;
}
.settings-tab:focus-visible {
  outline: none;
  box-shadow: var(--pl-ring);
}
.settings-panel {
  display: grid;
  gap: 14px;
  padding: 20px 24px;
  border: 1px solid var(--pl-border);
  border-radius: var(--pl-radius, 14px);
  background: var(--pl-card);
}
.settings-panel h2 {
  margin: 0 0 4px;
  font-size: 1rem;
  font-weight: 600;
}
.check-row {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 0.9rem;
  cursor: pointer;
}
.rule-group {
  display: grid;
  gap: 10px;
  margin: 0;
  padding: 0;
  border: 0;
}
.rule-group legend {
  padding: 0;
  margin-bottom: 8px;
  color: var(--pl-muted);
  font-size: 0.72rem;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}
.rule-row {
  display: grid;
  grid-template-columns: auto minmax(0, 15rem) 9rem auto;
  align-items: center;
  gap: 10px;
  font-size: 0.9rem;
}
.rule-row label {
  cursor: pointer;
}
.rule-number {
  width: 100%;
}
.rule-number :deep(input) {
  width: 100%;
  min-width: 0;
  text-align: center;
}
.retention-preview {
  display: grid;
  gap: 8px;
  padding: 14px 16px;
  border: 1px solid var(--pl-border);
  border-radius: 12px;
  background: var(--pl-sunken);
}
.preview-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.retention-preview h3 {
  margin: 0;
  color: var(--pl-muted);
  font-size: 0.72rem;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}
.preview-summary {
  margin: 0;
  font-size: 0.88rem;
  font-weight: 500;
}
.preview-list {
  display: grid;
  gap: 2px;
  margin: 0;
  padding: 0;
  list-style: none;
}
.preview-row {
  display: grid;
  grid-template-columns: 18px minmax(0, 1fr) auto auto;
  align-items: center;
  gap: 10px;
  padding: 4px 0;
  font-size: 0.82rem;
}
.preview-run {
  overflow: hidden;
  font-weight: 500;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.preview-meta,
.preview-more {
  color: var(--pl-muted);
  font-size: 0.78rem;
}
.preview-tag {
  padding: 1px 8px;
  border-radius: 999px;
  font-size: 0.72rem;
  font-weight: 600;
}
.tag-delete-run {
  color: var(--red-600, #dc2626);
  background: color-mix(in srgb, var(--red-500, #ef4444) 12%, transparent);
}
.tag-delete-files {
  color: var(--orange-600, #ea580c);
  background: color-mix(in srgb, var(--orange-500, #f97316) 12%, transparent);
}
.tag-protected {
  color: var(--green-700, #15803d);
  background: color-mix(in srgb, var(--green-500, #22c55e) 12%, transparent);
}
.rule-unit {
  color: var(--pl-muted);
  font-size: 0.85rem;
}
@media (max-width: 720px) {
  .settings-layout {
    grid-template-columns: 1fr;
  }
  .settings-tabs {
    grid-auto-flow: column;
    overflow-x: auto;
  }
}
</style>
