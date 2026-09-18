<template>
  <Layout>
    <WorkflowShell
      :flow-id="flowId"
      :project-id="projectId"
      :title="workflowName"
      subtitle="Execution history"
      active="runs"
    >
      <main class="runs-page">
        <div class="list-heading">
          <div>
            <h2>Runs</h2>
            <p>Recent executions for this workflow.</p>
          </div>
          <span v-if="!loading && !error" class="run-count"
            >{{ entries.length }} {{ entries.length === 1 ? "run" : "runs" }}</span
          >
        </div>
        <Message v-if="error" severity="error" :closable="false" role="alert">
          <div class="state-copy">
            <strong>Couldn’t load runs</strong><span>{{ error }}</span
            ><Button label="Try again" text size="small" @click="loadRuns" />
          </div>
        </Message>
        <div
          v-else-if="loading"
          class="history-skeleton"
          aria-busy="true"
          aria-label="Loading runs"
        >
          <div v-for="n in 4" :key="n" class="skeleton-row"><span /><span /><span /></div>
        </div>
        <div v-else-if="!entries.length" class="empty-state" role="status">
          <i class="mdi mdi-rocket-launch-outline" aria-hidden="true" />
          <strong>No runs yet</strong
          ><span>Ship this workflow to see its execution history here.</span>
          <Button
            label="Configure workflow"
            icon="pi pi-arrow-left"
            text
            @click="router.push(basePath)"
          />
        </div>
        <div v-else class="run-list" role="list" aria-label="Workflow runs">
          <button
            v-for="entry in entries"
            :key="entry.id"
            class="run-row"
            :class="{ 'is-running': entry.status === 'running' }"
            role="listitem"
            @click="openRun(entry)"
          >
            <span
              class="status-mark"
              :class="`status-${entry.status}`"
              :aria-label="statusLabel(entry.status)"
            >
              <i :class="statusIcon(entry.status)" aria-hidden="true" />
            </span>
            <span class="run-main">
              <strong>{{
                entry.version
                  ? `Release ${entry.version}`
                  : entry.workflowName || entry.projectName || "Workflow run"
              }}</strong>
              <small
                ><span class="run-id">#{{ shortId(entry.id) }}</span
                ><span>{{ entry.workflowName || entry.projectName }}</span></small
              >
            </span>
            <span class="run-time"
              ><strong>{{ formatDate(entry.startTime) }}</strong
              ><small>{{ formatTime(entry.startTime) }}</small></span
            >
            <span class="run-duration">{{ formatDuration(entry) }}</span>
            <span class="run-summary"
              ><strong>{{ entry.completedSteps }}/{{ entry.totalSteps }} steps</strong
              ><small
                >{{ entry.artifacts?.length || 0 }} artifacts ·
                {{ entry.deliveries?.length || 0 }} deliveries</small
              ></span
            >
            <i class="mdi mdi-chevron-right row-chevron" aria-hidden="true" />
          </button>
        </div>
      </main>
    </WorkflowShell>
  </Layout>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import Layout from "@renderer/components/Layout.vue";
import WorkflowShell from "@renderer/components/WorkflowShell.vue";
import Button from "primevue/button";
import Message from "primevue/message";
import { useAPI } from "@renderer/composables/api";
import type { BuildHistoryEntry } from "@pipelab/shared";
import { isWorkflowRouteContextValid, scheduleWorkflowRunsRefresh } from "./workflow-runs-state";

const route = useRoute();
const router = useRouter();
const api = useAPI();
const flowId = computed(() => String(route.params.flowId));
const projectId = computed(() => String(route.params.projectId));
const basePath = computed(() => `/workflows/${flowId.value}/${projectId.value}`);
const entries = ref<BuildHistoryEntry[]>([]);
const workflowName = ref("Workflow");
const loading = ref(true);
const error = ref("");
let refreshTimer: ReturnType<typeof setTimeout> | undefined;
let loadGeneration = 0;

const loadRuns = async () => {
  if (refreshTimer) clearTimeout(refreshTimer);
  const generation = ++loadGeneration;
  if (!entries.value.length) loading.value = true;
  error.value = "";
  try {
    const [history, workflow] = await Promise.all([
      api.execute("build-history:get-all", {
        query: { workflowId: flowId.value, pipelineId: projectId.value },
      }),
      api.execute("workflow:load-by-name", { name: `workflows/${flowId.value}` }),
    ]);
    if (generation !== loadGeneration) return;
    if (history.type === "error") error.value = history.ipcError;
    else entries.value = history.result.entries
      .filter((entry) => entry.workflowId === flowId.value && entry.pipelineId === projectId.value)
      .sort((a, b) => b.startTime - a.startTime);
    if (workflow.type === "success") {
      if (!isWorkflowRouteContextValid(workflow.result, flowId.value, projectId.value)) {
        entries.value = [];
        await router.replace("/dashboard");
        return;
      }
      workflowName.value = workflow.result.name || "Workflow";
    }
  } catch (cause) {
    if (generation !== loadGeneration) return;
    error.value = cause instanceof Error ? cause.message : String(cause);
  } finally {
    if (generation === loadGeneration) {
      loading.value = false;
      refreshTimer = scheduleWorkflowRunsRefresh(entries.value, () => void loadRuns());
    }
  }
};
const openRun = (entry: BuildHistoryEntry) => router.push(`${basePath.value}/runs/${entry.id}`);
const shortId = (id: string) => (id.length > 12 ? id.slice(0, 8) : id);
const formatDate = (timestamp: number) =>
  new Date(timestamp).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
const formatTime = (timestamp: number) =>
  new Date(timestamp).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
const formatDuration = (entry: BuildHistoryEntry) => {
  const seconds = Math.max(
    0,
    Math.floor(
      (entry.duration ??
        (entry.status === "running" ? Date.now() : (entry.endTime ?? Date.now())) -
          entry.startTime) / 1000,
    ),
  );
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  return seconds % 60 ? `${minutes}m ${seconds % 60}s` : `${minutes}m`;
};
const statusIcon = (status: BuildHistoryEntry["status"]) =>
  ({
    running: "mdi mdi-loading",
    completed: "mdi mdi-check-circle",
    "completed-with-errors": "mdi mdi-alert-circle",
    failed: "mdi mdi-close-circle",
    cancelled: "mdi mdi-cancel",
  })[status];
const statusLabel = (status: BuildHistoryEntry["status"]) => status.replaceAll("-", " ");
onMounted(loadRuns);
watch([flowId, projectId], () => {
  entries.value = [];
  workflowName.value = "Workflow";
  void loadRuns();
});
onUnmounted(() => {
  loadGeneration++;
  if (refreshTimer) clearTimeout(refreshTimer);
});
</script>

<style scoped>
.runs-page {
  color: var(--text-color);
}
.list-heading {
  display: flex;
  align-items: end;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 14px;
}
.list-heading h2 {
  margin: 0;
  font-size: 1.05rem;
  font-weight: 650;
}
.list-heading p {
  margin: 3px 0 0;
  color: var(--p-text-muted-color, var(--text-color-secondary));
  font-size: 0.82rem;
}
.run-count {
  color: var(--p-text-muted-color, var(--text-color-secondary));
  font-size: 0.8rem;
}
.run-list {
  border-top: 1px solid var(--p-surface-200, var(--surface-border));
}
.run-row {
  display: grid;
  width: 100%;
  grid-template-columns:
    22px minmax(190px, 1.5fr) minmax(110px, 0.9fr) 62px minmax(140px, 0.9fr)
    18px;
  align-items: center;
  gap: 14px;
  padding: 13px 10px;
  border: 0;
  border-bottom: 1px solid var(--p-surface-200, var(--surface-border));
  background: transparent;
  color: inherit;
  text-align: left;
  cursor: pointer;
  transition: background-color 0.15s;
}
.run-row:hover {
  background: var(--p-surface-50, var(--surface-ground));
}
.run-row:focus-visible {
  position: relative;
  z-index: 1;
  outline: 2px solid var(--primary-color);
  outline-offset: -2px;
  border-radius: 4px;
}
.run-row.is-running {
  background: color-mix(in srgb, var(--primary-color) 4%, transparent);
}
.run-main,
.run-time,
.run-summary {
  display: grid;
  gap: 3px;
  min-width: 0;
}
.run-main strong {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 0.9rem;
  font-weight: 600;
}
.run-main small,
.run-time small,
.run-summary small {
  display: flex;
  gap: 7px;
  min-width: 0;
  overflow: hidden;
  color: var(--p-text-muted-color, var(--text-color-secondary));
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 0.75rem;
}
.run-id {
  color: var(--primary-color);
  font-family: var(--font-family-monospace, monospace);
}
.run-time strong,
.run-summary strong {
  font-size: 0.8rem;
  font-weight: 550;
}
.run-duration {
  font-variant-numeric: tabular-nums;
  font-size: 0.8rem;
  color: var(--p-text-muted-color, var(--text-color-secondary));
}
.status-mark {
  display: grid;
  place-items: center;
  width: 20px;
  height: 20px;
  font-size: 18px;
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
.status-cancelled {
  color: var(--p-text-muted-color, var(--text-color-secondary));
}
.status-running {
  color: var(--primary-color);
  animation: spin 1.3s linear infinite;
}
.row-chevron {
  color: var(--p-text-muted-color, var(--text-color-secondary));
}
.empty-state {
  display: grid;
  justify-items: center;
  gap: 9px;
  padding: 64px 20px;
  text-align: center;
  color: var(--p-text-muted-color, var(--text-color-secondary));
}
.empty-state > i {
  font-size: 30px;
  color: var(--primary-color);
}
.empty-state strong {
  color: var(--text-color);
  font-size: 0.95rem;
}
.empty-state span {
  font-size: 0.85rem;
}
.state-copy {
  display: grid;
  gap: 4px;
}
.state-copy span {
  font-size: 0.85rem;
}
.history-skeleton {
  border-top: 1px solid var(--p-surface-200, var(--surface-border));
}
.skeleton-row {
  display: flex;
  gap: 18px;
  align-items: center;
  height: 60px;
  border-bottom: 1px solid var(--p-surface-200, var(--surface-border));
}
.skeleton-row span {
  width: 90px;
  height: 10px;
  border-radius: 8px;
  background: var(--p-surface-100, var(--surface-ground));
  animation: pulse 1.3s ease-in-out infinite;
}
.skeleton-row span:nth-child(2) {
  width: 230px;
}
.skeleton-row span:nth-child(3) {
  width: 130px;
  margin-left: auto;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
@keyframes pulse {
  50% {
    opacity: 0.45;
  }
}
@media (max-width: 760px) {
  .run-row {
    grid-template-columns: 22px minmax(0, 1fr) auto 18px;
    gap: 10px;
  }
  .run-time {
    grid-column: 2;
  }
  .run-duration {
    grid-column: 3;
    grid-row: 2;
  }
  .run-summary {
    grid-column: 2 / 4;
  }
  .row-chevron {
    grid-column: 4;
    grid-row: 1 / 4;
  }
  .run-time strong,
  .run-time small {
    display: inline;
  }
  .run-time {
    display: block;
  }
  .run-time small {
    margin-left: 6px;
  }
  .run-summary {
    display: block;
  }
  .run-summary strong {
    margin-right: 8px;
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
