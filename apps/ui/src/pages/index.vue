<template>
  <main class="dashboard-page">
    <header class="dashboard-header">
      <div class="dashboard-heading">
        <p class="project-context">
          <span>{{ $t("home.project") }}</span>
          {{ activeProject?.name || $t("home.choose-project") }}
        </p>
        <h1>{{ $t("home.project-overview") }}</h1>
        <p class="dashboard-description">{{ $t("home.project-overview-description") }}</p>
      </div>
      <div class="dashboard-actions">
        <Button
          :label="$t('home.new-workflow')"
          icon="mdi mdi-plus"
          :disabled="!filesReady || !agent.isReady.value || !activeProject"
          @click="startWorkflowCreation"
        />
        <RouterLink class="manage-workflows-link" to="/workflows">
          {{ $t("home.manage-workflows") }}
          <i class="mdi mdi-arrow-right" aria-hidden="true" />
        </RouterLink>
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
      <section class="overview-card workflow-overview" aria-labelledby="workflow-overview-title">
        <div class="card-heading">
          <div>
            <p class="eyebrow">{{ $t("home.project-overview") }}</p>
            <h2 id="workflow-overview-title">{{ $t("home.workflow-overview") }}</h2>
          </div>
          <i class="mdi mdi-rocket-launch-outline card-icon" aria-hidden="true" />
        </div>
        <p v-if="activeProject?.description" class="project-description">
          {{ activeProject.description }}
        </p>
        <div v-if="filesReady" class="workflow-count">
          <strong>{{ workflowCount }}</strong>
          <span>{{
            workflowCount === 1 ? $t("home.workflow-count-one") : $t("home.workflow-count-many")
          }}</span>
        </div>
        <p v-if="!filesReady" class="empty-copy" role="status">
          {{
            agent.isReady.value
              ? $t("home.executions-waiting-project")
              : $t("home.project-overview-disconnected")
          }}
        </p>
        <p v-else-if="workflowCount === 0" class="empty-copy">
          {{ $t("home.no-workflows-in-project") }}
        </p>
        <Message
          v-if="filesReady && workflowCount > 0 && !agent.isReady.value"
          severity="warn"
          :closable="false"
          role="status"
          class="dashboard-message"
        >
          {{ $t("home.workflows-disconnected") }}
          <Button
            :label="$t('home.reconnect-engine')"
            text
            size="small"
            @click="agent.reconnect().catch(notifyPersistenceError)"
          />
        </Message>
        <div v-if="filesReady && workflowCount > 0" class="workflow-shortcuts">
          <div v-for="workflow in workflowShortcuts" :key="workflow.id" class="workflow-shortcut">
            <RouterLink
              class="workflow-shortcut-open"
              :to="`/workflows/${workflow.id}/${workflow.projectId}`"
              :aria-label="$t('home.open-workflow', { name: workflow.name })"
            >
              <span class="workflow-shortcut-name">{{ workflow.name }}</span>
              <i class="mdi mdi-arrow-top-right" aria-hidden="true" />
            </RouterLink>
            <Button
              class="workflow-shortcut-ship"
              :label="t('home.ship')"
              icon="mdi mdi-rocket-launch-outline"
              :aria-label="t('home.ship-workflow-named', { name: workflow.name })"
              @click="shipWorkflow(workflow)"
            />
          </div>
          <RouterLink class="text-link" to="/workflows">
            {{ $t("home.manage-workflows") }}
            <i class="mdi mdi-arrow-right" aria-hidden="true" />
          </RouterLink>
        </div>
        <RouterLink
          v-else-if="filesReady && workflowCount === 0"
          class="text-link"
          :to="{ path: '/workflows', query: { create: 'new' } }"
        >
          {{ $t("home.new-workflow") }}
          <i class="mdi mdi-arrow-right" aria-hidden="true" />
        </RouterLink>
      </section>

      <section class="overview-card recent-executions" aria-labelledby="recent-executions-title">
        <div class="card-heading">
          <div>
            <p class="eyebrow">{{ $t("home.execution") }}</p>
            <h2 id="recent-executions-title">{{ $t("home.recent-executions") }}</h2>
          </div>
          <i class="mdi mdi-history card-icon" aria-hidden="true" />
        </div>
        <p class="card-description">{{ $t("home.recent-executions-description") }}</p>

        <div v-if="!hasBuildHistoryBenefit" class="activity-state">
          {{ $t("home.execution-history-plan-required") }}
          <RouterLink class="text-link" to="/workflows">
            {{ $t("home.open-workflows") }}
          </RouterLink>
        </div>
        <div v-else-if="!agent.isReady.value" class="activity-state" role="status">
          {{ $t("home.executions-disconnected") }}
        </div>
        <div v-else-if="!filesReady" class="activity-state" role="status">
          {{ $t("home.executions-waiting-project") }}
        </div>
        <div v-else-if="historyLoading" class="activity-state" role="status" aria-busy="true">
          {{ $t("home.loading-executions") }}
        </div>
        <div v-else-if="historyError" class="activity-state activity-error" role="alert">
          {{ $t("home.executions-unavailable") }}
          <Button :label="$t('home.retry')" text size="small" @click="loadRecentExecutions" />
        </div>
        <div v-else-if="!recentExecutions.length" class="activity-state">
          {{ $t("home.no-recent-executions") }}
          <RouterLink class="text-link" to="/workflows">
            {{ $t("home.open-workflows") }}
          </RouterLink>
        </div>
        <div v-else class="execution-list" role="list" :aria-label="$t('home.recent-executions')">
          <template v-for="entry in recentExecutions" :key="entry.id">
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
    </div>
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
import { computed, ref, watch } from "vue";
import { storeToRefs } from "pinia";
import { RouterLink, useRouter } from "vue-router";
import { useI18n } from "vue-i18n";
import { useToast } from "primevue/usetoast";
import Button from "primevue/button";
import Message from "primevue/message";
import ReleaseFlow from "./release-flow.vue";
import type { BuildHistoryEntry } from "@pipelab/shared";
import { useAgentAvailability } from "@renderer/composables/useAgentAvailability";
import { useAPI } from "@renderer/composables/api";
import { useAppStore } from "@renderer/store/app";
import { useAuth } from "@renderer/store/auth";
import { useFiles } from "@renderer/store/files";
import { partitionWorkflowLoads } from "./workflow-load-state";

const router = useRouter();
const api = useAPI();
const toast = useToast();
const { t, locale } = useI18n();
const appStore = useAppStore();
const authStore = useAuth();
const fileStore = useFiles();
const agent = useAgentAvailability();
const { files, selectedProjectId, error: projectLoadError } = storeToRefs(fileStore);
const { hasBuildHistoryBenefit } = storeToRefs(authStore);
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
const dashboardShipWorkflow = ref<{ id: string; name: string; projectId: string }>();
let workflowShortcutRequest = 0;

const recentExecutions = ref<BuildHistoryEntry[]>([]);
const historyLoading = ref(false);
const historyError = ref("");
let historyRequest = 0;

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
  if (!projectId || !filesReady.value || !agent.isReady.value || !hasBuildHistoryBenefit.value) {
    historyLoading.value = false;
    return;
  }

  historyLoading.value = true;
  try {
    const result = await api.execute("build-history:get-all", { query: { projectId } });
    if (request !== historyRequest) return;
    if (result.type === "error") throw new Error(result.ipcError);
    recentExecutions.value = result.result.entries
      .filter((entry) => entry.projectId === projectId)
      .sort((a, b) => b.startTime - a.startTime)
      .slice(0, 4);
  } catch (error) {
    if (request === historyRequest) historyError.value = String(error);
  } finally {
    if (request === historyRequest) historyLoading.value = false;
  }
};

watch(
  [selectedProjectId, filesReady, agent.isReady, hasBuildHistoryBenefit],
  () => void loadRecentExecutions(),
  { immediate: true },
);

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
  new Intl.DateTimeFormat(locale.value, { dateStyle: "medium", timeStyle: "short" }).format(
    timestamp,
  );

const loadWorkflowShortcuts = async () => {
  const request = ++workflowShortcutRequest;
  const projectId = selectedProjectId.value;
  if (!projectId) {
    workflowShortcuts.value = [];
    return;
  }
  if (!filesReady.value || !agent.isReady.value) {
    if (workflowShortcuts.value.some((workflow) => workflow.projectId !== projectId))
      workflowShortcuts.value = [];
    return;
  }

  const entries = projectWorkflows.value.slice(0, 3);
  if (!entries.length) {
    workflowShortcuts.value = [];
    return;
  }

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
  width: min(100%, 1320px);
  min-height: 100%;
  margin: 0 auto;
  padding: 38px 44px 48px;
}

.dashboard-header {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 24px;
  padding-bottom: 26px;
  border-bottom: 1px solid var(--p-surface-200);

  :root.dark & {
    border-bottom-color: var(--p-surface-800);
  }
}

.dashboard-heading {
  min-width: 0;

  h1 {
    margin: 0;
    color: var(--p-text-color);
    font-size: 1.9rem;
    font-weight: 700;
    line-height: 1.15;
    letter-spacing: -0.04em;
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
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  min-height: 40px;
  padding: 0 12px;
  border: 1px solid var(--p-surface-300);
  border-radius: 8px;
  color: var(--p-text-color);
  font-size: 0.875rem;
  font-weight: 600;
  text-decoration: none;
  transition:
    background-color 140ms ease,
    border-color 140ms ease;

  &:hover {
    background: var(--p-surface-100);
    border-color: var(--p-surface-400);
  }

  &:focus-visible {
    outline: 3px solid color-mix(in srgb, var(--primary-color) 55%, transparent);
    outline-offset: 2px;
  }

  :root.dark & {
    border-color: var(--p-surface-700);

    &:hover {
      background: var(--p-surface-800);
    }
  }
}

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
  grid-template-columns: minmax(280px, 0.8fr) minmax(0, 1.2fr);
  align-items: stretch;
  gap: 18px;
}

.overview-card {
  display: flex;
  flex-direction: column;
  gap: 14px;
  min-width: 0;
  padding: 22px;
  border: 1px solid var(--p-surface-200);
  border-radius: 12px;
  background: var(--p-surface-0);
  box-shadow: 0 2px 8px rgb(15 23 42 / 3%);

  :root.dark & {
    border-color: var(--p-surface-800);
    background: var(--p-surface-900);
    box-shadow: 0 2px 12px rgb(0 0 0 / 12%);
  }
}

.card-heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;

  h2 {
    margin: 4px 0 0;
    font-size: 1.1rem;
    line-height: 1.3;
    letter-spacing: -0.02em;
  }
}

.eyebrow {
  margin: 0;
  color: var(--p-text-muted-color);
  font-size: 0.68rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.card-icon {
  color: var(--primary-color);
  font-size: 1.2rem;
}

.project-description {
  margin: 0;
  color: var(--p-text-muted-color);
  font-size: 0.875rem;
  line-height: 1.5;
}

.workflow-shortcuts {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding-top: 8px;
  border-top: 1px solid var(--p-surface-200);

  :root.dark & {
    border-top-color: var(--p-surface-800);
  }
}

.workflow-shortcut {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-width: 0;
  min-height: 52px;
  padding: 4px 6px 4px 10px;
  border: 1px solid var(--p-surface-200);
  border-radius: 7px;
  background: var(--p-surface-0);
  transition:
    background-color 140ms ease,
    border-color 140ms ease;

  &:hover {
    border-color: var(--p-surface-300);
    background: var(--p-surface-50);
  }

  :root.dark & {
    border-color: var(--p-surface-800);
    background: var(--p-surface-900);

    &:hover {
      background: var(--p-surface-850);
    }
  }
}

.workflow-shortcut-open {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  min-width: 0;
  min-height: 44px;
  flex: 1;
  color: var(--p-text-color);
  font-size: 0.875rem;
  font-weight: 600;
  text-decoration: none;

  &:hover {
    color: var(--primary-color);
  }

  &:focus-visible {
    outline: 3px solid color-mix(in srgb, var(--primary-color) 55%, transparent);
    outline-offset: 2px;
  }
}

.workflow-shortcut-ship {
  flex: 0 0 auto;
  min-height: 44px;
}

.workflow-shortcut-name {
  min-width: 0;
  overflow-wrap: anywhere;
}

.workflow-count {
  display: flex;
  align-items: baseline;
  gap: 8px;
  padding: 14px 0 6px;
  border-top: 1px solid var(--p-surface-200);

  :root.dark & {
    border-top-color: var(--p-surface-800);
  }

  strong {
    font-size: 2rem;
    line-height: 1;
    letter-spacing: -0.04em;
  }

  span {
    color: var(--p-text-muted-color);
    font-size: 0.875rem;
  }
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
