<template>
  <Layout>
    <WorkflowShell
      :flow-id="flowId"
      :project-id="projectId"
      :title="entry?.workflowName || entry?.projectName || 'Workflow'"
      :subtitle="entry?.version ? `Release ${entry.version}` : `Run #${shortId}`"
      active="runs"
    >
      <main v-if="entry" class="run-page">
        <div class="run-navigation">
          <Button
            label="Back to runs"
            icon="mdi mdi-arrow-left"
            text
            size="small"
            @click="backToRuns"
          />
        </div>
        <Message v-if="error" severity="error" :closable="false" role="alert" class="run-error">{{
          error
        }}</Message>
        <Message v-if="cancelFeedback" severity="info" :closable="false" class="run-error">{{
          cancelFeedback
        }}</Message>
        <header class="run-header">
          <div class="run-title-row">
            <span
              class="status-mark"
              :class="`status-${entry.status}`"
              :aria-label="statusLabel(entry.status)"
            >
              <i :class="statusIcon(entry.status)" aria-hidden="true" />
            </span>
            <div class="run-title">
              <div class="title-line">
                <h2>{{ entry.version ? `Release ${entry.version}` : "Workflow run" }}</h2>
                <Tag :value="statusLabel(entry.status)" :severity="statusSeverity(entry.status)" />
              </div>
              <div class="run-meta">
                <span>{{ formatDate(entry.startTime) }}</span
                ><span>{{ duration }}</span
                ><code>#{{ shortId }}</code>
              </div>
            </div>
          </div>
          <Button
            v-if="entry.status === 'running'"
            label="Cancel run"
            icon="pi pi-stop-circle"
            severity="danger"
            outlined
            :loading="cancelling"
            @click="cancel"
          />
        </header>
        <Message v-if="entry.error" severity="error" :closable="false" class="run-error">{{
          entry.error.message
        }}</Message>
        <section
          v-if="playwrightVideoPath"
          class="video-output"
          aria-label="Playwright video output"
        >
          <i class="mdi mdi-video-outline" aria-hidden="true" />
          <div class="video-path">
            <strong>Playwright video output</strong>
            <code>{{ playwrightVideoPath }}</code>
            <small v-if="copyVideoFeedback" aria-live="polite">{{ copyVideoFeedback }}</small>
          </div>
          <Button
            :label="videoCopied ? 'Copied' : 'Copy path'"
            :icon="videoCopied ? 'pi pi-check' : 'pi pi-copy'"
            text
            size="small"
            @click="copyVideoPath"
          />
        </section>
        <div class="run-summary" aria-label="Run summary">
          <span
            ><i class="mdi mdi-check-circle-outline" />{{ entry.completedSteps }}/{{
              entry.totalSteps
            }}
            steps</span
          >
          <span
            ><i class="mdi mdi-package-variant-closed" />{{
              entry.artifacts?.length || 0
            }}
            artifacts</span
          >
          <span
            ><i class="mdi mdi-cloud-upload-outline" />{{
              entry.deliveries?.length || 0
            }}
            deliveries</span
          >
          <span v-if="entry.version"><i class="mdi mdi-tag-outline" />{{ entry.version }}</span>
          <span v-if="entry.status === 'running'" class="live-indicator"><i />Live updates</span>
        </div>

        <nav class="detail-tabs" aria-label="Run detail sections">
          <button
            :class="{ active: activePanel === 'logs' }"
            :aria-current="activePanel === 'logs' ? 'page' : undefined"
            @click="activePanel = 'logs'"
          >
            <i class="mdi mdi-console-line" />Logs
          </button>
          <button
            :class="{ active: activePanel === 'artifacts' }"
            :aria-current="activePanel === 'artifacts' ? 'page' : undefined"
            @click="activePanel = 'artifacts'"
          >
            <i class="mdi mdi-package-variant-closed" />Artifacts
            <span>{{ entry.artifacts?.length || 0 }}</span>
          </button>
          <button
            :class="{ active: activePanel === 'deliveries' }"
            :aria-current="activePanel === 'deliveries' ? 'page' : undefined"
            @click="activePanel = 'deliveries'"
          >
            <i class="mdi mdi-cloud-upload-outline" />Deliveries
            <span>{{ entry.deliveries?.length || 0 }}</span>
          </button>
        </nav>

        <section v-if="activePanel === 'logs'" class="execution-layout" aria-label="Execution logs">
          <aside class="step-sidebar" aria-label="Execution steps">
            <div class="sidebar-heading">
              Execution <span>{{ entry.steps.length }}</span>
            </div>
            <button
              class="step-item all-logs"
              :class="{ selected: selectedStep === null }"
              :aria-pressed="selectedStep === null"
              @click="selectStep(null)"
            >
              <i class="mdi mdi-text-box-multiple-outline" aria-hidden="true" /><span>All logs</span
              ><small>{{ allLogs.length }}</small>
            </button>
            <div v-if="!entry.steps.length" class="step-empty">Waiting for steps…</div>
            <button
              v-for="(step, index) in entry.steps"
              :key="step.id"
              class="step-item"
              :class="[{ selected: selectedStep === step.id }, `step-${step.status}`]"
              :aria-pressed="selectedStep === step.id"
              @click="selectStep(step.id)"
            >
              <span class="step-icon" :class="`status-${step.status}`"
                ><i :class="statusIcon(step.status)" aria-hidden="true"
              /></span>
              <span class="step-label"
                ><strong>{{ step.name }}</strong
                ><small>{{ stepDuration(step) }}</small></span
              >
              <small class="log-count">{{ step.logs.length }}</small>
              <span class="sr-only">Step {{ index + 1 }}, {{ statusLabel(step.status) }}</span>
            </button>
          </aside>
          <div class="log-panel">
            <header class="log-heading">
              <div>
                <span class="log-eyebrow">Logs</span>
                <h3>{{ selectedStepEntry?.name || "All logs" }}</h3>
              </div>
              <span v-if="entry.status === 'running'" class="streaming"><i />Streaming</span>
            </header>
            <div v-if="selectedStepEntry?.error" class="step-error">
              <i class="mdi mdi-alert-circle-outline" />{{ selectedStepEntry.error.message }}
            </div>
            <div
              ref="logViewport"
              class="terminal"
              role="log"
              aria-live="polite"
              aria-relevant="additions text"
              :aria-label="`${selectedStepEntry?.name || 'All'} execution logs`"
            >
              <div v-if="!visibleLogs.length" class="terminal-empty">
                {{
                  entry.status === "running"
                    ? "Waiting for log output…"
                    : "No logs recorded for this selection."
                }}
              </div>
              <div
                v-for="(log, index) in visibleLogs"
                :key="log.id || `${log.timestamp}-${index}`"
                class="log-line"
                :class="`log-${log.level}`"
              >
                <time :datetime="new Date(log.timestamp).toISOString()">{{
                  formatLogTime(log.timestamp)
                }}</time>
                <span class="log-level">{{ log.level.toUpperCase() }}</span>
                <span v-if="log.source" class="log-source">{{ log.source }}</span>
                <pre>{{ log.message }}</pre>
              </div>
              <span v-if="entry.status === 'running'" class="cursor" aria-hidden="true" />
            </div>
          </div>
        </section>

        <section
          v-else-if="activePanel === 'artifacts'"
          class="output-panel"
          aria-label="Run artifacts"
        >
          <div v-if="!entry.artifacts?.length" class="output-empty">
            <i class="mdi mdi-package-variant-closed" /><strong>No artifacts produced</strong
            ><span>Artifacts created by this run will appear here.</span>
          </div>
          <div v-else class="artifact-list">
            <article v-for="artifact in entry.artifacts" :key="artifact.id" class="artifact-row">
              <i class="mdi mdi-package-variant" aria-hidden="true" />
              <div class="artifact-name">
                <strong>{{ artifactTitle(artifact) }}</strong
                ><small>{{ artifactDescription(artifact) }}</small>
              </div>
              <span>{{ artifactKind(artifact) }}</span>
              <span>{{ formatSize(artifact.size) }}</span>
              <span class="artifact-locations">
                <Tag v-if="'path' in artifact && artifact.path" value="Local" severity="secondary" />
                <Tag v-if="artifactCloud(artifact)" value="Cloud" severity="info" />
              </span>
              <div class="artifact-actions">
                <Button v-if="'path' in artifact && artifact.path" label="Open" icon="mdi mdi-folder-open-outline" text size="small" :aria-label="`Open ${artifactTitle(artifact)}`" @click="openArtifact(artifact.path)" />
                <Button v-if="artifactCloud(artifact)" label="Download" icon="mdi mdi-download" text size="small" :aria-label="`Download ${artifactTitle(artifact)}`" @click="downloadArtifact(artifactCloud(artifact)!.hostedArtifactId)" />
              </div>
            </article>
          </div>
        </section>

        <section v-else class="output-panel" aria-label="Run deliveries">
          <div v-if="!entry.deliveries?.length" class="output-empty">
            <i class="mdi mdi-cloud-upload-outline" /><strong>No deliveries recorded</strong
            ><span>Publishing results for this run will appear here.</span>
          </div>
          <div v-else class="delivery-list">
            <article v-for="group in deliveryGroups" :key="group.id" class="delivery-group">
              <header>
                <div class="destination-icon"><i :class="destinationIcon(group.serviceId)" /></div>
                <div>
                  <strong>{{ group.name }}</strong
                  ><small
                    >{{ group.items.length }}
                    {{ group.items.length === 1 ? "delivery" : "deliveries" }}</small
                  >
                </div>
              </header>
              <div v-for="delivery in group.items" :key="delivery.id" class="delivery-row">
                <span class="delivery-status" :class="`status-${delivery.status}`"
                  ><i
                    :class="
                      delivery.status === 'completed'
                        ? 'mdi mdi-check-circle'
                        : 'mdi mdi-close-circle'
                    "
                  />{{ delivery.status === "completed" ? "Succeeded" : "Failed" }}</span
                >
                <span>{{ delivery.slotId }}</span
                ><span>{{ formatDurationMs(delivery.duration) }}</span>
                <span v-if="delivery.error" class="delivery-error">{{ delivery.error }}</span>
              </div>
            </article>
          </div>
        </section>
      </main>
      <main v-else class="load-state">
        <Message v-if="error" severity="error" :closable="false" role="alert"
          >{{ error }} <Button label="Back to runs" text @click="backToRuns"
        /></Message>
        <div v-else class="loading-state" aria-busy="true">
          <i class="mdi mdi-loading" />Loading run…
        </div>
      </main>
    </WorkflowShell>
  </Layout>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, reactive, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import Layout from "@renderer/components/Layout.vue";
import WorkflowShell from "@renderer/components/WorkflowShell.vue";
import Button from "primevue/button";
import Tag from "primevue/tag";
import Message from "primevue/message";
import { useAPI } from "@renderer/composables/api";
import type { BuildHistoryEntry, ExecutionStep } from "@pipelab/shared";
import { loadRunEntryWithRetry } from "./run-detail-loader";
import {
  artifactDisplayName,
  artifactDisplayDescription,
  autoSelectInitialRunStep,
  createRunStepSelectionState,
  deliveryDisplayMetadata,
  isRunContextValid,
  resetRunStepSelectionState,
  workflowCancellationFeedback,
  selectRunStep,
} from "./run-detail-state";

type Panel = "logs" | "artifacts" | "deliveries";
const route = useRoute();
const router = useRouter();
const api = useAPI();
const entry = ref<BuildHistoryEntry>();
const error = ref("");
const cancelFeedback = ref("");
const stepSelection = reactive(createRunStepSelectionState());
const selectedStep = computed({
  get: () => stepSelection.selectedStepId,
  set: (stepId: string | null) => selectRunStep(stepSelection, stepId),
});
const activePanel = ref<Panel>("logs");
const cancelling = ref(false);
const logViewport = ref<HTMLElement>();
let timer: ReturnType<typeof setTimeout> | undefined;
let loadGeneration = 0;
const shortId = computed(() =>
  entry.value?.id ? entry.value.id.slice(0, 8) : String(route.params.runId).slice(0, 8),
);
const flowId = computed(() => String(route.params.flowId || entry.value?.workflowId || ""));
const projectId = computed(() => String(route.params.projectId || entry.value?.pipelineId || ""));
const playwrightVideoPath = computed(() => {
  const messages = [
    entry.value?.error?.message,
    ...(entry.value?.steps || []).map((step) => step.error?.message),
  ];
  for (const message of messages) {
    const match = message?.match(/PLAYWRIGHT_VIDEO:\s*([^\r\n]+)/i);
    if (match?.[1]) return match[1].trim();
  }
  return "";
});
const videoCopied = ref(false);
const copyVideoFeedback = ref("");
const duration = computed(() =>
  entry.value
    ? formatDurationMs(
        entry.value.duration ??
          (entry.value.status === "running"
            ? Date.now() - entry.value.startTime
            : (entry.value.endTime || Date.now()) - entry.value.startTime),
      )
    : "—",
);
const selectedStepEntry = computed(() =>
  entry.value?.steps.find((step) => step.id === selectedStep.value),
);
const allLogs = computed(() => {
  const logs = entry.value?.logs?.length
    ? entry.value.logs
    : entry.value?.steps.flatMap((step) => step.logs) || [];
  return [...logs].sort((a, b) => a.timestamp - b.timestamp);
});
const visibleLogs = computed(() =>
  selectedStep.value === null ? allLogs.value : selectedStepEntry.value?.logs || [],
);
const deliveryGroups = computed(() => {
  const groups = new Map<string, { id: string; serviceId: string; name: string; items: NonNullable<BuildHistoryEntry["deliveries"]> }>();
  for (const delivery of entry.value?.deliveries || []) {
    const metadata = deliveryDisplayMetadata(delivery);
    const group = groups.get(metadata.id) || { ...metadata, items: [] };
    group.items.push(delivery);
    groups.set(metadata.id, group);
  }
  return [...groups.values()];
});
const formatDurationMs = (milliseconds: number) => {
  const seconds = Math.max(0, Math.floor(milliseconds / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  return seconds % 60 ? `${minutes}m ${seconds % 60}s` : `${minutes}m`;
};
const formatDate = (timestamp: number) =>
  new Date(timestamp).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
const formatLogTime = (timestamp: number) =>
  new Date(timestamp).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    fractionalSecondDigits: 3,
  });
const formatSize = (bytes?: number) => {
  if (bytes == null || bytes < 0) return "—";
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let size = bytes / 1024;
  let unit = 0;
  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024;
    unit++;
  }
  return `${size.toFixed(size >= 10 ? 0 : 1)} ${units[unit]}`;
};
const artifactTitle = (artifact: NonNullable<BuildHistoryEntry["artifacts"]>[number]) =>
  artifactDisplayName(artifact);
const artifactCloud = (artifact: NonNullable<BuildHistoryEntry["artifacts"]>[number]) =>
  "cloud" in artifact ? artifact.cloud : undefined;
const artifactDescription = (artifact: NonNullable<BuildHistoryEntry["artifacts"]>[number]) =>
  artifactDisplayDescription(artifact, entry.value?.steps || []);
const artifactKind = (artifact: NonNullable<BuildHistoryEntry["artifacts"]>[number]) =>
  ("descriptor" in artifact && artifact.descriptor ? artifact.descriptor.format || artifact.descriptor.kind : artifact.type);
const openArtifact = async (path: string) => {
  const response = await api.execute("shell:openPath", { path });
  if (response.type === "error") error.value = response.ipcError;
};
const downloadArtifact = async (hostedArtifactId: string) => {
  const response = await api.execute("pipelab-cloud:artifact-download-url", { hostedArtifactId });
  if (response.type === "error") {
    error.value = response.ipcError;
    return;
  }
  const link = document.createElement("a");
  link.href = response.result.url;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  link.click();
};
const stepDuration = (step: ExecutionStep) =>
  step.duration != null
    ? formatDurationMs(step.duration)
    : step.status === "running"
      ? "Running"
      : step.status === "pending"
        ? "Pending"
        : "—";
const statusIcon = (status: string) =>
  ({
    pending: "mdi mdi-circle-outline",
    running: "mdi mdi-loading",
    completed: "mdi mdi-check-circle",
    "completed-with-errors": "mdi mdi-alert-circle",
    failed: "mdi mdi-close-circle",
    cancelled: "mdi mdi-cancel",
    skipped: "mdi mdi-skip-next-circle",
  })[status] || "mdi mdi-circle-outline";
const statusLabel = (status: string) => status.replaceAll("-", " ");
const statusSeverity = (status: string) =>
  status === "completed"
    ? "success"
    : status === "failed"
      ? "danger"
      : status === "completed-with-errors"
        ? "warn"
        : status === "running"
          ? "info"
          : "secondary";
const destinationIcon = (serviceId: string) =>
  serviceId === "steam"
    ? "mdi mdi-steam"
    : serviceId === "itch"
      ? "mdi mdi-controller-classic"
      : "mdi mdi-folder-upload-outline";
const backToRuns = () => router.push(`/workflows/${flowId.value}/${projectId.value}/runs`);
const copyVideoPath = async () => {
  if (!playwrightVideoPath.value) return;
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(playwrightVideoPath.value);
    } else {
      const input = document.createElement("textarea");
      input.value = playwrightVideoPath.value;
      input.style.position = "fixed";
      input.style.opacity = "0";
      document.body.append(input);
      input.select();
      const copied = document.execCommand("copy");
      input.remove();
      if (!copied) throw new Error("Clipboard access is unavailable");
    }
    videoCopied.value = true;
    copyVideoFeedback.value = "Video path copied to clipboard.";
    window.setTimeout(() => (videoCopied.value = false), 2000);
  } catch {
    videoCopied.value = false;
    copyVideoFeedback.value = "Could not copy automatically. Select the path above to copy it.";
  }
};
const cancel = async () => {
  cancelling.value = true;
  cancelFeedback.value = "";
  try {
    const result = await api.execute("workflow:cancel", { runId: entry.value?.id || String(route.params.runId) });
    if (result.type === "error") error.value = result.ipcError;
    else cancelFeedback.value = workflowCancellationFeedback(result);
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : String(cause);
  } finally {
    cancelling.value = false;
  }
};
const selectStep = (stepId: string | null) => selectRunStep(stepSelection, stepId);
const load = async () => {
  if (timer) clearTimeout(timer);
  const generation = ++loadGeneration;
  const runId = String(route.params.runId);
  const pipelineId = String(route.params.projectId || "");
  const workflowId = String(route.params.flowId || "");
  const isCurrentRun = () =>
    generation === loadGeneration &&
    String(route.params.runId) === runId &&
    String(route.params.projectId || "") === pipelineId &&
    String(route.params.flowId || "") === workflowId;
  try {
    const loadedEntry = await loadRunEntryWithRetry(async () => {
      const response = await api.execute("build-history:get", {
        id: runId,
        ...(pipelineId ? { pipelineId } : {}),
      });
      if (response.type === "error") throw new Error(response.ipcError);
      return response.result.entry;
    }, 4, 250, isCurrentRun);
    if (!isCurrentRun()) return;
    if (loadedEntry) {
      if (!isRunContextValid(loadedEntry, workflowId, pipelineId)) {
        entry.value = undefined;
        await router.replace(`/workflows/${workflowId}/${pipelineId}/runs`);
        return;
      }
      const wasNearBottom =
        !logViewport.value ||
        logViewport.value.scrollHeight -
          logViewport.value.scrollTop -
          logViewport.value.clientHeight <
          80;
      entry.value = loadedEntry;
      error.value = "";
      if (activePanel.value === "logs") autoSelectInitialRunStep(stepSelection, entry.value.steps);
      await nextTick();
      if (wasNearBottom && logViewport.value)
        logViewport.value.scrollTop = logViewport.value.scrollHeight;
    } else error.value = "This run could not be found.";
  } catch (cause) {
    if (!isCurrentRun()) return;
    error.value = cause instanceof Error ? cause.message : String(cause);
  }
  if (entry.value?.status === "running") timer = setTimeout(() => void load(), 1000);
};
watch(
  () => [route.params.flowId, route.params.projectId, route.params.runId],
  () => {
    entry.value = undefined;
    error.value = "";
    resetRunStepSelectionState(stepSelection);
    activePanel.value = "logs";
    void load();
  },
);
onMounted(load);
onUnmounted(() => {
  loadGeneration++;
  if (timer) clearTimeout(timer);
});
</script>

<style scoped>
.run-page {
  color: var(--text-color);
}
.run-navigation {
  margin: -8px 0 8px -8px;
}
.video-output {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 12px;
  padding: 12px;
  border: 1px solid var(--p-surface-200, var(--surface-border));
  border-radius: 8px;
  background: var(--p-surface-50, var(--surface-ground));
}
.video-output > i {
  color: var(--primary-color);
  font-size: 20px;
}
.video-path {
  display: grid;
  flex: 1;
  gap: 4px;
  min-width: 0;
}
.video-path strong {
  font-size: 0.82rem;
}
.video-path code {
  overflow-wrap: anywhere;
  color: var(--p-text-muted-color, var(--text-color-secondary));
  font-size: 0.75rem;
  user-select: all;
}
.video-path small {
  color: var(--p-text-muted-color, var(--text-color-secondary));
  font-size: 0.72rem;
}
.run-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 0 0 16px;
  border-bottom: 1px solid var(--p-surface-200, var(--surface-border));
}
.run-title-row {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  min-width: 0;
}
.status-mark {
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  flex: 0 0 auto;
  margin-top: 2px;
  border-radius: 50%;
  font-size: 22px;
}
.status-completed {
  color: var(--green-500, #22c55e);
}
.status-failed {
  color: var(--red-500, #ef4444);
}
.status-completed-with-errors {
  color: var(--orange-500, #f97316);
}
.status-running {
  color: var(--primary-color);
  animation: spin 1.3s linear infinite;
}
.status-cancelled,
.status-pending,
.status-skipped {
  color: var(--p-text-muted-color, var(--text-color-secondary));
}
.run-title {
  min-width: 0;
}
.title-line {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}
.title-line h2 {
  margin: 0;
  font-size: 1.1rem;
  font-weight: 650;
}
.run-meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 14px;
  margin-top: 5px;
  color: var(--p-text-muted-color, var(--text-color-secondary));
  font-size: 0.8rem;
}
.run-meta code {
  color: var(--text-color);
  font-family: var(--font-family-monospace, monospace);
}
.run-summary {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 9px 20px;
  min-height: 45px;
  border-bottom: 1px solid var(--p-surface-200, var(--surface-border));
  color: var(--p-text-muted-color, var(--text-color-secondary));
  font-size: 0.8rem;
}
.run-summary > span {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.run-summary i {
  font-size: 15px;
}
.live-indicator {
  color: var(--primary-color);
}
.live-indicator i,
.streaming i {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--green-500, #22c55e);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--green-500, #22c55e) 16%, transparent);
}
.detail-tabs {
  display: flex;
  gap: 4px;
  margin: 12px 0;
  border-bottom: 1px solid var(--p-surface-200, var(--surface-border));
}
.detail-tabs button {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  margin-bottom: -1px;
  padding: 9px 12px;
  border: 0;
  border-bottom: 2px solid transparent;
  background: transparent;
  color: var(--p-text-muted-color, var(--text-color-secondary));
  font: inherit;
  font-size: 0.84rem;
  cursor: pointer;
}
.detail-tabs button:hover {
  color: var(--text-color);
  background: var(--p-surface-50, var(--surface-ground));
}
.detail-tabs button:focus-visible {
  outline: 2px solid var(--primary-color);
  outline-offset: -2px;
}
.detail-tabs button.active {
  border-bottom-color: var(--primary-color);
  color: var(--text-color);
  font-weight: 600;
}
.detail-tabs button span {
  min-width: 19px;
  padding: 1px 5px;
  border-radius: 10px;
  background: var(--p-surface-100, var(--surface-ground));
  text-align: center;
  font-size: 0.7rem;
}
.execution-layout {
  display: grid;
  grid-template-columns: minmax(220px, 270px) minmax(0, 1fr);
  min-height: min(62vh, 660px);
  border: 1px solid var(--p-surface-200, var(--surface-border));
  border-radius: 8px;
  overflow: hidden;
}
.step-sidebar {
  padding: 8px;
  border-right: 1px solid var(--p-surface-200, var(--surface-border));
  background: var(--p-surface-50, var(--surface-ground));
}
.sidebar-heading {
  display: flex;
  justify-content: space-between;
  padding: 7px 8px 10px;
  color: var(--text-color);
  font-size: 0.78rem;
  font-weight: 650;
}
.sidebar-heading span {
  color: var(--p-text-muted-color, var(--text-color-secondary));
  font-weight: 500;
}
.step-item {
  display: grid;
  grid-template-columns: 20px minmax(0, 1fr) auto;
  align-items: center;
  width: 100%;
  min-height: 46px;
  gap: 8px;
  padding: 7px;
  border: 1px solid transparent;
  border-radius: 6px;
  background: transparent;
  color: var(--text-color);
  text-align: left;
  cursor: pointer;
}
.step-item:hover {
  background: var(--p-surface-100, var(--surface-ground));
}
.step-item:focus-visible {
  outline: 2px solid var(--primary-color);
  outline-offset: -2px;
}
.step-item.selected {
  border-color: color-mix(
    in srgb,
    var(--primary-color) 34%,
    var(--p-surface-200, var(--surface-border))
  );
  background: color-mix(in srgb, var(--primary-color) 9%, var(--p-surface-0, var(--surface-card)));
}
.step-item.all-logs {
  margin-bottom: 5px;
  border-bottom: 1px solid var(--p-surface-200, var(--surface-border));
  border-radius: 5px 5px 0 0;
  color: var(--p-text-muted-color, var(--text-color-secondary));
}
.step-item > i {
  text-align: center;
  font-size: 16px;
}
.step-icon {
  display: grid;
  place-items: center;
  font-size: 16px;
}
.step-label {
  display: grid;
  gap: 2px;
  min-width: 0;
}
.step-label strong {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 0.78rem;
  font-weight: 550;
}
.step-label small,
.log-count {
  color: var(--p-text-muted-color, var(--text-color-secondary));
  font-size: 0.69rem;
}
.log-count {
  font-variant-numeric: tabular-nums;
}
.step-empty {
  padding: 14px 8px;
  color: var(--p-text-muted-color, var(--text-color-secondary));
  font-size: 0.78rem;
}
.log-panel {
  display: flex;
  flex-direction: column;
  min-width: 0;
  background: var(--p-surface-0, var(--surface-card));
}
.log-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 59px;
  padding: 9px 14px;
  border-bottom: 1px solid var(--p-surface-200, var(--surface-border));
}
.log-eyebrow {
  color: var(--p-text-muted-color, var(--text-color-secondary));
  text-transform: uppercase;
  letter-spacing: 0.05em;
  font-size: 0.65rem;
  font-weight: 650;
}
.log-heading h3 {
  margin: 2px 0 0;
  font-size: 0.88rem;
  font-weight: 600;
}
.streaming {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--p-text-muted-color, var(--text-color-secondary));
  font-size: 0.73rem;
}
.terminal {
  flex: 1;
  min-height: 360px;
  max-height: 62vh;
  overflow: auto;
  padding: 13px 0;
  background: var(--p-surface-950, #111827);
  color: var(--p-surface-100, #e5e7eb);
  font-family: var(--font-family-monospace, ui-monospace, SFMono-Regular, Menlo, monospace);
  font-size: 0.78rem;
  line-height: 1.55;
  scrollbar-color: var(--p-surface-600, #4b5563) transparent;
}
.log-line {
  display: grid;
  grid-template-columns: 92px 48px minmax(50px, auto) minmax(0, 1fr);
  align-items: start;
  gap: 10px;
  padding: 2px 14px;
}
.log-line:hover {
  background: color-mix(in srgb, white 4%, transparent);
}
.log-line time {
  color: #8b98a9;
  font-size: 0.7rem;
  font-variant-numeric: tabular-nums;
}
.log-level {
  color: #9ca3af;
  font-size: 0.65rem;
}
.log-info .log-level {
  color: #60a5fa;
}
.log-warn .log-level {
  color: #fbbf24;
}
.log-error .log-level {
  color: #f87171;
}
.log-source {
  overflow: hidden;
  color: #a78bfa;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 0.72rem;
}
.log-line pre {
  min-width: 0;
  margin: 0;
  color: inherit;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  font: inherit;
}
.terminal-empty {
  padding: 14px;
  color: #9ca3af;
}
.cursor {
  display: block;
  width: 7px;
  height: 14px;
  margin: 8px 14px;
  background: #60a5fa;
  animation: blink 1.1s steps(2, start) infinite;
}
.step-error {
  display: flex;
  gap: 7px;
  padding: 9px 14px;
  background: color-mix(in srgb, var(--red-500, #ef4444) 10%, transparent);
  color: var(--red-500, #ef4444);
  font-size: 0.8rem;
}
.output-panel {
  min-height: 350px;
  border: 1px solid var(--p-surface-200, var(--surface-border));
  border-radius: 8px;
  overflow: hidden;
}
.artifact-list,
.delivery-list {
  display: grid;
}
.artifact-row {
  display: grid;
  grid-template-columns: 24px minmax(130px, 1fr) 100px 80px minmax(140px, auto) auto;
  align-items: center;
  gap: 12px;
  min-height: 58px;
  padding: 9px 14px;
  border-bottom: 1px solid var(--p-surface-200, var(--surface-border));
  font-size: 0.8rem;
}
.artifact-row > i {
  color: var(--primary-color);
  font-size: 18px;
}
.artifact-name {
  display: grid;
  gap: 3px;
  min-width: 0;
}
.artifact-name strong,
.artifact-name small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.artifact-name strong {
  font-weight: 600;
}
.artifact-name small {
  color: var(--p-text-muted-color, var(--text-color-secondary));
}
.artifact-row > span {
  color: var(--p-text-muted-color, var(--text-color-secondary));
}
.artifact-locations,
.artifact-actions {
  display: flex;
  align-items: center;
  gap: 6px;
}
.artifact-locations small {
  color: var(--p-text-muted-color, var(--text-color-secondary));
}
.delivery-group {
  border-bottom: 1px solid var(--p-surface-200, var(--surface-border));
}
.delivery-group > header {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 14px;
}
.destination-icon {
  display: grid;
  place-items: center;
  width: 30px;
  height: 30px;
  border-radius: 6px;
  background: var(--p-surface-100, var(--surface-ground));
  color: var(--primary-color);
}
.delivery-group > header > div:last-child {
  display: grid;
  gap: 2px;
}
.delivery-group > header strong {
  font-size: 0.86rem;
}
.delivery-group > header small {
  color: var(--p-text-muted-color, var(--text-color-secondary));
  font-size: 0.73rem;
}
.delivery-row {
  display: flex;
  align-items: center;
  gap: 14px;
  min-height: 42px;
  padding: 7px 14px 7px 54px;
  border-top: 1px solid var(--p-surface-100, var(--surface-border));
  font-size: 0.8rem;
}
.delivery-status {
  display: flex;
  align-items: center;
  gap: 5px;
  min-width: 85px;
}
.delivery-status.status-completed {
  color: var(--green-500, #22c55e);
}
.delivery-status.status-failed {
  color: var(--red-500, #ef4444);
}
.delivery-error {
  color: var(--red-500, #ef4444);
}
.output-empty {
  display: grid;
  justify-items: center;
  gap: 8px;
  padding: 60px 16px;
  color: var(--p-text-muted-color, var(--text-color-secondary));
  text-align: center;
}
.output-empty > i {
  color: var(--primary-color);
  font-size: 25px;
}
.output-empty strong {
  color: var(--text-color);
  font-size: 0.9rem;
}
.output-empty span {
  font-size: 0.8rem;
}
.loading-state {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 9px;
  padding: 70px;
  color: var(--p-text-muted-color, var(--text-color-secondary));
}
.loading-state i {
  animation: spin 1s linear infinite;
}
.run-error {
  margin-top: 12px;
}
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
@keyframes blink {
  to {
    visibility: hidden;
  }
}
@media (max-width: 720px) {
  .execution-layout {
    grid-template-columns: 1fr;
  }
  .step-sidebar {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 4px;
    border-right: 0;
    border-bottom: 1px solid var(--p-surface-200, var(--surface-border));
  }
  .sidebar-heading {
    grid-column: 1 / -1;
  }
  .step-item.all-logs {
    margin: 0;
    border: 1px solid transparent;
    border-radius: 6px;
  }
  .terminal {
    min-height: 300px;
    max-height: 56vh;
  }
  .log-line {
    grid-template-columns: 77px 42px minmax(0, 1fr);
    gap: 7px;
  }
  .log-source {
    display: none;
  }
  .log-line pre {
    grid-column: 1 / -1;
    padding-left: 0;
  }
  .artifact-row {
    grid-template-columns: 22px minmax(0, 1fr) 70px;
  }
  .artifact-row > span:first-of-type {
    grid-column: 2;
  }
  .artifact-row > span:nth-of-type(2) {
    grid-column: 3;
  }
  .artifact-locations,
  .artifact-actions {
    grid-column: 2 / -1;
    flex-wrap: wrap;
  }
  .delivery-row {
    flex-wrap: wrap;
    padding-left: 20px;
  }
}
@media (max-width: 450px) {
  .run-header {
    align-items: flex-start;
  }
  .run-summary {
    gap: 8px 12px;
    padding: 8px 0;
  }
  .detail-tabs button {
    gap: 4px;
    padding-inline: 8px;
    font-size: 0.78rem;
  }
  .step-sidebar {
    grid-template-columns: 1fr;
    max-height: 230px;
    overflow-y: auto;
  }
  .log-line {
    grid-template-columns: 72px minmax(0, 1fr);
  }
  .log-level {
    display: none;
  }
  .log-line pre {
    grid-column: 1 / -1;
  }
}
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
</style>
