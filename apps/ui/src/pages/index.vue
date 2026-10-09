<template>
  <div class="index">
    <ConfirmDialog />
    <main class="workspace-page">
      <header class="workspace-header">
        <div class="workspace-heading">
          <h1>Release workspace</h1>
          <p class="workspace-description">Build and publish for each of your projects.</p>
        </div>

        <div class="workspace-project">
          <div class="project-switcher">
            <label for="dashboard-project-select">Project</label>
            <Select
              id="tour-projects-list"
              inputId="dashboard-project-select"
              :model-value="activeProjectId"
              :options="projects"
              option-label="name"
              option-value="id"
              placeholder="Choose a project"
              :disabled="!filesReady || projects.length === 0"
              aria-label="Select project"
              class="project-select"
              @update:model-value="selectProject"
            />
          </div>
          <Button
            id="tour-add-project"
            label="New project"
            icon="mdi mdi-plus"
            aria-label="New project"
            severity="secondary"
            variant="outlined"
            :disabled="
              authStore.subscriptionStatus !== 'ready' || !agent.isReady.value || !filesReady
            "
            v-tooltip.top="
              authStore.subscriptionStatus === 'ready' && !hasMultipleProjectsBenefit
                ? $t('home.premium-feature')
                : undefined
            "
            @click="onCreateProjectClick"
          />
          <Button
            icon="mdi mdi-dots-horizontal"
            severity="secondary"
            text
            rounded
            aria-label="Project actions"
            aria-haspopup="menu"
            aria-controls="project-actions-menu"
            :aria-expanded="isProjectMenuOpen"
            v-tooltip.top="'Project actions'"
            :disabled="!activeProjectId || !filesReady"
            @click="toggleProjectMenu"
          />
          <Menu
            id="project-actions-menu"
            ref="projectMenu"
            :model="projectMenuItems"
            :popup="true"
            @show="isProjectMenuOpen = true"
            @hide="isProjectMenuOpen = false"
          />
        </div>
      </header>

      <Message
        v-if="filesReady && appStore.runtimeStatus === 'error'"
        severity="warn"
        :closable="false"
        role="alert"
        class="workspace-message"
      >
        Runtime information is unavailable. {{ appStore.runtimeError }}
        <Button
          label="Retry runtime info"
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
        <Button label="Retry" text size="small" @click="loadDashboardData" />
      </Message>

      <section class="workflows-area" aria-labelledby="workflow-list-title">
        <div class="workflows-toolbar">
          <div class="section-heading">
            <h2 id="workflow-list-title">Workflows</h2>
          </div>
          <div class="header-right">
            <IconField class="search-field">
              <InputIcon class="pi pi-search" />
              <InputText
                v-model="searchQuery"
                placeholder="Search workflows"
                aria-label="Search workflows"
                class="search-input"
                size="small"
              />
            </IconField>
            <div class="action-buttons">
              <Button
                label="New workflow"
                icon="mdi mdi-rocket-launch-outline"
                @click="openWorkflowWizard"
              />
              <Button severity="secondary" variant="outlined" @click="toggleImportMenu">
                <i class="mdi mdi-folder-open-outline mr-2" aria-hidden="true" />
                {{ $t("home.import") }}
                <i class="mdi mdi-chevron-down ml-2" aria-hidden="true" />
              </Button>
            </div>
          </div>
        </div>

        <!-- Loading State -->
        <div v-if="!filesReady && !agent.isReady.value" class="inline-state" role="status">
          Workflows are unavailable while the engine is disconnected.
        </div>
        <div v-else-if="!filesReady || isLoading" class="loading-state" aria-busy="true">
          <span class="visually-hidden" role="status">Loading workflows</span>
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
          <div class="no-workflows-text">No workflows in this project yet.</div>
          <Button severity="secondary" variant="outlined" @click="openWorkflowWizard">
            <i class="mdi mdi-rocket-launch-outline mr-2"></i>
            New workflow
          </Button>
        </div>

        <!-- No Search Results -->
        <div v-else-if="dashboardState === 'search-empty'" class="no-search-results">
          <i class="mdi mdi-magnify-close empty-icon"></i>
          <div class="no-results-text">No workflows found matching "{{ searchQuery }}"</div>
          <Button text severity="secondary" @click="searchQuery = ''"> Clear search </Button>
        </div>

        <div v-else class="workflows-list">
          <div
            v-for="flow in filteredWorkflowsEnhanced"
            :key="flow.id"
            class="workflow-row"
            @click="openWorkflow(flow.id)"
          >
            <div class="workflow-icon">
              <i class="mdi mdi-rocket-launch-outline"></i>
            </div>
            <div class="workflow-info">
              <div class="workflow-title-row">
                <span class="workflow-name">{{ flow.content.name }}</span>
                <Tag severity="info" value="Release" class="type-tag" />
              </div>
              <div class="workflow-desc">
                {{ flow.content.source.provider }} →
                {{ flow.content.destinations.map(destinationLabel).join(", ") }}
              </div>
            </div>
            <div class="workflow-meta-actions">
              <span class="workflow-updated"
                >Updated {{ formatLastModified(flow.lastModified) }}</span
              >
              <div class="row-actions" @click.stop>
                <Button
                  icon="mdi mdi-pencil"
                  text
                  rounded
                  severity="secondary"
                  size="small"
                  v-tooltip.top="'Edit workflow'"
                  @click="openWorkflow(flow.id)"
                /><Button
                  icon="mdi mdi-dots-vertical"
                  text
                  rounded
                  severity="secondary"
                  size="small"
                  @click="toggleWorkflowMenu($event, flow)"
                />
              </div>
            </div>
          </div>
          <Message
            v-for="broken in brokenWorkflows"
            :key="broken.id"
            severity="error"
            class="workflow-row-error"
          >
            Release workflow <strong>{{ broken.id }}</strong> could not be loaded:
            {{ broken.error }}
          </Message>
        </div>
      </section>
    </main>
    <Dialog
      v-model:visible="isNewProjectModalVisible"
      modal
      :style="{ width: '400px', maxWidth: '90vw' }"
      :pt="{ root: { class: 'project-dialog' } }"
    >
      <template #header>
        <div class="flex flex-column w-full">
          <p class="dialog-title">{{ $t("home.new-project") }}</p>
        </div>
      </template>

      <div class="new-project">
        <div class="form-section">
          <label for="new-project-name" class="form-label">{{ $t("home.project-name") }}</label>
          <InputText id="new-project-name" v-model="newProjectName" class="w-full" size="small" />
        </div>

        <div class="dialog-footer">
          <Button
            :disabled="!canCreateProject || !agent.isReady.value || !filesReady"
            size="small"
            @click="onNewProjectCreation"
            >{{ $t("home.create-project") }}</Button
          >
        </div>
      </div>
    </Dialog>

    <Menu ref="workflowMenu" :model="workflowMenuItems" :popup="true" />
    <Menu ref="importMenu" :model="importMenuItems" :popup="true" />
    <ReleaseFlowWizard
      v-if="isWorkflowWizardVisible"
      v-model:visible="isWorkflowWizardVisible"
      :project-id="activeProjectId"
      @create="createWorkflow"
    />

    <Dialog
      v-model:visible="isRenameProjectModalVisible"
      modal
      :style="{ width: '400px', maxWidth: '90vw' }"
    >
      <template #header>
        <p class="text-xl font-bold">{{ $t("home.rename-project") }}</p>
      </template>
      <div class="flex flex-column gap-2">
        <label for="rename-project-name">{{ $t("home.new-project-name") }}</label>
        <InputText id="rename-project-name" v-model="renameProjectName" class="w-full" />
      </div>
      <template #footer>
        <Button
          label="Cancel"
          text
          severity="secondary"
          @click="isRenameProjectModalVisible = false"
        />
        <Button label="Rename" :disabled="!renameProjectName" @click="onRenameProject" />
      </template>
    </Dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, inject, watch, defineAsyncComponent } from "vue";
import { useToast } from "primevue/usetoast";
import { storeToRefs } from "pinia";
import Menu from "primevue/menu";
import { ReleaseConfig } from "@pipelab/shared";
import { nanoid } from "nanoid";
import { useRouter } from "vue-router";
import { OpenMigrationModalKey, OpenUpgradeDialogKey } from "../utils/injection-keys";
import { useAPI } from "@renderer/composables/api";
import { useFiles } from "@renderer/store/files";

import { useAppStore } from "@renderer/store/app";
import { useI18n } from "vue-i18n";
import { useAuth } from "@renderer/store/auth";
import Skeleton from "primevue/skeleton";
import ConfirmDialog from "primevue/confirmdialog";
import Select from "primevue/select";
import { useConfirm } from "primevue/useconfirm";
import Message from "primevue/message";
import Tag from "primevue/tag";
import IconField from "primevue/iconfield";
import InputIcon from "primevue/inputicon";
import { partitionWorkflowLoads } from "./workflow-load-state";
import { getDashboardDisplayState, resolveSelectedProjectId } from "./dashboard-state";
import { useAgentAvailability } from "@renderer/composables/useAgentAvailability";

const ReleaseFlowWizard = defineAsyncComponent(
  () => import("@renderer/components/ReleaseFlowWizard.vue"),
);

const router = useRouter();
const api = useAPI();
const openUpgradeDialog = inject(OpenUpgradeDialogKey)!;
const openMigrationModal = inject(OpenMigrationModalKey);
const confirm = useConfirm();
const toast = useToast();
const appStore = useAppStore();
const agent = useAgentAvailability();

// Table data
const fileStore = useFiles();
const { files } = storeToRefs(fileStore);
const { update: updateFileStore, removeProject, removeWorkflow, load: reloadFiles } = fileStore;

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

  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;

  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
};

const canCreateProject = computed(
  () => newProjectName.value.length > 0 && authStore.subscriptionStatus === "ready",
);

const { t } = useI18n();
const notifyPersistenceError = (error: unknown) =>
  toast.add({
    severity: "error",
    summary: t("base.error"),
    detail: error instanceof Error ? error.message : String(error),
    life: 5000,
  });

const isLoading = ref(true);
const projectLoadError = ref("");
const filesReady = computed(() => fileStore.status === "ready");

const selectedKey = ref<Record<string, boolean>>({});
const activeProjectId = computed(() => Object.keys(selectedKey.value)[0]);
const activeProject = computed(() =>
  activeProjectId.value
    ? projects.value.find((project) => project.id === activeProjectId.value)
    : undefined,
);
const projects = computed(() => files.value.projects);

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

const selectProject = (id: string) => {
  selectedKey.value = { [id]: true };
};

watch([workflows, filesReady, agent.isReady], async ([entries, ready, connected]) => {
  if (!ready || !connected) {
    workflowLoadRevision++;
    isLoading.value = workflowsEnhanced.value.length === 0;
    return;
  }
  const revision = ++workflowLoadRevision;
  isLoading.value = true;
  const requestedEntries = entries.map((flow) => ({ ...flow }));
  const results = await Promise.all(
    requestedEntries.map((flow) =>
      api.execute("workflow:load", { workflowId: flow.id, projectId: flow.project }),
    ),
  );
  if (revision !== workflowLoadRevision) return;
  const partitioned = partitionWorkflowLoads(requestedEntries, results);
  workflowsEnhanced.value = partitioned.loaded;
  brokenWorkflows.value = partitioned.broken;
  isLoading.value = false;
});

watch(
  [projects, selectedKey, filesReady],
  ([newProjects, newSelectedKey, loaded]) => {
    if (!loaded) return;
    const selectedId = resolveSelectedProjectId(newProjects, Object.keys(newSelectedKey)[0]);
    const currentIds = Object.keys(newSelectedKey);
    if (selectedId && (currentIds.length !== 1 || currentIds[0] !== selectedId))
      selectedKey.value = { [selectedId]: true };
    else if (!selectedId && currentIds.length) selectedKey.value = {};
  },
  { immediate: true },
);

const newProjectName = ref("");

const authStore = useAuth();
const { hasMultipleProjectsBenefit } = storeToRefs(authStore);

const openWorkflowWizard = () => {
  isWorkflowWizardVisible.value = true;
};
const createWorkflow = async (flow: ReleaseConfig) => {
  await fileStore.saveWorkflow(flow);
  await router.push(`/workflows/${flow.id}/${flow.project}`);
};
const openWorkflow = (id: string) => router.push(`/workflows/${id}/${activeProjectId.value}`);
const destinationLabel = (d: ReleaseConfig["destinations"][number]) => d.provider;
let dashboardLoadGeneration = 0;
const loadDashboardData = async () => {
  if (!agent.isReady.value) return;
  const generation = ++dashboardLoadGeneration;
  projectLoadError.value = "";
  const [projectsResult, runtimeResult] = await Promise.allSettled([
    reloadFiles(),
    appStore.loadRuntimeInfo(),
  ]);
  if (generation !== dashboardLoadGeneration || !agent.isReady.value) return;
  if (projectsResult.status === "rejected") {
    projectLoadError.value =
      projectsResult.reason instanceof Error
        ? projectsResult.reason.message
        : String(projectsResult.reason);
    notifyPersistenceError(projectsResult.reason);
  }
  if (runtimeResult.status === "rejected") notifyPersistenceError(runtimeResult.reason);
};
watch(
  agent.isReady,
  (ready) => {
    if (ready) void loadDashboardData();
    else dashboardLoadGeneration++;
  },
  { immediate: true },
);
const onNewProjectCreation = async () => {
  if (!agent.isReady.value || !filesReady.value || authStore.subscriptionStatus !== "ready") return;
  const projectId = nanoid();
  try {
    await updateFileStore((state) => {
      state.projects.push({
        id: projectId,
        name: newProjectName.value,
        description: "",
      });
    });
  } catch (error) {
    toast.add({
      severity: "error",
      summary: t("base.error"),
      detail: error instanceof Error ? error.message : String(error),
      life: 3000,
    });
    return;
  }
  isNewProjectModalVisible.value = false;
  // Select the new project
  selectedKey.value = { [projectId]: true };
  newProjectName.value = "";
};

const onCreateProjectClick = () => {
  if (authStore.subscriptionStatus !== "ready" || !agent.isReady.value || !filesReady.value) return;
  if (hasMultipleProjectsBenefit.value) {
    isNewProjectModalVisible.value = true;
  } else {
    openUpgradeDialog();
  }
};

const isRenameProjectModalVisible = ref(false);
const renameProjectName = ref("");

const projectToRenameId = ref<string | null>(null);

const openRenameProjectDialog = (projectId?: string) => {
  const id = projectId || activeProjectId.value;
  const project = projects.value.find((p) => p.id === id);

  if (project) {
    projectToRenameId.value = id;
    renameProjectName.value = project.name;
    isRenameProjectModalVisible.value = true;
  }
};

const onRenameProject = async () => {
  if (projectToRenameId.value && renameProjectName.value) {
    try {
      await updateFileStore((state) => {
        const project = state.projects.find((p) => p.id === projectToRenameId.value);
        if (project) {
          project.name = renameProjectName.value;
        }
      });
    } catch (error) {
      toast.add({
        severity: "error",
        summary: t("base.error"),
        detail: error instanceof Error ? error.message : String(error),
        life: 3000,
      });
      return;
    }
    isRenameProjectModalVisible.value = false;
    projectToRenameId.value = null;
  }
};

const deleteProject = async (projectId?: string) => {
  const id = projectId || activeProjectId.value;
  if (!id) return;

  const projectWorkflows = (files.value.workflows || []).filter(
    (workflow) => workflow.project === id,
  );

  if (projectWorkflows.length > 0) {
    toast.add({
      severity: "error",
      summary: t("home.cannot-delete-project"),
      detail: t("home.project-not-empty"),
      life: 3000,
    });
    return;
  }

  confirm.require({
    message: t("home.confirm-delete-project"),
    header: t("home.delete-project"),
    icon: "pi pi-exclamation-triangle",
    rejectClass: "p-button-secondary p-button-outlined",
    acceptClass: "p-button-danger",
    accept: async () => {
      try {
        await removeProject(id);
      } catch (error) {
        notifyPersistenceError(error);
      }
    },
    reject: () => {
      // do nothing
    },
  });
};

const projectMenu = ref();
const isProjectMenuOpen = ref(false);
const toggleProjectMenu = (event: Event) => projectMenu.value.toggle(event);
const projectMenuItems = computed(() => [
  {
    label: t("home.rename-project"),
    icon: "mdi mdi-pencil",
    command: () => openRenameProjectDialog(),
  },
  {
    label: t("home.delete-project"),
    icon: "mdi mdi-delete",
    class: "text-red-500",
    disabled: projects.value.length <= 1,
    command: () => deleteProject(),
  },
]);

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
    message: "Are you sure you want to delete this release? This action cannot be undone.",
    header: "Delete Release",
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
    label: "Delete",
    icon: "mdi mdi-delete",
    class: "text-red-500",
    command: () => {
      if (selectedWorkflowForMenu.value) deleteWorkflow(selectedWorkflowForMenu.value.id);
    },
  },
]);

const isNewProjectModalVisible = ref(false);
</script>

<style lang="scss" scoped>
.workflow-icon {
  color: var(--primary-color);
  font-size: 24px;
  display: flex;
  justify-content: center;
  margin-right: 20px;
  flex-shrink: 0;
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
  align-items: flex-end;
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

.workspace-description {
  margin: 8px 0 0;
  color: var(--p-text-muted-color);
  font-size: 0.875rem;
  line-height: 1.5;
}

.workspace-project {
  display: flex;
  flex: 0 0 auto;
  align-items: flex-end;
  gap: 8px;
}

.project-switcher {
  display: flex;
  flex-direction: column;
  gap: 6px;
  width: min(270px, 34vw);

  label {
    color: var(--p-text-muted-color);
    font-size: 0.7rem;
    font-weight: 700;
    letter-spacing: 0.08em;
    line-height: 1;
    text-transform: uppercase;
  }

  :deep(.p-select) {
    min-height: 40px;
    border-radius: 9px;
  }
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
    min-height: 40px;
    padding-left: 2.25rem !important;
    border-radius: 9px;
  }
}

.action-buttons {
  display: flex;
  flex: 0 0 auto;
  gap: 8px;

  :deep(.p-button) {
    min-height: 40px;
    white-space: nowrap;
  }
}

.project-switcher :deep(.p-select:focus-visible),
.workspace-project :deep(.p-button:focus-visible),
.workflows-area :deep(.p-button:focus-visible),
.workflows-area :deep(.p-inputtext:focus-visible) {
  outline: 3px solid color-mix(in srgb, var(--primary-color) 55%, transparent);
  outline-offset: 2px;
}

.workflows-area :deep(.p-button),
.workspace-project :deep(.p-button),
.project-switcher :deep(.p-select) {
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
  .workflows-area :deep(.p-button),
  .workspace-project :deep(.p-button),
  .project-switcher :deep(.p-select) {
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
  padding: 8px 12px;
  background: var(--p-surface-0);
  border: 1px solid var(--p-surface-200);
  border-left: 3px solid var(--primary-color);
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  position: relative;
  overflow: hidden;
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

    .row-actions {
      opacity: 1;
    }
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
}

.workflow-name {
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--p-text-color);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.type-tag {
  font-size: 0.7rem;
  padding: 2px 6px;
  border-radius: 4px;
  font-weight: 600;
}

.workflow-desc {
  font-size: 0.75rem;
  color: var(--p-text-muted-color);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* ─── Workflow Meta & Actions ────────────────────────────── */
.workflow-meta-actions {
  display: flex;
  align-items: center;
  gap: 16px;
  flex-shrink: 0;
}

.workflow-updated {
  font-size: 0.725rem;
  color: var(--p-text-muted-color);
  font-weight: 500;
}

.row-actions {
  display: flex;
  gap: 2px;
  opacity: 0.7;
  transition: opacity 0.15s ease;

  @media (max-width: 768px) {
    opacity: 1;
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
  flex: 1;
  padding: 64px 24px;
  border: 1px dashed var(--p-surface-300);
  border-radius: 12px;
  background: rgba(0, 0, 0, 0.01);

  :root.dark & {
    border-color: var(--p-surface-700);
    background: rgba(255, 255, 255, 0.01);
  }

  .empty-icon {
    font-size: 3rem;
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

  .workspace-project {
    width: 100%;
  }

  .project-switcher {
    flex: 1;
    width: auto;
    min-width: 0;
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
    gap: 8px;
    padding: 14px;
  }

  .workflow-icon {
    margin-right: 0;
  }

  .workflow-info {
    flex: 1 1 calc(100% - 60px);
    padding-right: 0;
  }

  .workflow-meta-actions {
    flex: 1 1 100%;
    justify-content: space-between;
  }

  .workflow-updated {
    font-size: 0.7rem;
  }

  .row-actions {
    opacity: 1;
  }
}

@media (max-width: 440px) {
  .workspace-page {
    padding: 20px 14px 28px;
  }

  .workspace-heading h1 {
    font-size: 1.6rem;
  }

  .workspace-project :deep(.p-button) {
    white-space: nowrap;
  }
}
</style>
