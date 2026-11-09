<template>
  <main class="dashboard-page">
    <header class="dashboard-header">
      <h1>{{ activeProject?.name || $t("home.choose-project") }}</h1>
      <div class="dashboard-actions">
        <Button
          :label="$t('home.new-workflow')"
          icon="mdi mdi-plus"
          severity="secondary"
          outlined
          :disabled="!isBrowser && (!filesReady || !agent.isReady.value || !activeProject)"
          @click="startWorkflowCreation"
        />
        <Button
          :label="$t('home.ship')"
          icon="mdi mdi-rocket-launch-outline"
          :disabled="!workflowShortcuts.length"
          aria-haspopup="menu"
          @click="onShipClick"
        />
      </div>
    </header>

    <Message
      v-if="filesReady && appStore.runtimeStatus === 'error'"
      severity="warn"
      :closable="false"
      role="alert"
      class="dashboard-message"
    >
      {{ $t("home.runtime-unavailable", { error: appStore.runtimeError || "" }) }}
      <Button
        :label="$t('home.retry-runtime')"
        text
        size="small"
        @click="appStore.loadRuntimeInfo().catch(notifyPersistenceError)"
      />
    </Message>
    <Message
      v-if="agent.isReady.value && !filesReady && projectLoadError"
      severity="error"
      :closable="false"
      role="alert"
      class="dashboard-message"
    >
      {{ projectLoadError }}
      <Button
        :label="$t('home.retry')"
        text
        size="small"
        @click="fileStore.load(true).catch(notifyPersistenceError)"
      />
    </Message>

    <div class="overview-grid">
      <p v-if="!filesReady" class="empty-copy" role="status">
        {{
          agent.isReady.value
            ? $t("home.executions-waiting-project")
            : $t("home.project-overview-disconnected")
        }}
      </p>
      <Message
        v-else-if="!agent.isReady.value"
        severity="warn"
        :closable="false"
        role="status"
        class="dashboard-message"
      >
        {{ $t("home.executions-disconnected") }}
        <Button
          :label="$t('home.reconnect-engine')"
          text
          size="small"
          @click="agent.reconnect().catch(notifyPersistenceError)"
        />
      </Message>
      <template v-else-if="showWorkflowFallback">
        <div v-if="workflowShortcuts.length" class="workflow-cards">
          <article v-for="workflow in workflowShortcuts" :key="workflow.id" class="workflow-card">
            <RouterLink
              class="workflow-card-name"
              :to="`/workflows/${workflow.id}/${workflow.projectId}`"
              :aria-label="$t('home.open-workflow', { name: workflow.name })"
            >
              {{ workflow.name }}
            </RouterLink>
            <Button
              :label="$t('home.ship')"
              icon="mdi mdi-rocket-launch-outline"
              :aria-label="$t('home.ship-workflow-named', { name: workflow.name })"
              @click="shipWorkflow(workflow)"
            />
          </article>
        </div>
        <p v-else-if="workflowCount === 0" class="empty-copy">
          {{ $t("home.no-workflows-in-project") }}
        </p>
      </template>
      <div v-else-if="historyLoading" class="activity-state" role="status" aria-busy="true">
        {{ $t("home.loading-executions") }}
      </div>
      <div v-else-if="historyError" class="activity-state activity-error" role="alert">
        {{ $t("home.executions-unavailable") }}
        <Button :label="$t('home.retry')" text size="small" @click="loadRecentExecutions" />
      </div>
      <template v-else>
        <section
          class="latest-card"
          :class="`latest-${latestExecution.status}`"
          aria-labelledby="latest-title"
        >
          <div class="latest-main">
            <span class="execution-status" :class="`status-${latestExecution.status}`">
              {{ statusLabel(latestExecution.status) }}
            </span>
            <h2 id="latest-title">
              {{ latestExecution.workflowName || $t("home.workflow-run") }}
            </h2>
            <p class="latest-meta">
              <span v-if="latestExecution.version">v{{ latestExecution.version }}</span>
              <time :datetime="new Date(latestExecution.startTime).toISOString()">
                {{ formatExecutionDate(latestExecution.startTime) }}
              </time>
              <span v-if="latestExecution.duration">
                {{ formatDuration(latestExecution.duration) }}
              </span>
            </p>
            <p v-if="latestFailed && latestExecution.error?.message" class="latest-error">
              {{ latestExecution.error.message }}
            </p>
          </div>
          <div class="latest-actions">
            <Button
              v-if="latestFailed && latestExecution.workflowId"
              :label="$t('home.retry')"
              icon="mdi mdi-refresh"
              @click="retryLatest"
            />
            <RouterLink
              v-if="latestExecution.workflowId"
              class="manage-workflows-link"
              :to="executionPath(latestExecution)"
            >
              {{ $t("home.view-run") }}
              <i class="mdi mdi-arrow-right" aria-hidden="true" />
            </RouterLink>
          </div>
        </section>

        <section
          v-if="olderExecutions.length"
          class="overview-card recent-executions"
          aria-labelledby="recent-executions-title"
        >
          <h2 id="recent-executions-title">
            {{ $t("home.recent-executions") }}
          </h2>
          <div class="execution-list" role="list" :aria-label="$t('home.recent-executions')">
            <template v-for="entry in olderExecutions" :key="entry.id">
              <RouterLink
                v-if="entry.workflowId"
                class="execution-row"
                role="listitem"
                :to="executionPath(entry)"
                :aria-label="
                  $t('home.open-execution', {
                    workflow: entry.workflowName || $t('home.workflow-run'),
                    status: statusLabel(entry.status),
                  })
                "
              >
                <span class="execution-status" :class="`status-${entry.status}`">
                  {{ statusLabel(entry.status) }}
                </span>
                <span class="execution-name">{{
                  entry.workflowName || $t("home.workflow-run")
                }}</span>
                <time :datetime="new Date(entry.startTime).toISOString()">
                  {{ formatExecutionDate(entry.startTime) }}
                </time>
                <i class="mdi mdi-chevron-right" aria-hidden="true" />
              </RouterLink>
              <div v-else class="execution-row execution-row-static" role="listitem">
                <span class="execution-status" :class="`status-${entry.status}`">
                  {{ statusLabel(entry.status) }}
                </span>
                <span class="execution-name">{{
                  entry.workflowName || $t("home.workflow-run")
                }}</span>
                <time :datetime="new Date(entry.startTime).toISOString()">
                  {{ formatExecutionDate(entry.startTime) }}
                </time>
              </div>
            </template>
          </div>
        </section>
      </template>
    </div>
    <Menu ref="shipMenu" :model="shipMenuItems" popup />
    <ReleaseFlow
      v-if="dashboardShipWorkflow"
      :dashboard-mode="true"
      :dashboard-flow-id="dashboardShipWorkflow.id"
      :dashboard-project-id="dashboardShipWorkflow.projectId"
      @close-dashboard="dashboardShipWorkflow = undefined"
    />
  </main>
</template>

<script setup lang="ts">
import { useRouteReadiness } from "@renderer/composables/useRouteReadiness";
import { computed, ref, watch } from "vue";
import { storeToRefs } from "pinia";
import { RouterLink, useRouter } from "vue-router";
import { useI18n } from "vue-i18n";
import { useToast } from "primevue/usetoast";
import Button from "primevue/button";
import Message from "primevue/message";
import Menu from "primevue/menu";
import ReleaseFlow from "./release-flow.vue";
import type { BuildHistoryEntry } from "@pipelab/shared";
import { useAgentAvailability } from "@renderer/composables/useAgentAvailability";
import { useAPI } from "@renderer/composables/api";
import { uiEnvironment } from "@renderer/composables/ui-runtime";
import { useAppStore } from "@renderer/store/app";
import { useFiles } from "@renderer/store/files";
import { partitionWorkflowLoads } from "./workflow-load-state";

const router = useRouter();
const api = useAPI();
const toast = useToast();
const { t, locale } = useI18n();
const appStore = useAppStore();
const fileStore = useFiles();
const agent = useAgentAvailability();
const isBrowser = uiEnvironment === "browser";
const { files, selectedProjectId, error: projectLoadError } = storeToRefs(fileStore);
const filesReady = computed(() => fileStore.status === "ready");
const activeProject = computed(() =>
  files.value.projects.find((project) => project.id === selectedProjectId.value),
);
const projectWorkflows = computed(() =>
  (files.value.workflows ?? []).filter((workflow) => workflow.project === selectedProjectId.value),
);
const workflowCount = computed(() => projectWorkflows.value.length);
const workflowEntryVersion = computed(() =>
  projectWorkflows.value.map((workflow) => `${workflow.id}:${workflow.lastModified}`).join("|"),
);
const workflowShortcuts = ref<Array<{ id: string; name: string; projectId: string }>>([]);
const dashboardShipWorkflow = ref<{
  id: string;
  name: string;
  projectId: string;
}>();
const workflowShortcutsLoading = ref(false);
let workflowShortcutRequest = 0;

const recentExecutions = ref<BuildHistoryEntry[]>([]);
const historyLoading = ref(false);
const historyError = ref("");
let historyRequest = 0;

// Dashboard data is ready once the run history and workflow shortcuts finished loading
// (including empty and error outcomes). Local data does not depend on the plan.
useRouteReadiness(
  computed(
    () => !agent.isReady.value || (!historyLoading.value && !workflowShortcutsLoading.value),
  ),
);

const notifyPersistenceError = (error: unknown) =>
  toast.add({
    severity: "error",
    summary: t("base.error"),
    detail: error instanceof Error ? error.message : String(error),
    life: 5000,
  });

const loadRecentExecutions = async () => {
  const request = ++historyRequest;
  const projectId = selectedProjectId.value;
  recentExecutions.value = [];
  historyError.value = "";
  if (!projectId || !filesReady.value || !agent.isReady.value) {
    historyLoading.value = false;
    return;
  }

  historyLoading.value = true;
  try {
    const result = await api.execute("build-history:get-all", {
      query: { projectId },
    });
    if (request !== historyRequest) return;
    if (result.type === "error") throw new Error(result.ipcError);
    recentExecutions.value = result.result.entries
      .filter((entry) => entry.projectId === projectId)
      .sort((a, b) => b.startTime - a.startTime)
      .slice(0, 6);
  } catch (error) {
    if (request === historyRequest) historyError.value = String(error);
  } finally {
    if (request === historyRequest) historyLoading.value = false;
  }
};

watch([selectedProjectId, filesReady, agent.isReady], () => void loadRecentExecutions(), {
  immediate: true,
});

const showWorkflowFallback = computed(
  () => !historyLoading.value && !historyError.value && !latestExecution.value,
);
const latestExecution = computed(() => recentExecutions.value[0]);
const olderExecutions = computed(() => recentExecutions.value.slice(1));
const latestFailed = computed(
  () =>
    latestExecution.value?.status === "failed" ||
    latestExecution.value?.status === "completed-with-errors",
);
const formatDuration = (ms: number) => {
  const total = Math.round(ms / 1000);
  const minutes = Math.floor(total / 60);
  return minutes ? `${minutes}m ${total % 60}s` : `${total}s`;
};
const retryLatest = () => {
  const entry = latestExecution.value;
  if (!entry?.workflowId) return;
  shipWorkflow({
    id: entry.workflowId,
    projectId: entry.projectId,
    name: entry.workflowName ?? "",
  });
};

const shipMenu = ref<InstanceType<typeof Menu>>();
const shipMenuItems = computed(() =>
  workflowShortcuts.value.map((workflow) => ({
    label: workflow.name,
    command: () => shipWorkflow(workflow),
  })),
);
const onShipClick = (event: Event) => {
  const [only] = workflowShortcuts.value;
  if (workflowShortcuts.value.length === 1 && only) shipWorkflow(only);
  else shipMenu.value?.toggle(event);
};

const startWorkflowCreation = () => router.push({ path: "/workflows", query: { create: "new" } });
const shipWorkflow = (workflow: { id: string; name: string; projectId: string }) => {
  if (workflow.projectId !== selectedProjectId.value) return;
  if (!agent.isReady.value) {
    toast.add({
      severity: "warn",
      summary: t("home.ship-engine-required"),
      life: 5000,
    });
    return;
  }
  dashboardShipWorkflow.value = workflow;
};
watch(selectedProjectId, () => (dashboardShipWorkflow.value = undefined));
const executionPath = (entry: BuildHistoryEntry) =>
  `/workflows/${entry.workflowId}/${entry.projectId}/runs/${entry.id}`;
const statusLabel = (status: BuildHistoryEntry["status"]) => t(`home.run-status-${status}`);
const formatExecutionDate = (timestamp: number) =>
  new Intl.DateTimeFormat(locale.value, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(timestamp);

const loadWorkflowShortcuts = async () => {
  const request = ++workflowShortcutRequest;
  const projectId = selectedProjectId.value;
  if (!projectId) {
    workflowShortcuts.value = [];
    workflowShortcutsLoading.value = false;
    return;
  }
  if (!filesReady.value || !agent.isReady.value) {
    if (workflowShortcuts.value.some((workflow) => workflow.projectId !== projectId))
      workflowShortcuts.value = [];
    workflowShortcutsLoading.value = false;
    return;
  }

  const entries = projectWorkflows.value.slice(0, 12);
  if (!entries.length) {
    workflowShortcuts.value = [];
    workflowShortcutsLoading.value = false;
    return;
  }

  workflowShortcutsLoading.value = true;
  try {
    const results = await Promise.all(
      entries.map(async (workflow) => {
        try {
          return await api.execute("workflow:load", {
            workflowId: workflow.id,
            projectId: workflow.project,
          });
        } catch (error) {
          return {
            type: "error" as const,
            ipcError: error instanceof Error ? error.message : String(error),
          };
        }
      }),
    );
    if (
      request !== workflowShortcutRequest ||
      projectId !== selectedProjectId.value ||
      !filesReady.value ||
      !agent.isReady.value
    )
      return;

    const { loaded } = partitionWorkflowLoads(entries, results);
    workflowShortcuts.value = loaded.map((workflow) => ({
      id: workflow.id,
      name: workflow.content.name,
      projectId: workflow.project,
    }));
  } finally {
    if (request === workflowShortcutRequest) workflowShortcutsLoading.value = false;
  }
};

watch(
  [selectedProjectId, filesReady, agent.isReady, workflowEntryVersion],
  () => void loadWorkflowShortcuts(),
  { immediate: true },
);
</script>

<style lang="scss" scoped>
.dashboard-page {
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  gap: 28px;
  width: min(100%, 1080px);
  min-height: 100%;
  margin: 0 auto;
  padding: 36px clamp(16px, 3vw, 40px) 64px;
}

.dashboard-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
  padding-bottom: 4px;
}

.dashboard-header {
  h1 {
    margin: 0;
    min-width: 0;
    color: var(--p-text-color);
    font-size: 1.6rem;
    font-weight: 650;
    line-height: 1.2;
    letter-spacing: -0.03em;
    overflow-wrap: anywhere;
  }
}

.project-context {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0 0 8px;
  color: var(--p-text-muted-color);
  font-size: 0.75rem;
  font-weight: 600;

  span {
    color: var(--primary-color);
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }
}

.dashboard-description,
.card-description {
  margin: 8px 0 0;
  color: var(--p-text-muted-color);
  font-size: 0.875rem;
  line-height: 1.5;
}

.dashboard-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  flex-wrap: wrap;
  gap: 10px;
  flex: 0 0 auto;
}

.manage-workflows-link,
.text-link {
  min-height: 32px;
  align-self: flex-start;
  padding-inline: 0;
  border: 0;
  color: var(--primary-color);

  &:hover {
    background: transparent;
    border-color: transparent;
    text-decoration: underline;
  }
}

.dashboard-message {
  margin: -12px 0 0;
}

.overview-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 24px;
}

.overview-card {
  display: flex;
  flex-direction: column;
  gap: 14px;
  min-width: 0;
  padding: 22px;
  border: 1px solid var(--pl-border);
  border-radius: var(--pl-radius);
  background: var(--pl-card);
  box-shadow: var(--pl-shadow-xs);
}

.empty-copy,
.inline-state,
.activity-state {
  margin: 0;
  color: var(--p-text-muted-color);
  font-size: 0.875rem;
  line-height: 1.5;
}

.activity-state {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 8px;
  padding: 18px 0 4px;
}

.workflow-cards {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 14px;
}

.workflow-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 16px 16px 16px 20px;
  border: 1px solid var(--pl-border);
  border-radius: var(--pl-radius);
  background: var(--pl-card);
  box-shadow: var(--pl-shadow-xs);
}

.workflow-card-name {
  min-width: 0;
  color: var(--p-text-color);
  font-weight: 600;
  overflow-wrap: anywhere;
  text-decoration: none;

  &:hover {
    color: var(--primary-color);
  }
}

.latest-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
  padding: 28px;
  border: 1px solid var(--pl-border);
  border-radius: var(--pl-radius);
  background: var(--pl-card);
  box-shadow: var(--pl-shadow-xs);

  h2 {
    margin: 12px 0 6px;
    font-size: 1.4rem;
    letter-spacing: -0.02em;
  }
}

.latest-failed,
.latest-completed-with-errors {
  border-color: color-mix(in srgb, var(--p-red-500, #ef4444) 40%, transparent);
}

.latest-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin: 0;
  color: var(--p-text-muted-color);
  font-size: 0.85rem;
}

.latest-error {
  margin: 12px 0 0;
  color: var(--p-red-600, #dc2626);
  font-size: 0.85rem;
  overflow-wrap: anywhere;
}

.latest-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  flex: 0 0 auto;
}

.activity-error {
  color: var(--p-red-600, #dc2626);
}

.execution-list {
  display: flex;
  flex-direction: column;
  margin-top: 2px;
}

.execution-row {
  display: grid;
  grid-template-columns: minmax(104px, auto) minmax(0, 1fr) auto 16px;
  align-items: center;
  gap: 12px;
  min-height: 54px;
  border-top: 1px solid var(--p-surface-200);
  color: inherit;
  text-decoration: none;

  :root.dark & {
    border-top-color: var(--p-surface-800);
  }

  &:hover .execution-name {
    color: var(--primary-color);
  }

  &:focus-visible {
    position: relative;
    outline: 3px solid color-mix(in srgb, var(--primary-color) 55%, transparent);
    outline-offset: 2px;
  }

  time {
    color: var(--p-text-muted-color);
    font-size: 0.75rem;
    white-space: nowrap;
  }
}

.execution-row-static {
  grid-template-columns: minmax(104px, auto) minmax(0, 1fr) auto;
}

.execution-status {
  justify-self: start;
  padding: 4px 8px;
  border: 1px solid var(--p-surface-300);
  border-radius: 999px;
  color: var(--p-text-muted-color);
  font-size: 0.7rem;
  font-weight: 650;
  white-space: nowrap;
}

.status-running {
  border-color: color-mix(in srgb, var(--p-blue-500, #3b82f6) 30%, transparent);
  color: var(--p-blue-600, #2563eb);
}

.status-completed {
  border-color: color-mix(in srgb, var(--p-green-500, #22c55e) 30%, transparent);
  color: var(--p-green-600, #16a34a);
}

.status-failed,
.status-completed-with-errors {
  border-color: color-mix(in srgb, var(--p-red-500, #ef4444) 30%, transparent);
  color: var(--p-red-600, #dc2626);
}

.status-cancelled {
  border-color: var(--p-surface-400);
}

.execution-name {
  min-width: 0;
  overflow: hidden;
  font-size: 0.875rem;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
  transition: color 120ms ease;
}

.dashboard-page :deep(.p-button:focus-visible) {
  outline: 3px solid color-mix(in srgb, var(--primary-color) 55%, transparent);
  outline-offset: 2px;
}

@media (prefers-reduced-motion: reduce) {
  .manage-workflows-link,
  .text-link,
  .execution-name {
    transition: none;
  }
}

@media (max-width: 1000px) {
  .dashboard-page {
    padding-inline: 28px;
  }
  .overview-grid {
    grid-template-columns: minmax(0, 1fr);
  }
}

@media (max-width: 640px) {
  .dashboard-page {
    gap: 20px;
    padding: 24px 16px 32px;
  }
  .dashboard-header {
    align-items: flex-start;
    flex-direction: column;
    gap: 18px;
    padding-bottom: 20px;
  }
  .dashboard-actions {
    width: 100%;
    justify-content: flex-start;
  }
  .overview-card {
    padding: 18px;
  }
  .execution-row {
    grid-template-columns: auto minmax(0, 1fr) 16px;
    gap: 8px;
    padding: 9px 0;
  }
  .execution-status {
    grid-column: 1;
    grid-row: 1;
  }
  .execution-name {
    grid-column: 2;
    grid-row: 1;
  }
  .execution-row time {
    grid-column: 2;
    grid-row: 2;
  }
  .execution-row > i {
    grid-column: 3;
    grid-row: 1 / 3;
  }
  .execution-row-static {
    grid-template-columns: auto minmax(0, 1fr);
  }
}
</style>
