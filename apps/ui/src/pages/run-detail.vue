<template>
  <WorkflowShell
    :flow-id="flowId"
    :project-id="projectId"
    :title="entry?.workflowName || entry?.projectName || 'Workflow'"
    :subtitle="entry?.version ? `Release ${entry.version}` : `Run #${shortId}`"
    active="runs"
  >
    <main v-if="entry" class="run-page">
      <Message v-if="error" severity="error" :closable="false" role="alert" class="run-error">{{
        error
      }}</Message>
      <Message v-if="cancelFeedback" severity="info" :closable="false" class="run-error">{{
        cancelFeedback
      }}</Message>
      <header class="run-header">
        <div class="run-title-row">
          <div class="run-title">
            <div class="title-line">
              <Tag :value="statusLabel(entry.status)" :severity="statusSeverity(entry.status)" />
              <span v-if="entry.status === 'running'" class="live-indicator"><i />Live</span>
            </div>
            <div class="run-meta">
              <span>{{ formatDate(entry.startTime) }}</span
              ><span>{{ duration }}</span
              ><code>#{{ shortId }}</code>
            </div>
          </div>
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
        <Button
          v-if="playwrightVideoPath"
          :label="videoCopied ? 'Copied' : 'Copy video path'"
          :icon="videoCopied ? 'pi pi-check' : 'mdi mdi-video-outline'"
          text
          size="small"
          :title="playwrightVideoPath"
          @click="copyVideoPath"
        />
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
      <section
        v-for="diagnostic in failureDiagnostics"
        :key="diagnostic.id"
        class="failure-diagnostic"
        aria-label="Failure diagnosis"
      >
        <i class="mdi mdi-alert-circle-outline failure-icon" aria-hidden="true" />
        <div class="failure-body">
          <p>
            <strong>{{ diagnosticTitle(diagnostic) }}</strong> · {{ diagnostic.summary }}
            {{ diagnostic.nextAction }}
          </p>
          <p v-if="diagnostic.destination" class="failure-context">
            {{ diagnostic.destination
            }}<template v-if="diagnostic.slotId"> · {{ diagnostic.slotId }}</template>
          </p>
          <details v-if="diagnostic.rawMessage" class="failure-raw">
            <summary>Technical details</summary>
            <code v-if="diagnostic.errorCode">{{ diagnostic.errorCode }}</code>
            <pre>{{ diagnostic.rawMessage }}</pre>
            <pre v-if="diagnostic.rawStack">{{ diagnostic.rawStack }}</pre>
          </details>
        </div>
        <Button
          :label="diagnostic.stepId ? 'View logs' : 'View run logs'"
          icon="mdi mdi-console-line"
          text
          size="small"
          @click="viewFailureLogs(diagnostic)"
        />
      </section>

      <section v-if="activePanel === 'logs'" class="execution-layout" aria-label="Execution logs">
        <aside class="step-sidebar" aria-label="Execution steps">
          <div class="sidebar-heading">
            Steps
          </div>
          <button
            class="step-item all-logs"
            :class="{ selected: selectedStep === null }"
            :aria-pressed="selectedStep === null"
            @click="selectStep(null)"
          >
            <i class="mdi mdi-text-box-multiple-outline" aria-hidden="true" /><span>All logs</span>
          </button>
          <div v-if="!entry.steps.length" class="step-empty">Waiting for steps…</div>
          <div v-for="(step, index) in entry.steps" :key="step.id" class="step-group">
            <button
              class="step-item"
              :class="[{ selected: selectedStep === step.id }, `step-${step.status}`]"
              :aria-pressed="selectedStep === step.id"
              @click="onStepClick(step.id)"
            >
              <span class="step-icon" :class="`status-${step.status}`"
                ><i :class="statusIcon(step.status)" aria-hidden="true"
              /></span>
              <span class="step-label"
                ><strong :title="step.id"
                  ><img
                    v-if="providerIconImage(stepIcon(step))"
                    class="step-provider-icon"
                    :src="providerIconImage(stepIcon(step))"
                    alt=""
                  /><i
                    v-else-if="stepIcon(step)"
                    class="step-provider-icon"
                    :class="providerIconClass(stepIcon(step))"
                    aria-hidden="true"
                  />{{ stepTitle(step) }}</strong
                ><small v-if="skipReason(step)">{{ skipReason(step) }}</small
                ><small v-else-if="stepDuration(step)">{{ stepDuration(step) }}</small></span
              >
              <i
                v-if="step.phases?.length"
                class="mdi step-chevron"
                :class="phasesOpen(step) ? 'mdi-chevron-up' : 'mdi-chevron-down'"
                aria-hidden="true"
              />
              <span class="sr-only">Step {{ index + 1 }}, {{ statusLabel(step.status) }}</span>
            </button>
            <ol
              v-if="step.phases?.length && phasesOpen(step)"
              class="phase-checklist"
              :aria-label="`${stepTitle(step)} phases`"
            >
              <li v-for="phase in step.phases" :key="phase.id" :class="`phase-${phase.status}`">
                <span class="phase-status" :aria-label="phaseStatusLabel(phase.status)">
                  <i :class="statusIcon(phase.status)" aria-hidden="true" />
                </span>
                <span class="phase-detail">
                  <strong>{{ phase.title }}</strong>
                  <small v-if="phase.duration !== undefined">{{
                    formatDurationMs(phase.duration)
                  }}</small>
                  <small v-if="phase.message" class="phase-message">{{ phase.message }}</small>
                  <small v-if="phase.error" class="phase-message phase-error">
                    {{ phase.error.message }}
                  </small>
                  <small
                    v-for="(warning, warningIndex) in phase.warnings"
                    :key="`${phase.id}-warning-${warningIndex}`"
                    class="phase-message phase-warning"
                  >
                    {{ warning }}
                  </small>
                </span>
              </li>
            </ol>
            <small
              v-for="(diagnostic, diagnosticIndex) in step.diagnostics"
              :key="`${step.id}-diagnostic-${diagnosticIndex}`"
              class="phase-message phase-warning step-diagnostic"
            >
              {{ diagnostic }}
            </small>
          </div>
        </aside>
        <div class="log-panel">
          <header class="log-heading">
            <div>
              <h3>{{ selectedStepEntry ? stepTitle(selectedStepEntry) : "All logs" }}</h3>
            </div>
            <span v-if="entry.status === 'running'" class="streaming"><i />Streaming</span>
          </header>
          <div v-if="selectedStepEntry?.error && !failureDiagnostics.length" class="step-error">
            <i class="mdi mdi-alert-circle-outline" />{{ selectedStepEntry.error.message }}
          </div>
          <div
            ref="logViewport"
            class="terminal"
            @scroll.passive="onTerminalScroll"
            role="log"
            aria-live="polite"
            aria-relevant="additions text"
            :aria-label="`${selectedStepEntry ? stepTitle(selectedStepEntry) : 'All'} execution logs`"
          >
            <div v-if="!visibleLogs.length" class="terminal-empty">
              {{
                entry.status === "running"
                  ? "Waiting for log output…"
                  : (selectedStepEntry && skipReason(selectedStepEntry)) ||
                    "No logs recorded for this selection."
              }}
            </div>
            <div
              v-for="(log, index) in visibleLogs"
              :key="log.id || `${log.timestamp}-${index}`"
              class="log-line"
              :class="[`log-${log.level}`, { 'no-source': selectedStep !== null }]"
            >
              <time :datetime="new Date(log.timestamp).toISOString()">{{
                formatLogTime(log.timestamp)
              }}</time>
              <span class="log-level">{{ log.level.toUpperCase() }}</span>
              <span v-if="log.source && selectedStep === null" class="log-source">{{ log.source }}</span>
              <pre>{{ log.message }}</pre>
            </div>
            <span v-if="entry.status === 'running'" class="cursor" aria-hidden="true" />
          </div>
          <Button
            v-if="!followTail && visibleLogs.length"
            class="jump-latest"
            label="Latest"
            icon="mdi mdi-arrow-down"
            size="small"
            rounded
            @click="jumpToLatest"
          />
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
            <span v-if="artifact.size !== undefined && artifact.size > 0">
              {{ formatSize(artifact.size) }}
            </span>
            <span class="artifact-locations">
              <Tag v-if="'path' in artifact && artifact.path" value="Local" severity="secondary" />
              <Tag v-if="artifactCloud(artifact)" value="Cloud" severity="info" />
            </span>
            <div class="artifact-actions">
              <Button
                v-if="'path' in artifact && artifact.path"
                label="Open"
                icon="mdi mdi-folder-open-outline"
                text
                size="small"
                :aria-label="`Open ${artifactTitle(artifact)}`"
                :data-artifact-path="artifact.path"
                @click="openArtifact(artifact.path)"
              />
              <Button
                v-if="artifactCloud(artifact)"
                label="Download"
                icon="mdi mdi-download"
                text
                size="small"
                :aria-label="`Download ${artifactTitle(artifact)}`"
                @click="downloadArtifact(artifactCloud(artifact)!.hostedArtifactId)"
              />
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
        <template v-if="agent.isReady.value"><i class="mdi mdi-loading" />Loading run…</template>
        <span v-else role="status"
          >Run details are unavailable while the engine is disconnected.</span
        >
      </div>
    </main>
  </WorkflowShell>
</template>

<script setup lang="ts">
import { useRouteReadiness } from "@renderer/composables/useRouteReadiness";
import { computed, nextTick, onUnmounted, reactive, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import WorkflowShell from "@renderer/components/WorkflowShell.vue";
import Button from "primevue/button";
import Tag from "primevue/tag";
import Message from "primevue/message";
import { useAPI } from "@renderer/composables/api";
import type { BuildHistoryEntry, ExecutionStep } from "@pipelab/shared";
import { loadRunEntryWithRetry } from "./run-detail-loader";
import { useAgentAvailability } from "@renderer/composables/useAgentAvailability";
import {
  artifactDisplayName,
  artifactDisplayDescription,
  autoSelectInitialRunStep,
  buildRunFailureDiagnostics,
  createRunStepSelectionState,
  deliveryDisplayMetadata,
  isRunContextValid,
  resetRunStepSelectionState,
  runFailureArtifactSummary,
  reconcileRunEntry,
  workflowCancellationFeedback,
  selectRunStep,
  applyWorkflowEventToRunEntry,
  type RunFailureDiagnostic,
} from "./run-detail-state";
import { subscribeToRunEvents } from "./run-events";
import { runStepLabel } from "../utils/run-step-label";
import { useAppStore } from "../store/app";
import {
  destinationIcon as providerDestinationIcon,
  providerIconClass,
  providerIconImage,
  providerMetadataIcon,
} from "../utils/provider-icons";

type Panel = "logs" | "artifacts" | "deliveries";
const route = useRoute();
const router = useRouter();
const api = useAPI();
const agent = useAgentAvailability();
const appStore = useAppStore();
// Destination steps are named and iconed like the destination cards in the editor.
const stepDestination = (step: ExecutionStep) =>
  step.destinationId
    ? appStore.releaseCatalog.destinations.find((item) => item.id === step.destinationId)
    : undefined;
const stepTitle = (step: ExecutionStep): string => {
  const definition = stepDestination(step);
  if (!definition) return runStepLabel(step);
  const base = step.destinationName ? `${definition.label} — ${step.destinationName}` : definition.label;
  const siblings = entry.value?.steps.filter((item) => item.destinationId === step.destinationId) ?? [];
  return siblings.length > 1 ? `${base} · ${siblings.findIndex((item) => item.id === step.id) + 1}` : base;
};
const stepIcon = (step: ExecutionStep) => {
  const definition = stepDestination(step);
  if (definition) return providerDestinationIcon(appStore.providerDefinitions, definition.id, definition.icon);
  return step.uses ? providerMetadataIcon(appStore.providerDefinitions, step.uses) : undefined;
};
const entry = ref<BuildHistoryEntry>();
const error = ref("");
useRouteReadiness(computed(() => !agent.isReady.value || !!entry.value || !!error.value));
const cancelFeedback = ref("");
const stepSelection = reactive(createRunStepSelectionState());
const selectedStep = computed({
  get: () => stepSelection.selectedStepId,
  set: (stepId: string | null) => selectRunStep(stepSelection, stepId),
});
const activePanel = ref<Panel>("logs");
const failureDiagnostics = computed(() =>
  entry.value ? buildRunFailureDiagnostics(entry.value) : [],
);
const diagnosticTitle = (diagnostic: { stepId?: string; title: string }) => {
  const step = entry.value?.steps.find((candidate) => candidate.id === diagnostic.stepId);
  return step ? `${stepTitle(step)} failed` : diagnostic.title;
};
// Why a step did not run: the step whose failure (or skip) it was waiting on.
const skipReason = (step: { status: string; blockedBy?: string[] }) => {
  if (step.status !== "skipped" || !step.blockedBy?.length) return "";
  const blocker = entry.value?.steps.find((candidate) => candidate.id === step.blockedBy![0]);
  return blocker ? `Skipped: ${stepTitle(blocker)} ${blocker.status === "skipped" ? "was skipped" : "failed"}` : "Skipped";
};
const expandedSteps = reactive(new Set<string>());
const phasesOpen = (step: { id: string; status: string }) =>
  expandedSteps.has(step.id) || step.status === "running" || step.status === "failed";
const onStepClick = (stepId: string) => {
  selectStep(stepId);
  if (expandedSteps.has(stepId)) expandedSteps.delete(stepId);
  else expandedSteps.add(stepId);
};
const cancelling = ref(false);
const logViewport = ref<HTMLElement>();
let loadGeneration = 0;
let stopRunEvents: (() => void) | undefined;
let historyRefreshTimer: ReturnType<typeof setTimeout> | undefined;
const shortId = computed(() =>
  entry.value?.id ? entry.value.id.slice(0, 8) : String(route.params.runId).slice(0, 8),
);
const flowId = computed(() => String(route.params.flowId || entry.value?.workflowId || ""));
const projectId = computed(() => String(route.params.projectId || entry.value?.projectId || ""));
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
// Follow new output while the reader is at the bottom; stop as soon as they
// scroll up, and resume when they return to the bottom or press "Latest".
const followTail = ref(true);
const scrollToLatest = () => {
  if (logViewport.value) logViewport.value.scrollTop = logViewport.value.scrollHeight;
};
const onTerminalScroll = () => {
  const el = logViewport.value;
  if (!el) return;
  followTail.value = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
};
const jumpToLatest = () => {
  followTail.value = true;
  scrollToLatest();
};
watch(
  () => visibleLogs.value.length,
  () => {
    if (followTail.value) scrollToLatest();
  },
  { flush: "post" },
);
watch(
  [selectedStep, activePanel],
  () => {
    followTail.value = true;
    scrollToLatest();
  },
  { flush: "post" },
);
const deliveryGroups = computed(() => {
  const groups = new Map<
    string,
    {
      id: string;
      serviceId: string;
      name: string;
      items: NonNullable<BuildHistoryEntry["deliveries"]>;
    }
  >();
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
  "descriptor" in artifact && artifact.descriptor
    ? artifact.descriptor.format || artifact.descriptor.kind
    : artifact.type;
const openArtifact = async (path: string) => {
  try {
    const response = await api.openPath(path);
    if (response.type === "error") error.value = response.ipcError;
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : String(cause);
  }
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
    ? step.duration >= 1000
      ? formatDurationMs(step.duration)
      : ""
    : step.status === "running"
      ? "Running"
      : "";
const phaseStatusLabel = (status: string) =>
  ({
    pending: "Pending",
    running: "Running",
    completed: "Completed",
    skipped: "Skipped",
    failed: "Failed",
    "not-reached": "Not reached",
    "not-reported": "Not reported",
  })[status] || status;
const statusIcon = (status: string) =>
  ({
    pending: "mdi mdi-circle-outline",
    running: "mdi mdi-loading",
    completed: "mdi mdi-check-circle",
    "completed-with-errors": "mdi mdi-alert-circle",
    failed: "mdi mdi-close-circle",
    cancelled: "mdi mdi-cancel",
    skipped: "mdi mdi-skip-next-circle",
    "not-reached": "mdi mdi-arrow-down-circle-outline",
    "not-reported": "mdi mdi-help-circle-outline",
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
    const result = await api.execute("workflow:cancel", {
      runId: entry.value?.id || String(route.params.runId),
    });
    if (result.type === "error") error.value = result.ipcError;
    else cancelFeedback.value = workflowCancellationFeedback(result);
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : String(cause);
  } finally {
    cancelling.value = false;
  }
};
const selectStep = (stepId: string | null) => selectRunStep(stepSelection, stepId);
const viewFailureLogs = (diagnostic: RunFailureDiagnostic) => {
  selectStep(diagnostic.stepId || null);
  activePanel.value = "logs";
};
const stopHistoryRefresh = () => {
  if (historyRefreshTimer) clearTimeout(historyRefreshTimer);
  historyRefreshTimer = undefined;
};
watch(
  () => entry.value?.status,
  (status) => {
    if (status && status !== "running") stopHistoryRefresh();
  },
);
const load = async () => {
  if (!agent.isReady.value) return;
  const generation = ++loadGeneration;
  const runId = String(route.params.runId);
  const projectId = String(route.params.projectId || "");
  const workflowId = String(route.params.flowId || "");
  const isCurrentRun = () =>
    generation === loadGeneration &&
    String(route.params.runId) === runId &&
    String(route.params.projectId || "") === projectId &&
    String(route.params.flowId || "") === workflowId;
  stopHistoryRefresh();
  const refreshHistory = async () => {
    try {
      const response = await api.execute("build-history:get", {
        id: runId,
        ...(projectId ? { projectId } : {}),
      });
      if (!isCurrentRun() || !entry.value) return;
      if (response.type === "success" && response.result.entry) {
        entry.value = reconcileRunEntry(entry.value, response.result.entry);
      }
    } catch {
      // Keep the last visible state and retry while this run remains active.
    }
    if (isCurrentRun() && entry.value?.status === "running") {
      historyRefreshTimer = setTimeout(() => void refreshHistory(), 1000);
    }
  };
  try {
    const loadedEntry = await loadRunEntryWithRetry(
      async () => {
        const response = await api.execute("build-history:get", {
          id: runId,
          ...(projectId ? { projectId } : {}),
        });
        if (response.type === "error") throw new Error(response.ipcError);
        return response.result.entry;
      },
      4,
      250,
      isCurrentRun,
    );
    if (!isCurrentRun()) return;
    if (loadedEntry) {
      if (!isRunContextValid(loadedEntry, workflowId, projectId)) {
        entry.value = undefined;
        await router.replace(`/workflows/${workflowId}/${projectId}/runs`);
        return;
      }
      entry.value = loadedEntry;
      error.value = "";
      stopRunEvents?.();
      stopRunEvents = subscribeToRunEvents(runId, (event) => {
        if (entry.value) applyWorkflowEventToRunEntry(entry.value, event);
      });
      if (entry.value.status === "running") {
        historyRefreshTimer = setTimeout(() => void refreshHistory(), 1000);
      }
      if (activePanel.value === "logs") autoSelectInitialRunStep(stepSelection, entry.value.steps);
      await nextTick();
      if (followTail.value) scrollToLatest();
    } else error.value = "This run could not be found.";
  } catch (cause) {
    if (!isCurrentRun()) return;
    error.value = cause instanceof Error ? cause.message : String(cause);
  }
};
watch(
  () => [route.params.flowId, route.params.projectId, route.params.runId],
  () => {
    stopHistoryRefresh();
    stopRunEvents?.();
    stopRunEvents = undefined;
    entry.value = undefined;
    error.value = "";
    resetRunStepSelectionState(stepSelection);
    activePanel.value = "logs";
    if (agent.isReady.value) void load();
  },
);
watch(
  agent.isReady,
  (ready) => {
    if (ready) void load();
    else {
      loadGeneration++;
      stopHistoryRefresh();
      stopRunEvents?.();
      stopRunEvents = undefined;
    }
  },
  { immediate: true },
);
onUnmounted(() => {
  loadGeneration++;
  stopHistoryRefresh();
  stopRunEvents?.();
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
.step-group + .step-group {
  margin-top: 3px;
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
.step-provider-icon {
  width: 14px;
  height: 14px;
  margin-right: 6px;
  font-size: 14px;
  vertical-align: -2px;
  object-fit: contain;
}
.step-chevron {
  grid-column: 3;
  color: var(--p-text-muted-color, var(--text-color-secondary));
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
.phase-checklist {
  display: grid;
  gap: 4px;
  margin: 0 0 9px 14px;
  padding: 0 0 0 10px;
  border-left: 1px solid var(--p-surface-300, var(--surface-border));
  list-style: none;
}
.phase-checklist li {
  display: grid;
  grid-template-columns: 16px minmax(0, 1fr);
  gap: 6px;
  padding: 4px 3px;
  color: var(--p-text-muted-color, var(--text-color-secondary));
  font-size: 0.68rem;
}
.phase-status {
  padding-top: 1px;
  text-align: center;
}
.phase-detail {
  display: grid;
  gap: 2px;
  min-width: 0;
}
.phase-detail strong {
  color: var(--text-color);
  font-size: 0.68rem;
  font-weight: 550;
}
.phase-detail small {
  font-size: 0.63rem;
}
.phase-message {
  overflow-wrap: anywhere;
  color: var(--p-text-muted-color, var(--text-color-secondary));
}
.phase-error {
  color: var(--p-red-500, #ef4444) !important;
}
.phase-warning {
  color: var(--p-orange-500, #f97316) !important;
}
.step-diagnostic {
  display: block;
  margin: 0 8px 7px 34px;
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
.failure-diagnostic {
  margin-top: 14px;
  padding: 16px 18px;
  border: 1px solid color-mix(in srgb, var(--red-500, #ef4444) 35%, transparent);
  border-radius: 10px;
  background: color-mix(in srgb, var(--red-500, #ef4444) 5%, var(--surface-card, #fff));
}
.failure-diagnostic-heading,
.failure-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}
.failure-diagnostic-heading > i {
  color: var(--red-500, #ef4444);
  font-size: 1.25rem;
}
.failure-diagnostic-heading span {
  color: var(--red-500, #ef4444);
  font-size: 0.7rem;
  font-weight: 700;
  text-transform: uppercase;
}
.failure-diagnostic h3,
.failure-diagnostic p {
  margin: 3px 0 0;
}
.failure-diagnostic h3 {
  font-size: 0.95rem;
}
.failure-context {
  color: var(--text-color-secondary);
  font-size: 0.8rem;
}
.failure-next {
  font-size: 0.85rem;
}
.failure-actions {
  flex-wrap: wrap;
  margin-top: 8px;
}
.failure-raw {
  font-size: 0.78rem;
}
.failure-raw summary {
  cursor: pointer;
}
.failure-raw code,
.failure-raw pre {
  display: block;
  margin: 8px 0 0;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.failure-raw code {
  color: var(--text-color-secondary);
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

/* ── Refined run view ───────────────────────────────────────────── */
.run-header {
  padding-bottom: 12px;
  border-bottom: 0;
}
.run-meta {
  color: var(--p-text-muted-color, var(--text-color-secondary));
  font-size: 0.8rem;
}
.detail-tabs {
  display: inline-flex;
  gap: 2px;
  margin: 4px 0 14px;
  padding: 3px;
  border: 0;
  border-radius: 10px;
  background: var(--p-surface-100, var(--surface-ground));
}
.detail-tabs button {
  margin: 0;
  padding: 6px 14px;
  border: 0;
  border-radius: 8px;
}
.detail-tabs button:hover {
  background: transparent;
  color: var(--text-color);
}
.detail-tabs button.active {
  background: var(--p-surface-0, var(--surface-card));
  box-shadow: 0 1px 2px rgb(15 23 42 / 0.08);
}
.detail-tabs button span {
  background: transparent;
  padding: 0;
  min-width: 0;
  color: var(--p-text-muted-color, var(--text-color-secondary));
}
.execution-layout {
  grid-template-columns: minmax(220px, 260px) minmax(0, 1fr);
  border-radius: 14px;
  border-color: var(--p-surface-200, var(--surface-border));
  box-shadow: 0 1px 3px rgb(15 23 42 / 0.05);
}
.step-sidebar {
  padding: 10px;
  background: var(--p-surface-0, var(--surface-card));
  overflow-y: auto;
  max-height: min(70vh, 720px);
}
.sidebar-heading {
  padding: 4px 8px 8px;
  color: var(--p-text-muted-color, var(--text-color-secondary));
  text-transform: uppercase;
  letter-spacing: 0.06em;
  font-size: 0.66rem;
}
.step-item {
  min-height: 38px;
  padding: 6px 8px;
  border: 0;
  border-radius: 8px;
}
.step-item.selected {
  background: color-mix(in srgb, var(--primary-color) 10%, transparent);
  box-shadow: inset 2px 0 0 var(--primary-color);
}
.step-item.all-logs {
  margin-bottom: 6px;
  border-bottom: 0;
  border-radius: 8px;
  grid-template-columns: 20px minmax(0, 1fr);
  font-size: 0.78rem;
}
.step-item {
  grid-template-columns: 20px minmax(0, 1fr) auto;
}
.step-label strong {
  white-space: normal;
  line-height: 1.25;
}
.phase-checklist {
  margin: 2px 0 8px 18px;
}
.log-heading {
  min-height: 48px;
  background: var(--p-surface-0, var(--surface-card));
}
.terminal {
  background: #0b1220;
  max-height: min(70vh, 720px);
}

.run-header {
  padding: 0;
}
.run-title,
.title-line {
  display: flex;
  align-items: center;
  gap: 12px;
}
.run-meta {
  display: flex;
  align-items: center;
  gap: 12px;
}
.failure-diagnostic {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  margin-top: 10px;
  padding: 10px 14px;
  border-radius: 10px;
  font-size: 0.85rem;
}
.failure-icon {
  margin-top: 1px;
  color: var(--red-500, #ef4444);
  font-size: 1.1rem;
}
.failure-body {
  flex: 1;
  min-width: 0;
}
.failure-diagnostic p {
  margin: 0;
}
.failure-context {
  margin-top: 2px;
}
.failure-raw {
  margin-top: 4px;
}
.video-output {
  margin-top: 8px;
  padding: 6px 12px;
  gap: 10px;
}
.video-path {
  display: flex;
  align-items: center;
  gap: 10px;
}
.video-path strong {
  white-space: nowrap;
}
.video-path code {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.run-header {
  display: flex;
  align-items: center;
  gap: 16px;
  flex-wrap: wrap;
}
.run-title-row {
  flex: 1;
  min-width: 0;
}
.detail-tabs {
  margin: 0;
}
.run-page {
  display: flex;
  flex-direction: column;
  gap: 10px;
  height: calc(100vh - 225px);
  min-height: 480px;
}
.run-page > .execution-layout,
.run-page > .output-panel {
  flex: 1;
  min-height: 0;
}
.execution-layout {
  overflow: hidden;
}
.step-sidebar,
.terminal {
  max-height: none;
}
.log-panel {
  display: flex;
  flex-direction: column;
  min-height: 0;
  position: relative;
}
.jump-latest {
  position: absolute;
  right: 22px;
  bottom: 16px;
  box-shadow: 0 4px 12px rgb(0 0 0 / 0.3);
}
.terminal {
  flex: 1;
  min-height: 0;
  overflow: auto;
}
.output-panel {
  overflow: auto;
}
.failure-diagnostic {
  margin-top: 0;
}
.log-line {
  grid-template-columns: 92px 48px minmax(0, 220px) minmax(0, 1fr);
}
.log-line.no-source {
  grid-template-columns: 92px 48px minmax(0, 1fr);
}
.log-source {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
