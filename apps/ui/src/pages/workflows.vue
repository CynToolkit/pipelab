<template>
  <div class="index">
    <main class="workspace-page">
      <header class="workspace-header">
        <div class="workspace-heading">
          <p v-if="activeProject" class="workspace-project-context">
            <span>{{ $t("home.project") }}</span
            >{{ activeProject.name }}
          </p>
          <h1>{{ $t("home.workflows") }}</h1>
          <p class="workspace-description">{{ $t("home.workflows-description") }}</p>
        </div>
      </header>

      <Message
        v-if="filesReady && appStore.runtimeStatus === 'error'"
        severity="warn"
        :closable="false"
        role="alert"
        class="workspace-message"
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
        class="workspace-message"
      >
        {{ projectLoadError }}
        <Button
          :label="$t('home.retry')"
          text
          size="small"
          @click="reloadFiles(true).catch(notifyPersistenceError)"
        />
      </Message>

      <section class="workflows-area" aria-labelledby="workflow-list-title">
        <div class="workflows-toolbar">
          <div class="section-heading">
            <h2 id="workflow-list-title">{{ $t("home.your-workflows") }}</h2>
          </div>
          <div class="header-right">
            <IconField class="search-field">
              <InputIcon class="pi pi-search" />
              <InputText
                v-model="searchQuery"
                :placeholder="$t('home.search-workflows')"
                :aria-label="$t('home.search-workflows')"
                class="search-input"
                size="small"
              />
            </IconField>
            <div class="action-buttons">
              <Button
                :label="$t('home.new-workflow')"
                icon="mdi mdi-rocket-launch-outline"
                :disabled="!filesReady || !agent.isReady.value || !activeProjectId"
                @click="openWorkflowWizard"
              />
              <Button
                severity="secondary"
                variant="outlined"
                :disabled="!filesReady || !agent.isReady.value"
                @click="toggleImportMenu"
              >
                <i class="mdi mdi-folder-open-outline mr-2" aria-hidden="true" />
                {{ $t("home.import") }}
                <i class="mdi mdi-chevron-down ml-2" aria-hidden="true" />
              </Button>
            </div>
          </div>
        </div>

        <!-- Loading State -->
        <div v-if="!filesReady && !agent.isReady.value" class="inline-state" role="status">
          {{ $t("home.workflows-disconnected") }}
        </div>
        <div v-else-if="!filesReady || isLoading" class="loading-state" aria-busy="true">
          <span class="visually-hidden" role="status">{{ $t("home.loading-workflows") }}</span>
          <div v-for="n in 3" :key="n" class="skeleton-row" aria-hidden="true">
            <Skeleton shape="circle" size="32px" class="mr-3" />
            <div class="flex-grow-1 mr-4">
              <Skeleton width="40%" class="mb-2" />
              <Skeleton width="60%" />
            </div>
            <Skeleton width="80px" class="mr-4" />
            <Skeleton shape="circle" size="32px" />
          </div>
        </div>

        <!-- Empty State (No Workflows) -->
        <div v-else-if="dashboardState === 'empty'" class="no-projects">
          <i class="mdi mdi-folder-open-outline empty-icon"></i>
          <div class="no-workflows-text">{{ $t("home.no-workflows-in-project") }}</div>
        </div>

        <!-- No Search Results -->
        <div v-else-if="dashboardState === 'search-empty'" class="no-search-results">
          <i class="mdi mdi-magnify-close empty-icon"></i>
          <div class="no-results-text">
            {{ $t("home.no-workflows-found", { query: searchQuery }) }}
          </div>
          <Button text severity="secondary" @click="searchQuery = ''">
            {{ $t("home.clear-search") }}
          </Button>
        </div>

        <div v-else class="workflows-list">
          <article
            v-for="flow in filteredWorkflowsEnhanced"
            :key="flow.id"
            class="workflow-row"
            :data-workflow-id="flow.id"
          >
            <div class="workflow-icon">
              <img
                v-if="sourceIconImage(flow.content.source.provider)"
                :src="sourceIconImage(flow.content.source.provider)"
                alt=""
              />
              <i v-else :class="sourceIconClass(flow.content.source.provider)" aria-hidden="true" />
            </div>
            <RouterLink
              class="workflow-open-link"
              :to="workflowPath(flow.id)"
              :aria-label="$t('home.open-workflow', { name: flow.content.name })"
            >
              <div class="workflow-info">
                <div class="workflow-title-row">
                  <span class="workflow-name" :title="flow.content.name">{{
                    flow.content.name
                  }}</span>
                  <Tag severity="info" :value="$t('home.release')" class="type-tag" />
                </div>
                <div class="workflow-desc" :title="workflowRouteDescription(flow)">
                  {{ sourceLabel(flow.content.source.provider) }} →
                  {{ flow.content.destinations.map(destinationLabel).join(", ") }}
                </div>
              </div>
            </RouterLink>
            <div class="workflow-meta-actions">
              <span v-if="flow.lastModified" class="workflow-updated">{{
                $t("home.updated", { date: formatLastModified(flow.lastModified) })
              }}</span>
              <div class="row-actions">
                <RouterLink
                  class="workflow-runs-link"
                  :to="workflowPath(flow.id, 'runs')"
                  :aria-label="$t('home.view-workflow-runs', { name: flow.content.name })"
                  >{{ $t("home.runs") }}</RouterLink
                >
                <Button
                  icon="mdi mdi-pencil"
                  :label="$t('home.edit-short')"
                  text
                  rounded
                  severity="secondary"
                  :aria-label="$t('home.edit-workflow-named', { name: flow.content.name })"
                  v-tooltip.top="$t('home.edit-workflow-named', { name: flow.content.name })"
                  @click="openWorkflow(flow.id)"
                />
                <Button
                  icon="mdi mdi-dots-vertical"
                  text
                  rounded
                  severity="secondary"
                  :aria-label="$t('home.workflow-actions', { name: flow.content.name })"
                  v-tooltip.top="$t('home.workflow-actions', { name: flow.content.name })"
                  @click="toggleWorkflowMenu($event, flow)"
                />
              </div>
            </div>
          </article>
          <div
            v-for="broken in brokenWorkflows"
            :key="broken.id"
            class="workflow-row-error"
            role="alert"
          >
            <div class="workflow-error-copy">
              <strong>{{ $t("home.broken-workflow", { id: broken.id }) }}</strong>
              <span>{{ broken.error }}</span>
            </div>
            <Button
              :label="$t('home.retry')"
              text
              severity="secondary"
              :aria-label="$t('home.retry-loading-workflow', { id: broken.id })"
              @click="retryWorkflowLoad(broken.id)"
            />
          </div>
        </div>
      </section>
    </main>
    <Menu ref="workflowMenu" :model="workflowMenuItems" :popup="true" />
    <Menu ref="importMenu" :model="importMenuItems" :popup="true" />
    <ReleaseFlowWizard
      v-if="isWorkflowWizardVisible"
      v-model:visible="isWorkflowWizardVisible"
      :project-id="activeProjectId || ''"
      @create="createWorkflow"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, ref, inject, watch, defineAsyncComponent } from "vue";
import { useToast } from "primevue/usetoast";
import { storeToRefs } from "pinia";
import Menu from "primevue/menu";
import type { ReleaseCatalog, ReleaseConfig } from "@pipelab/shared";
import { RouterLink, useRoute, useRouter } from "vue-router";
import { OpenMigrationModalKey } from "../utils/injection-keys";
import { useAPI } from "@renderer/composables/api";
import { useFiles } from "@renderer/store/files";

import { useAppStore } from "@renderer/store/app";
import { useI18n } from "vue-i18n";
import Skeleton from "primevue/skeleton";
import { useConfirm } from "primevue/useconfirm";
import Message from "primevue/message";
import Tag from "primevue/tag";
import IconField from "primevue/iconfield";
import InputIcon from "primevue/inputicon";
import {
  loadWorkflowEntries,
  mergeWorkflowLoadState,
} from "./workflow-load-state";
import { readableProviderId } from "./workflow-presentation";
import { getDashboardDisplayState } from "./dashboard-state";
import { useAgentAvailability } from "@renderer/composables/useAgentAvailability";

const ReleaseFlowWizard = defineAsyncComponent(
  () => import("@renderer/components/ReleaseFlowWizard.vue"),
);

const router = useRouter();
const route = useRoute();
const api = useAPI();
const openMigrationModal = inject(OpenMigrationModalKey);
const confirm = useConfirm();
const toast = useToast();
const appStore = useAppStore();
const agent = useAgentAvailability();

// Table data
const fileStore = useFiles();
const { files, selectedProjectId, error: projectLoadError } = storeToRefs(fileStore);
const { removeWorkflow, load: reloadFiles } = fileStore;
const catalog = ref<ReleaseCatalog>({
  buildTypes: [],
  sources: [],
  producers: [],
  destinations: [],
});

const workflowsEnhanced = ref<
  Array<{ id: string; project: string; lastModified: string; content: ReleaseConfig }>
>([]);
const brokenWorkflows = ref<Array<{ id: string; error: string }>>([]);
let workflowLoadRevision = 0;
const isWorkflowWizardVisible = ref(false);

const searchQuery = ref("");

const formatLastModified = (dateStr?: string) => {
  if (!dateStr) return "";
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return dateStr;

  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return t("home.just-now");
  if (diffMins < 60) return t("home.minutes-ago", { count: diffMins });
  if (diffHours < 24) return t("home.hours-ago", { count: diffHours });
  if (diffDays < 7) return t("home.days-ago", { count: diffDays });

  return new Intl.DateTimeFormat(locale.value, {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
};

const { t, locale } = useI18n();
const notifyPersistenceError = (error: unknown) =>
  toast.add({
    severity: "error",
    summary: t("base.error"),
    detail: error instanceof Error ? error.message : String(error),
    life: 5000,
  });

const isLoading = ref(true);
const filesReady = computed(() => fileStore.status === "ready");

const activeProjectId = computed(() => selectedProjectId.value);
const activeProject = computed(() =>
  activeProjectId.value
    ? files.value.projects.find((project) => project.id === activeProjectId.value)
    : undefined,
);

const workflows = computed(() =>
  activeProjectId.value
    ? (files.value.workflows || []).filter((flow) => flow.project === activeProjectId.value)
    : [],
);
const filteredWorkflowsEnhanced = computed(() => {
  const q = searchQuery.value.trim().toLowerCase();
  return !q
    ? workflowsEnhanced.value
    : workflowsEnhanced.value.filter(
        (flow) =>
          flow.content.name.toLowerCase().includes(q) ||
          (flow.content.description || "").toLowerCase().includes(q),
      );
});

const dashboardState = computed(() =>
  getDashboardDisplayState({
    workflows: workflowsEnhanced.value.length,
    brokenWorkflows: brokenWorkflows.value.length,
    filteredWorkflows: filteredWorkflowsEnhanced.value.length,
  }),
);

watch(
  [workflows, filesReady, agent.isReady],
  async ([entries, ready, connected]) => {
    if (!ready || !connected) {
      workflowLoadRevision++;
      isLoading.value = workflowsEnhanced.value.length === 0;
      return;
    }
    const revision = ++workflowLoadRevision;
    const requestedProjectId = activeProjectId.value;
    isLoading.value = true;
    const requestedEntries = entries.map((flow) => ({ ...flow }));
    try {
      const partitioned = await loadWorkflowEntries(
        requestedEntries,
        (flow) => api.execute("workflow:load", { workflowId: flow.id, projectId: flow.project }),
        () =>
          revision === workflowLoadRevision && activeProjectId.value === requestedProjectId,
      );
      if (!partitioned) return;
      workflowsEnhanced.value = partitioned.loaded;
      brokenWorkflows.value = partitioned.broken;
    } catch (error) {
      if (revision !== workflowLoadRevision) return;
      workflowsEnhanced.value = [];
      brokenWorkflows.value = requestedEntries.map((flow) => ({
        id: flow.id,
        error: error instanceof Error ? error.message : String(error),
      }));
    } finally {
      if (revision === workflowLoadRevision) isLoading.value = false;
    }
  },
  { immediate: true },
);

watch(
  agent.isReady,
  async (connected) => {
    if (!connected) return;
    try {
      const result = await api.execute("release:catalog:get");
      if (result.type === "success") catalog.value = result.result;
    } catch {
      // Provider IDs are rendered as readable names until catalog metadata loads.
    }
  },
  { immediate: true },
);

const openWorkflowWizard = () => {
  isWorkflowWizardVisible.value = true;
};
const createWorkflow = async (flow: ReleaseConfig) => {
  await fileStore.saveWorkflow(flow);
  await router.push(`/workflows/${flow.id}/${flow.project}`);
};
const openWorkflow = (id: string) => router.push(`/workflows/${id}/${activeProjectId.value}`);
const workflowPath = (id: string, suffix = "") =>
  `/workflows/${id}/${activeProjectId.value}${suffix ? `/${suffix}` : ""}`;
const retryWorkflowLoad = async (id: string) => {
  const projectId = activeProjectId.value;
  const revision = workflowLoadRevision;
  const entry = workflows.value.find((flow) => flow.id === id);
  if (!projectId || !entry || entry.project !== projectId) return;

  const update = await loadWorkflowEntries(
    [entry],
    (flow) => api.execute("workflow:load", { workflowId: flow.id, projectId }),
    () => activeProjectId.value === projectId && workflowLoadRevision === revision,
  );
  if (!update) return;
  const merged = mergeWorkflowLoadState(
    { loaded: workflowsEnhanced.value, broken: brokenWorkflows.value },
    update,
  );
  workflowsEnhanced.value = merged.loaded;
  brokenWorkflows.value = merged.broken;
};
const sourceDefinition = (id: string) => catalog.value.sources.find((source) => source.id === id);
const sourceLabel = (id: string) => sourceDefinition(id)?.label || readableProviderId(id);
const destinationLabel = (destination: ReleaseConfig["destinations"][number]) =>
  catalog.value.destinations.find((item) => item.id === destination.provider)?.label ||
  readableProviderId(destination.provider);
const workflowRouteDescription = (flow: (typeof workflowsEnhanced.value)[number]) =>
  `${sourceLabel(flow.content.source.provider)} → ${flow.content.destinations
    .map(destinationLabel)
    .join(", ")}`;
const sourceIcon = (id: string) => {
  const catalogIcon = sourceDefinition(id)?.icon;
  if (catalogIcon?.type === "image") return catalogIcon;
  const providerIcon = appStore.providerDefinitions.find(
    (provider) => id === provider.packageName || id.startsWith(`${provider.packageName}/`),
  )?.icon;
  return providerIcon || catalogIcon;
};
const sourceIconImage = (id: string) => {
  const icon = sourceIcon(id);
  return icon?.type === "image" ? icon.image : undefined;
};
const sourceIconClass = (id: string) => {
  const icon = sourceIcon(id);
  if (icon?.type !== "icon") return "mdi mdi-rocket-launch-outline";
  if (icon.icon.includes("mdi ") || icon.icon.includes("pi ")) return icon.icon;
  if (icon.icon.startsWith("pi-")) return `pi ${icon.icon}`;
  return `mdi ${icon.icon}`;
};
const workflowMenu = ref();
const selectedWorkflowForMenu = ref<(typeof workflowsEnhanced.value)[number] | null>(null);

const toggleWorkflowMenu = (event: Event, flow: (typeof workflowsEnhanced.value)[number]) => {
  selectedWorkflowForMenu.value = flow;
  workflowMenu.value.toggle(event);
};

const deleteWorkflow = (id: string) => {
  const workflow = workflowsEnhanced.value.find((flow) => flow.id === id);
  if (!workflow) return;

  confirm.require({
    message: t("home.delete-workflow-confirmation"),
    header: t("home.delete-workflow"),
    icon: "pi pi-exclamation-triangle",
    rejectClass: "p-button-secondary p-button-outlined",
    acceptClass: "p-button-danger",
    accept: async () => {
      try {
        await removeWorkflow(id);
        workflowsEnhanced.value = workflowsEnhanced.value.filter((flow) => flow.id !== id);
      } catch (error) {
        notifyPersistenceError(error);
      }
    },
  });
};

const importMenu = ref();
const toggleImportMenu = (event: Event) => {
  importMenu.value.toggle(event);
};

const importMenuItems = computed(() => {
  if (appStore.channel === "dev") {
    return [
      {
        label: t("home.import-from-stable"),
        icon: "mdi mdi-auto-fix",
        command: () => {
          openMigrationModal?.("stable");
        },
      },
      {
        label: t("home.import-from-beta"),
        icon: "mdi mdi-auto-fix",
        command: () => {
          openMigrationModal?.("beta");
        },
      },
    ];
  }

  return [
    {
      label:
        appStore.channel === "stable" ? t("home.import-from-beta") : t("home.import-from-stable"),
      icon: "mdi mdi-auto-fix",
      command: () => {
        openMigrationModal?.(appStore.channel === "stable" ? "beta" : "stable");
      },
    },
  ];
});

const workflowMenuItems = computed(() => [
  {
    label: t("base.delete"),
    icon: "mdi mdi-delete",
    class: "text-red-500",
    command: () => {
      if (selectedWorkflowForMenu.value) deleteWorkflow(selectedWorkflowForMenu.value.id);
    },
  },
]);

watch(
  [() => route.query.create, filesReady, agent.isReady, activeProjectId],
  ([create, ready, connected, projectId]) => {
    if (create !== "new" || !ready || !connected || !projectId) return;
    isWorkflowWizardVisible.value = true;
    void router.replace({ path: "/workflows" });
  },
  { immediate: true },
);
</script>

<style lang="scss" scoped>
.workflow-icon {
  color: var(--primary-color);
  font-size: 24px;
  display: flex;
  justify-content: center;
  align-items: center;
  width: 32px;
  height: 32px;
  margin-right: 20px;
  flex-shrink: 0;

  img {
    max-width: 100%;
    max-height: 100%;
    object-fit: contain;
  }
}
/* ─── Release workspace shell ───────────────────────────── */
.index {
  width: 100%;
  height: 100%;
  overflow: auto;
}

.workspace-page {
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  gap: 28px;
  width: min(100%, 1480px);
  min-height: 100%;
  margin: 0 auto;
  padding: 38px 44px 48px;
}

.workspace-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 28px;
  padding-bottom: 26px;
  border-bottom: 1px solid var(--p-surface-200);

  :root.dark & {
    border-bottom-color: var(--p-surface-800);
  }
}

.workspace-heading {
  min-width: 0;

  h1 {
    margin: 0;
    color: var(--p-text-color);
    font-size: 1.85rem;
    font-weight: 700;
    line-height: 1.15;
    letter-spacing: -0.04em;
  }
}

.workspace-project-context {
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

.workspace-description {
  margin: 8px 0 0;
  color: var(--p-text-muted-color);
  font-size: 0.875rem;
  line-height: 1.5;
}

.workspace-message {
  margin: -12px 0 0;
}

.workflows-area {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;
}

.workflows-toolbar {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 20px;
  margin-bottom: 18px;
}

.section-heading {
  min-width: 0;

  h2 {
    margin: 0;
    color: var(--p-text-color);
    font-size: 1.2rem;
    font-weight: 650;
    line-height: 1.25;
    letter-spacing: -0.025em;
  }
}

.header-right {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
  min-width: 0;
}

.search-field {
  width: 230px;
  flex: 0 1 230px;
  min-width: 170px;

  .search-input {
    width: 100%;
    min-height: 44px;
    padding-left: 2.25rem !important;
    border-radius: 9px;
  }
}

.action-buttons {
  display: flex;
  flex: 0 0 auto;
  gap: 8px;

  :deep(.p-button) {
    min-height: 44px;
    white-space: nowrap;
  }
}

.workflows-area :deep(.p-button:focus-visible),
.workflows-area :deep(.p-inputtext:focus-visible) {
  outline: 3px solid color-mix(in srgb, var(--primary-color) 55%, transparent);
  outline-offset: 2px;
}

.workflows-area :deep(.p-button) {
  min-height: 44px;
  transition:
    border-color 140ms ease,
    background-color 140ms ease,
    box-shadow 140ms ease;
}

.visually-hidden {
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

@media (prefers-reduced-motion: reduce) {
  .workflows-area :deep(.p-button) {
    transition: none;
  }

  .workflow-row {
    transition: none;
  }
}

/* ─── Workflows List ────────────────────────────────────── */
.workflows-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  flex: 1;
}

.workflow-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  background: var(--p-surface-0);
  border: 1px solid var(--p-surface-200);
  border-left: 3px solid var(--primary-color);
  border-radius: 8px;
  transition:
    border-color 140ms ease,
    background-color 140ms ease;
  position: relative;
  background: color-mix(in srgb, var(--primary-color) 4%, var(--p-surface-0));

  :root.dark & {
    background: var(--p-surface-900);
    border-color: var(--p-surface-800);
  }

  &:hover {
    border-color: var(--p-surface-300);
    background: color-mix(in srgb, var(--primary-color) 9%, var(--p-surface-0));

    :root.dark & {
      background: var(--p-surface-850);
      border-color: var(--p-surface-700);
    }
  }
}

.workflow-open-link {
  display: flex;
  flex: 1 1 auto;
  align-items: center;
  min-width: 0;
  color: inherit;
  text-decoration: none;
  border-radius: 6px;

  &:focus-visible {
    outline: 3px solid color-mix(in srgb, var(--primary-color) 55%, transparent);
    outline-offset: 3px;
  }
}

.workflow-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding-right: 16px;
}

.workflow-title-row {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.workflow-name {
  min-width: 0;
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--p-text-color);
  line-height: 1.35;
  overflow-wrap: anywhere;
  display: block;
  flex: 0 1 auto;
}

.type-tag {
  font-size: 0.7rem;
  padding: 2px 6px;
  border-radius: 4px;
  font-weight: 600;
}

.workflow-desc {
  min-width: 0;
  font-size: 0.75rem;
  color: var(--p-text-muted-color);
  line-height: 1.45;
  white-space: normal;
  overflow: hidden;
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  overflow-wrap: anywhere;
}

/* ─── Workflow Meta & Actions ────────────────────────────── */
.workflow-meta-actions {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-shrink: 0;
}

.workflow-updated {
  font-size: 0.725rem;
  color: var(--p-text-muted-color);
  font-weight: 500;
  white-space: nowrap;
}

.row-actions {
  display: flex;
  align-items: center;
  gap: 4px;

  :deep(.p-button) {
    min-width: 44px;
    min-height: 44px;
    flex-shrink: 0;
  }
}

.workflow-runs-link {
  display: inline-flex;
  align-items: center;
  min-height: 44px;
  min-width: 44px;
  padding: 0 10px;
  border-radius: 6px;
  color: var(--p-text-muted-color);
  font-size: 0.75rem;
  font-weight: 600;
  text-decoration: none;

  &:hover {
    background: var(--p-surface-100);
    color: var(--p-text-color);
  }

  &:focus-visible {
    outline: 3px solid color-mix(in srgb, var(--primary-color) 55%, transparent);
    outline-offset: 2px;
  }

  :root.dark &:hover {
    background: var(--p-surface-800);
  }
}

/* ─── Empty & Loading States ────────────────────────────── */
.no-projects,
.no-search-results {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16px;
  flex: 0 0 auto;
  align-self: flex-start;
  box-sizing: border-box;
  max-width: 100%;
  padding: 28px 24px;
  border: 1px dashed var(--p-surface-300);
  border-radius: 12px;
  background: rgba(0, 0, 0, 0.01);

  :root.dark & {
    border-color: var(--p-surface-700);
    background: rgba(255, 255, 255, 0.01);
  }

  .empty-icon {
    font-size: 2rem;
    color: var(--p-text-muted-color);
    opacity: 0.6;
  }

  .no-workflows-text,
  .no-results-text {
    font-size: 1.1rem;
    font-weight: 600;
    color: var(--p-text-muted-color);
    text-align: center;
  }

  :deep(.p-button) {
    max-width: 100%;
  }
}

.workflow-row-error {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 12px 16px;
  color: var(--p-text-color);
  background: color-mix(in srgb, var(--p-red-500, #ef4444) 7%, var(--p-surface-0));
  border: 1px solid color-mix(in srgb, var(--p-red-500, #ef4444) 35%, var(--p-surface-200));
  border-radius: 8px;

  :root.dark & {
    background: color-mix(in srgb, var(--p-red-400, #f87171) 9%, var(--p-surface-900));
    border-color: color-mix(in srgb, var(--p-red-400, #f87171) 35%, var(--p-surface-800));
  }

  :deep(.p-button) {
    min-width: 44px;
    min-height: 44px;
    flex-shrink: 0;
  }
}

.workflow-error-copy {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
  font-size: 0.8rem;

  strong {
    font-weight: 600;
  }

  span {
    color: var(--p-text-muted-color);
    overflow-wrap: anywhere;
  }
}

.loading-state {
  display: flex;
  flex-direction: column;
  gap: 10px;
  flex: 1;
}

.skeleton-row {
  display: flex;
  align-items: center;
  padding: 8px 12px;
  background: var(--p-surface-0);
  border: 1px solid var(--p-surface-200);
  border-radius: 8px;

  :root.dark & {
    background: var(--p-surface-900);
    border-color: var(--p-surface-800);
  }
}

/* ─── Project Dialog ────────────────────────────────────── */
.project-dialog {
  :deep(.p-dialog-header) {
    padding: 16px 20px 8px;
    border-bottom: none;
  }

  :deep(.p-dialog-content) {
    padding: 8px 20px 20px;
  }
}

.dialog-title {
  font-size: 1.05rem;
  font-weight: 700;
  letter-spacing: -0.02em;
  text-align: center;
  margin: 0;
  color: var(--p-text-color);
}

.new-project {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.form-section {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.form-label {
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--p-text-color);
  letter-spacing: -0.01em;

  .optional {
    font-weight: 400;
    color: var(--p-text-muted-color);
    margin-left: 2px;
  }
}

.dialog-footer {
  display: flex;
  justify-content: flex-end;
  padding-top: 4px;

  :deep(.p-button) {
    padding: 6px 14px;
    font-size: 0.825rem;
  }
}

/* ─── Misc ──────────────────────────────────────────────── */
.icon-container {
  position: relative;
  display: inline-block;
}

.crown-icon {
  position: absolute;
  top: 0.1em;
  right: 0.1em;
  font-size: 0.6em;
  background-color: gold;
  border-radius: 50%;
  padding: 2px;
}

.header {
  font-size: 1.5rem;
  line-height: 2rem;
  margin: 16px 16px 32px 16px;
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;

  .title {
    margin-left: 8px;
  }

  .button {
    display: flex;
    gap: 8px;
    flex-direction: row;
    height: 40px;
    font-weight: 500 !important;
  }
}

/* ─── Responsive workspace ─────────────────────────────── */
@media (max-width: 1120px) {
  .workspace-page {
    padding: 30px 28px 40px;
  }

  .workspace-header {
    align-items: flex-start;
  }

  .workflows-toolbar {
    align-items: flex-start;
    flex-direction: column;
  }

  .header-right {
    width: 100%;
    justify-content: space-between;
  }

  .search-field {
    flex: 1 1 230px;
  }
}

@media (max-width: 720px) {
  .workspace-page {
    gap: 22px;
    padding: 24px 20px 32px;
  }

  .workspace-header {
    flex-direction: column;
    gap: 20px;
    padding-bottom: 20px;
  }

  .workflows-toolbar {
    gap: 16px;
  }

  .header-right {
    align-items: stretch;
    flex-direction: column;
  }

  .search-field {
    width: 100%;
    flex: 1 1 auto;
    min-width: 0;
  }

  .action-buttons {
    width: 100%;

    :deep(.p-button) {
      flex: 1;
      justify-content: center;
    }
  }

  .workflow-row {
    flex-wrap: wrap;
    gap: 10px;
    padding: 12px;
  }

  .workflow-icon {
    margin-right: 0;
  }

  .workflow-info {
    flex: 1 1 calc(100% - 60px);
    padding-right: 0;
  }

  .workflow-open-link {
    flex-basis: calc(100% - 52px);
  }

  .workflow-meta-actions {
    flex: 1 1 100%;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 8px;
  }

  .workflow-updated {
    font-size: 0.7rem;
  }

  .row-actions {
    margin-left: auto;
  }

  .workflow-row-error {
    align-items: flex-start;
    gap: 8px;
    padding: 10px;
  }
}

@media (max-width: 440px) {
  .workspace-page {
    padding: 20px 14px 28px;
  }

  .workspace-heading h1 {
    font-size: 1.6rem;
  }
}
</style>
