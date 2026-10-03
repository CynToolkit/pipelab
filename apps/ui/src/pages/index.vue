<template>
  <div class="index">
    <ConfirmDialog />
    <Layout>
      <div class="main-layout">
        <div class="drawer">
          <div class="project-header">
            <div class="project-text">
              <i class="mdi mdi-folder mr-2"></i>
              Projects
            </div>
            <div class="project-header-actions">
              <Button
                id="tour-add-project"
                v-tooltip.top="!hasMultipleProjectsBenefit ? $t('home.premium-feature') : undefined"
                text
                size="small"
                class="drawer-header-icon-btn"
                @click="onCreateProjectClick"
              >
                <i class="icon mdi mdi-plus fs-16"></i>
              </Button>
            </div>
          </div>
          <div class="project-list" id="tour-projects-list">
            <div
              v-for="project in projects"
              :key="project.id"
              class="project-item"
              :class="{ active: activeProjectId === project.id }"
              @click="selectProject(project.id)"
            >
              <div class="project-item-content">
                <i class="mdi mdi-folder-outline project-icon"></i>
                <span class="project-label">{{ project.name }}</span>
              </div>
              <div class="project-item-actions" @click.stop>
                <Button
                  text
                  rounded
                  severity="secondary"
                  size="small"
                  v-tooltip.top="'Rename Project'"
                  @click="openRenameProjectDialog(project.id)"
                >
                  <i class="mdi mdi-pencil"></i>
                </Button>
                <Button
                  v-if="projects.length > 1"
                  text
                  rounded
                  severity="danger"
                  size="small"
                  v-tooltip.top="'Delete Project'"
                  @click="deleteProject(project.id)"
                >
                  <i class="mdi mdi-delete"></i>
                </Button>
              </div>
            </div>
          </div>
        </div>

        <div class="your-projects">
          <!-- Header Section -->
          <div class="projects-header">
            <div class="header-left">
              <h2 class="project-title">{{ activeProject?.name }}</h2>
            </div>

            <!-- Toolbar / Search and Action buttons -->
            <div class="header-right">
              <!-- Search Input -->
              <IconField class="search-field">
                <InputIcon class="pi pi-search" />
                <InputText
                  v-model="searchQuery"
                  placeholder="Search workflows..."
                  class="search-input"
                  size="small"
                />
              </IconField>

              <!-- Actions -->
              <div class="action-buttons">
                <Button
                  size="small"
                  severity="secondary"
                  variant="outlined"
                  @click="openWorkflowWizard"
                >
                  <i class="mdi mdi-rocket-launch-outline mr-2"></i>
                  New workflow
                </Button>
                <Button
                  variant="outlined"
                  severity="secondary"
                  size="small"
                  @click="toggleImportMenu"
                >
                  <i class="mdi mdi-folder-open-outline mr-2"></i>
                  {{ $t("home.import") }}
                  <i class="mdi mdi-chevron-down ml-2"></i>
                </Button>
              </div>
            </div>
          </div>

          <!-- Loading State -->
          <div v-if="isLoading" class="loading-state">
            <div v-for="n in 3" :key="n" class="skeleton-row">
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
            <Button
              severity="secondary"
              variant="outlined"
              @click="openWorkflowWizard"
            >
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
        </div>
      </div>
    </Layout>

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
          <label class="form-label">{{ $t("home.project-name") }}</label>
          <InputText v-model="newProjectName" class="w-full" size="small" />
        </div>

        <div class="dialog-footer">
          <Button :disabled="!canCreateProject" size="small" @click="onNewProjectCreation">{{
            $t("home.create-project")
          }}</Button>
        </div>
      </div>
    </Dialog>

    <Menu ref="workflowMenu" :model="workflowMenuItems" :popup="true" />
    <Menu ref="importMenu" :model="importMenuItems" :popup="true" />
    <ReleaseFlowWizard
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
        <label>{{ $t("home.new-project-name") }}</label>
        <InputText v-model="renameProjectName" class="w-full" />
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
import { computed, ref, watchEffect, inject, watch, onMounted } from "vue";
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
import Layout from "../components/Layout.vue";
import { useI18n } from "vue-i18n";
import { useAuth } from "@renderer/store/auth";
import Skeleton from "primevue/skeleton";
import ConfirmDialog from "primevue/confirmdialog";
import { useConfirm } from "primevue/useconfirm";
import Message from "primevue/message";
import Tag from "primevue/tag";
import IconField from "primevue/iconfield";
import InputIcon from "primevue/inputicon";
import ReleaseFlowWizard from "@renderer/components/ReleaseFlowWizard.vue";
import { partitionWorkflowLoads } from "./workflow-load-state";
import { getDashboardDisplayState } from "./dashboard-state";

const router = useRouter();
const api = useAPI();
const openUpgradeDialog = inject(OpenUpgradeDialogKey)!;
const openMigrationModal = inject(OpenMigrationModalKey);
const confirm = useConfirm();
const toast = useToast();
const appStore = useAppStore();


// Table data
const fileStore = useFiles();
const { files } = storeToRefs(fileStore);
const {
  update: updateFileStore,
  removeProject,
  removeWorkflow,
  load: reloadFiles,
} = fileStore;

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

const canCreateProject = computed(() => {
  return newProjectName.value !== undefined && newProjectName.value.length > 0;
});

const { t } = useI18n();
const notifyPersistenceError = (error: unknown) =>
  toast.add({
    severity: "error",
    summary: t("base.error"),
    detail: error instanceof Error ? error.message : String(error),
    life: 5000,
  });

const isLoading = ref(false);

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

watchEffect(async () => {
  const revision = ++workflowLoadRevision;
  isLoading.value = true;
  const entries = workflows.value.map((flow) => ({ ...flow }));
  const results = await Promise.all(
    entries.map((flow) =>
      api.execute("workflow:load", { workflowId: flow.id, projectId: flow.project }),
    ),
  );
  if (revision !== workflowLoadRevision) return;
  const partitioned = partitionWorkflowLoads(entries, results);
  workflowsEnhanced.value = partitioned.loaded;
  brokenWorkflows.value = partitioned.broken;
  isLoading.value = false;
});

watch(
  [projects, selectedKey],
  ([newProjects, newSelectedKey]) => {
    // Automatically select the first project if nothing is selected
    if (Object.keys(newSelectedKey).length === 0 && newProjects.length > 0) {
      const firstProjectId = newProjects[0].id;
      selectedKey.value = { [firstProjectId]: true };
    }
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
onMounted(() => {
  void reloadFiles(true).catch(notifyPersistenceError);
});
const onNewProjectCreation = async () => {
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
/* ─── Index Page ────────────────────────────────────────── */
.index {
  display: flex;
  flex-direction: column;
  overflow: auto;
  height: 100%;
  width: 100%;
}

/* ─── Main Layout (Drawer + Content) ────────────────────── */
.main-layout {
  display: flex;
  flex-direction: row;
  height: 100%;
  width: 100%;
}

/* ─── Project Drawer ────────────────────────────────────── */
.drawer {
  width: 240px;
  flex: 0 0 240px;
  border-right: 1px solid var(--p-surface-200);
  background: var(--p-surface-0);
  display: flex;
  flex-direction: column;

  :root.dark & {
    border-right-color: var(--p-surface-700);
    background: var(--p-surface-950);
  }

  .project-header {
    padding: 12px 12px 6px;
    display: flex;
    flex-direction: row;
    align-items: center;
    justify-content: space-between;

    .project-text {
      font-size: 0.8rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--p-text-muted-color);
      display: flex;
      align-items: center;
      height: 28px;
      line-height: 1;
    }

    .project-header-actions {
      display: flex;
      gap: 4px;
    }

    :deep(.drawer-header-icon-btn) {
      width: 28px;
      height: 28px;
      padding: 0;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      border-radius: 8px;
    }
  }

  .project-list {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 0 12px;
    overflow: auto;
    flex: 1;
  }

  .project-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 6px 10px;
    border-radius: 8px;
    font-size: 0.825rem;
    font-weight: 500;
    color: var(--p-text-muted-color);
    cursor: pointer;
    transition: all 0.15s ease;
    user-select: none;

    &:hover {
      background: var(--p-surface-200);
      color: var(--p-text-color);

      :root.dark & {
        background: var(--p-surface-800);
      }
    }

    &.active {
      background: var(--p-surface-200);
      color: var(--p-text-color);
      font-weight: 600;

      :root.dark & {
        background: var(--p-surface-800);
      }
    }
  }

  .project-item-content {
    display: flex;
    align-items: center;
    gap: 10px;
    min-width: 0;
  }

  .project-icon {
    font-size: 18px;
    flex-shrink: 0;
  }

  .project-label {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .project-item-actions {
    display: flex;
    gap: 2px;
    opacity: 0;
    transition: opacity 0.15s ease;
    flex-shrink: 0;

    :deep(.p-button) {
      width: 24px;
      height: 24px;
      padding: 0;

      i {
        font-size: 14px;
      }
    }
  }

  .project-item:hover .project-item-actions {
    opacity: 1;
  }
}

/* ─── Workflow Content Area ──────────────────────────────── */
.your-projects {
  height: 100%;
  width: 100%;
  display: flex;
  flex-direction: column;
  padding: 16px;
  overflow: auto;
}

/* ─── Projects Header ───────────────────────────────────── */
.projects-header {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  margin-bottom: 12px;
  gap: 12px 16px;
  flex-shrink: 0;
  min-width: 0;
}

.header-left {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
  flex: 0 1 auto;
  margin-right: auto;
}

.project-title {
  font-size: 1.05rem;
  font-weight: 700;
  letter-spacing: -0.02em;
  color: var(--p-text-color);
  margin: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.header-right {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  min-width: 0;
  flex: 0 1 auto;
  justify-content: flex-end;
}

.search-field {
  width: 260px;
  max-width: 100%;
  flex-shrink: 1;
  min-width: 200px;

  @media (max-width: 640px) {
    flex: 1 1 100%;
    width: 100%;
    min-width: 0;
  }

  .search-input {
    width: 100%;
    border-radius: 8px;
    padding-left: 2.25rem !important;
  }
}

.action-buttons {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;

  :deep(.p-button) {
    white-space: nowrap;
  }
}

/* Stack everything vertically on small screens */
@media (max-width: 640px) {
  .projects-header {
    flex-direction: column;
    align-items: stretch;
    gap: 12px;
  }

  .header-left {
    margin-right: 0;
  }

  .header-right {
    justify-content: stretch;
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

/* ─── Mobile: drawer becomes top chips, rows wrap ───────── */
@media (max-width: 860px) {
  .main-layout {
    flex-direction: column;
  }

  .drawer {
    width: 100%;
    flex: 0 0 auto;
    border-right: none;
    border-bottom: 1px solid var(--p-surface-200);

    :root.dark & {
      border-bottom-color: var(--p-surface-700);
    }

    .project-list {
      flex-direction: row;
      overflow-x: auto;
      overflow-y: hidden;
      padding: 0 12px 10px;
    }

    .project-item {
      flex-shrink: 0;
      max-width: 200px;
    }

    .project-item-actions {
      opacity: 1;
    }
  }

  .your-projects {
    padding: 12px;
    overflow-x: hidden;
  }

  .action-buttons {
    width: 100%;

    :deep(.p-button) {
      flex: 1;
      justify-content: center;
      min-height: 40px;
    }
  }

  .workflow-row {
    flex-wrap: wrap;
    gap: 8px;
    padding: 12px;
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
</style>
