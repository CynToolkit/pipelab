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
          <!-- Banner -->
          <Message v-if="isBannerVisible" severity="warn" :closable="false" class="mb-4">
            {{ $t("home.only-internal-supported-notice") }}
          </Message>

          <!-- Header Section -->
          <div class="projects-header">
            <div class="header-left">
              <h2 class="project-title">{{ activeProject?.name }}</h2>
              <span v-if="filteredFilesEnhanced.length > 0" class="pipelines-count">
                {{ filteredFilesEnhanced.length }} pipeline{{
                  filteredFilesEnhanced.length === 1 ? "" : "s"
                }}
              </span>
            </div>

            <!-- Toolbar / Search and Action buttons -->
            <div class="header-right">
              <!-- Search Input -->
              <IconField class="search-field">
                <InputIcon class="pi pi-search" />
                <InputText
                  v-model="searchQuery"
                  placeholder="Search pipelines..."
                  class="search-input"
                  size="small"
                />
              </IconField>

              <!-- Actions -->
              <div class="action-buttons">
                <Button id="tour-new-pipeline" size="small" severity="secondary" @click="openNewProjectDialog">
                  <i class="mdi mdi-plus-circle-outline mr-2"></i>
                  {{ $t("home.new-pipeline") }}
                </Button>
                <Button size="small" severity="secondary" outlined @click="openReleaseFlowWizard">
                  <i class="mdi mdi-rocket-launch-outline mr-2"></i>
                  New release flow
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

          <!-- Empty State (No Pipelines) -->
          <div v-else-if="filesEnhanced.length === 0 && releaseFlowsEnhanced.length === 0" class="no-projects">
            <i class="mdi mdi-folder-open-outline empty-icon"></i>
            <div class="no-pipelines-text">{{ $t("home.no-pipelines-yet") }}</div>
            <Button
              id="tour-new-pipeline-empty"
              severity="secondary"
              variant="outlined"
              @click="openNewProjectDialog"
            >
              <i class="mdi mdi-plus mr-2"></i>
              {{ $t("home.new-pipeline") }}
            </Button>
          </div>

          <!-- No Search Results -->
          <div v-else-if="filteredFilesEnhanced.length === 0 && filteredReleaseFlowsEnhanced.length === 0" class="no-search-results">
            <i class="mdi mdi-magnify-close empty-icon"></i>
            <div class="no-results-text">No pipelines found matching "{{ searchQuery }}"</div>
            <Button text severity="secondary" @click="searchQuery = ''"> Clear search </Button>
          </div>

          <!-- Pipelines List -->
          <div v-else class="pipelines-list">
            <div
              v-for="pipeline in filteredFilesEnhanced"
              :key="pipeline.id"
              class="pipeline-row"
              @click="handleRowClick({ data: pipeline })"
            >
              <!-- Left: Plugin Icons -->
              <div class="pipeline-tech-stack">
                <div class="tech-icons">
                  <PluginIcon
                    v-for="(icon, idx) in getScenarioIcons(pipeline)"
                    :key="idx"
                    width="24px"
                    :icon="icon"
                    class="tech-icon"
                  />
                  <div v-if="getScenarioIcons(pipeline).length === 0" class="empty-tech-icon">
                    <i class="mdi mdi-play-outline"></i>
                  </div>
                </div>
              </div>

              <!-- Center-left: Info -->
              <div class="pipeline-info">
                <div class="pipeline-title-row">
                  <span class="pipeline-name">{{ pipeline.content.name }}</span>
                  <Tag
                    v-if="pipeline.type === 'external'"
                    severity="warn"
                    value="External"
                    v-tooltip.top="shouldMigrate ? $t('home.migrate-warning') : undefined"
                    class="type-tag"
                  />
                </div>
                <div class="pipeline-desc">
                  {{ pipeline.content.description || "No description provided" }}
                </div>
              </div>

              <!-- Right: Timestamp & Action Buttons -->
              <div class="pipeline-meta-actions">
                <span class="pipeline-updated">
                  Updated
                  {{
                    formatLastModified(
                      pipeline.type !== "pipelab-cloud" ? pipeline.lastModified : undefined,
                    )
                  }}
                </span>

                <div class="row-actions" @click.stop>
                  <Button
                    icon="mdi mdi-pencil"
                    text
                    rounded
                    severity="secondary"
                    size="small"
                    v-tooltip.top="'Edit Pipeline'"
                    @click="loadExisting(pipeline.id)"
                  />
                  <Button
                    icon="mdi mdi-dots-vertical"
                    text
                    rounded
                    severity="secondary"
                    size="small"
                    @click="toggleMenu($event, pipeline)"
                  />
                </div>
              </div>
            </div>
            <div v-for="flow in filteredReleaseFlowsEnhanced" :key="flow.id" class="pipeline-row release-flow-row" @click="openReleaseFlow(flow.id)">
              <div class="pipeline-tech-stack release-flow-icon"><i class="mdi mdi-rocket-launch-outline"></i></div>
              <div class="pipeline-info"><div class="pipeline-title-row"><span class="pipeline-name">{{ flow.content.name }}</span><Tag severity="info" value="Release flow" class="type-tag" /></div><div class="pipeline-desc">{{ flow.content.source.type === 'construct3' ? 'Construct 3' : 'Built folder' }} → {{ flow.content.destinations.map(destinationLabel).join(', ') }}</div></div>
              <div class="pipeline-meta-actions"><span class="pipeline-updated">Updated {{ formatLastModified(flow.lastModified) }}</span><div class="row-actions" @click.stop><Button icon="mdi mdi-pencil" text rounded severity="secondary" size="small" v-tooltip.top="'Edit release flow'" @click="openReleaseFlow(flow.id)" /><Button icon="mdi mdi-dots-vertical" text rounded severity="secondary" size="small" @click="toggleReleaseMenu($event, flow)" /></div></div>
            </div>
          </div>
        </div>
      </div>
    </Layout>

    <!-- <div class="last-scenarios">
        <div class="list-header">Recent scenarios</div>
        <div class="scenarios">
          <ScenarioListItemRecent
            @click="loadRecent($event)"
            v-for="(recent) in recents"
            :item="recent"
          ></ScenarioListItemRecent>
        </div>
      </div> -->

    <!-- <div class="examples">
        <div class="list-header">Examples</div>
        <div class="scenarios">
          <ScenarioListItem
            @click="load(preset.data)"
            v-for="(preset) in presets"
            :scenario="preset.data"
            no-delete-btn
          >
          </ScenarioListItem>
        </div>
      </div> -->

    <Dialog
      v-model:visible="isNewProjectModalVisible"
      modal
      :style="{ width: '400px', maxWidth: '90vw' }"
      :pt="{ root: { class: 'new-pipeline-dialog' } }"
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

    <Dialog
      v-model:visible="isNewPipelineModalVisible"
      modal
      :style="{ width: '480px', maxWidth: '95vw' }"
      :pt="{ root: { class: 'new-pipeline-dialog' } }"
    >
      <template #header>
        <div class="flex flex-column w-full">
          <p class="dialog-title">{{ $t("home.new-pipeline") }}</p>
        </div>
      </template>

      <div class="new-pipeline">
        <div class="form-section">
          <label class="form-label">{{ $t("home.pipeline-name") }}</label>
          <InputText
            v-model="newProjectName"
            class="w-full"
            placeholder="My awesome pipeline"
            size="small"
          />
        </div>

        <div class="form-section">
          <label class="form-label">Description <span class="optional">(optional)</span></label>
          <Textarea
            v-model="newProjectDescription"
            class="w-full"
            rows="2"
            placeholder="Describe what this pipeline does..."
          />
        </div>

        <div v-if="false" class="field-checkbox mb-2 flex align-items-center">
          <Checkbox
            v-model="isCloudProject"
            binary
            input-id="cloudProject"
            :disabled="!hasCloudSaveBenefit"
          />
          <label for="cloudProject" class="cursor-pointer ml-2 flex align-items-center">
            {{ $t("home.store-project-on-the-cloud") }}
            <i
              v-if="!hasCloudSaveBenefit"
              v-tooltip="$t('home.premium-feature')"
              class="mdi mdi-crown text-yellow-500 ml-2"
            ></i>
          </label>
        </div>

        <!-- Internal storage doesn't need path input -->
        <!-- <div v-if="newPipelineType && newPipelineType.value === 'local'" class="location">
          <FileInput
            v-model="newProjectLocalLocation"
            :default-path="newProjectNamePathified"
          ></FileInput>
        </div> -->

        <div v-if="isDevMode" class="field-checkbox mb-3 flex align-items-center">
          <Checkbox v-model="isAdminExternal" binary input-id="adminExternal" />
          <label
            for="adminExternal"
            class="cursor-pointer ml-2 flex align-items-center text-orange-500 font-bold"
          >
            Create External Pipeline (Admin Testing Only)
          </label>
        </div>

        <div v-if="isAdminExternal" class="form-section mb-3">
          <label class="form-label text-orange-500 font-bold"
            >External File Location (Admin Only)</label
          >
          <FileInput
            v-model="newProjectLocalLocation"
            :default-path="newProjectNamePathified"
          ></FileInput>
        </div>

        <div class="presets-section">
          <label class="form-label">Template</label>
          <div class="presets">
            <div v-if="newProjectData">
              <div :class="{ active: true }" class="preset">
                <div class="preset-content">
                  <div class="preset-title">{{ newProjectData.name }}</div>
                  <div class="preset-description">{{ newProjectData.description }}</div>
                </div>
                <i class="mdi mdi-check-circle preset-check"></i>
              </div>
            </div>
            <template v-else>
              <div
                v-for="(preset, key) of newPipelinePresets"
                :key="key"
                :class="{ active: newProjectPreset === key, disabled: preset.disabled }"
                class="preset"
                @click="newProjectPreset = key"
              >
                <div class="preset-content">
                  <div class="preset-title">
                    {{ preset.data.name }}
                    <i
                      v-if="preset.hightlight"
                      v-tooltip="'Recommended'"
                      class="mdi mdi-star-circle-outline preset-star"
                    ></i>
                  </div>
                  <div class="preset-description">{{ preset.data.description }}</div>
                </div>
                <i v-if="newProjectPreset === key" class="mdi mdi-check-circle preset-check"></i>
              </div>
            </template>
          </div>
        </div>

        <div class="dialog-footer">
          <Button
            v-if="newProjectData"
            :disabled="!canCreatePipeline"
            size="small"
            @click="onNewFileCreation(newProjectData)"
            >{{ $t("home.duplicate-pipeline") }}</Button
          >
          <Button v-else :disabled="!canCreatePipeline" size="small" @click="onNewFileCreation()">{{
            $t("home.create-pipeline")
          }}</Button>
        </div>
      </div>
    </Dialog>

    <BuildHistoryDialog
      v-model:visible="showBuildHistoryDialog"
      :pipeline-id="selectedPipelineId"
      @hide="showBuildHistoryDialog = false"
    />

    <Menu ref="menu" :model="menuItems" :popup="true" />
    <Menu ref="importMenu" :model="importMenuItems" :popup="true" />
    <ReleaseFlowWizard v-model:visible="isReleaseFlowWizardVisible" :project-id="activeProjectId" @create="createReleaseFlow" />

    <Dialog
      v-model:visible="isTransferModalVisible"
      modal
      :style="{ width: '400px', maxWidth: '90vw' }"
    >
      <template #header>
        <p class="text-xl font-bold">{{ $t("home.transfer") }}</p>
      </template>
      <div class="flex flex-column gap-2">
        <label>{{ $t("home.select-project") }}</label>
        <Select
          v-model="selectedTargetProject"
          :options="availableProjectsForTransfer"
          option-label="label"
          option-value="value"
          class="w-full"
        />
      </div>
      <template #footer>
        <Button label="Cancel" text severity="secondary" @click="isTransferModalVisible = false" />
        <Button label="Transfer" :disabled="!selectedTargetProject" @click="performTransfer" />
      </template>
    </Dialog>
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
import {
  EnhancedFile,
  SavedFile,
  Preset,
  savedFileMigrator,
  AppConfig,
  MigrationChannel,
  ReleaseFlow,
} from "@pipelab/shared";
import { nanoid } from "nanoid";
import { useRouter } from "vue-router";
import { OpenMigrationModalKey, OpenUpgradeDialogKey } from "../utils/injection-keys";
import { useAPI } from "@renderer/composables/api";
import { useFiles } from "@renderer/store/files";
import { loadExternalFile } from "@renderer/utils/config";
import Tree from "primevue/tree";
import { useTour } from "@renderer/composables/useTour";

import { Presets } from "@pipelab/shared";
import FileInput from "@renderer/components/FileInput.vue";
import { PROJECT_EXTENSION } from "@renderer/models/constants";
import { kebabCase } from "change-case";

import PluginIcon from "../components/nodes/PluginIcon.vue";
import { useAppStore } from "@renderer/store/app";
import { useAppSettings } from "@renderer/store/settings";
import Layout from "../components/Layout.vue";
import { useI18n } from "vue-i18n";
import { useAuth } from "@renderer/store/auth";
import BuildHistoryDialog from "@renderer/components/BuildHistoryDialog.vue";
import Skeleton from "primevue/skeleton";
import ConfirmDialog from "primevue/confirmdialog";
import { useConfirm } from "primevue/useconfirm";
import type { TreeNode } from "primevue/treenode";
import Message from "primevue/message";
import { SaveLocation, SaveLocationExternal, SaveLocationInternal } from "@pipelab/shared";
import { usePipeline } from "@renderer/composables/usePipeline";
import { usePostHog } from "@renderer/composables/usePostHog";
import Tag from "primevue/tag";
import IconField from "primevue/iconfield";
import InputIcon from "primevue/inputicon";
import Textarea from "primevue/textarea";
import ReleaseFlowWizard from "@renderer/components/ReleaseFlowWizard.vue";

const router = useRouter();
const api = useAPI();
const openUpgradeDialog = inject(OpenUpgradeDialogKey)!;
const openMigrationModal = inject(OpenMigrationModalKey);
const confirm = useConfirm();
const toast = useToast();
const { posthog } = usePostHog();
const settingsStore = useAppSettings();
const appStore = useAppStore();
const { settings } = storeToRefs(settingsStore);
const { updateSettings } = settingsStore;

const { startTour: triggerTour, isCompleted } = useTour("dashboard");

// Table data
const fileStore = useFiles();
const { files } = storeToRefs(fileStore);
const { update: updateFileStore, remove, removeProject, transferPipeline } = fileStore;

const filesEnhanced = ref<EnhancedFile[]>([]);
const releaseFlowsEnhanced = ref<Array<{ id: string; project: string; lastModified: string; content: ReleaseFlow }>>([]);
const isReleaseFlowWizardVisible = ref(false);

const searchQuery = ref("");
const newProjectDescription = ref("");

const filteredFilesEnhanced = computed(() => {
  if (!searchQuery.value) return filesEnhanced.value;
  const query = searchQuery.value.toLowerCase();
  return filesEnhanced.value.filter((file) => {
    return (
      file.content.name?.toLowerCase().includes(query) ||
      file.content.description?.toLowerCase().includes(query)
    );
  });
});

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

const { createPipeline } = usePipeline();

const shouldMigrate = true; // TODO:

// Icon logic adapted from ScenarioListItem
function getScenarioIcons(pipeline: EnhancedFile) {
  const p = createPipeline(pipeline);

  return p.getIcons();
}

const canCreatePipeline = computed(() => {
  if (newProjectData.value) {
    return newProjectName.value !== undefined && newProjectName.value.length > 0;
  }
  return (
    newProjectPreset.value !== undefined &&
    newProjectName.value !== undefined &&
    newProjectName.value.length > 0
  );
});

const canCreateProject = computed(() => {
  return newProjectName.value !== undefined && newProjectName.value.length > 0;
});

const { t } = useI18n();

const isLoading = ref(false);

const selectedKey = ref<Record<string, boolean>>({});
const activeProjectId = computed(() => Object.keys(selectedKey.value)[0]);
const activeProject = computed(() =>
  activeProjectId.value
    ? projects.value.find((project) => project.id === activeProjectId.value)
    : undefined,
);
const projects = computed(() => files.value.projects);

const pipelines = computed(() =>
  activeProjectId.value
    ? (files.value.pipelines || []).filter((pipeline) => pipeline.project === activeProjectId.value)
    : [],
);

const releaseFlows = computed(() => activeProjectId.value ? (files.value.releaseFlows || []).filter((flow) => flow.project === activeProjectId.value) : []);
const filteredReleaseFlowsEnhanced = computed(() => { const q = searchQuery.value.trim().toLowerCase(); return !q ? releaseFlowsEnhanced.value : releaseFlowsEnhanced.value.filter((flow) => flow.content.name.toLowerCase().includes(q) || (flow.content.description || '').toLowerCase().includes(q)); });

const hasExternalPipelines = computed(() => {
  return (files.value.pipelines || []).some((p) => p.type === "external");
});

const isBannerVisible = computed(() => {
  return hasExternalPipelines.value;
});

const onNodeUnselect = (node: TreeNode) => {
  console.log("onNodeUnselect", node);
};

const selectProject = (id: string) => {
  selectedKey.value = { [id]: true };
};

const nodes = computed<TreeNode[]>(() => {
  return projects.value.map((file) => {
    // const children = Object.entries(file.data).map(([pipelineId, pipeline]) => {
    //   return {
    //     key: pipelineId,
    //     label: pipelineId,
    //     children: []
    //   } satisfies TreeNode
    // })

    return {
      key: file.id,
      label: file.name,
      // children
    } satisfies TreeNode;
  });
});

// When pipelines are loaded
watchEffect(async () => {
  isLoading.value = true;

  const result: EnhancedFile[] = [];

  // for each pipeline file
  for (const file of pipelines.value) {
    let fileContent: SavedFile | undefined;

    // When external (@deprecated)
    if (file.type === "external") {
      const configResult = await api.execute("pipeline:load-by-path", { path: file.path });

      if (configResult.type === "error") {
        console.error("Unable to load file", configResult.ipcError);
        // ... filtering logic ...
        const filePath = file.path;
        const foundPipeline = (files.value.pipelines || []).find((value) => {
          if (value.type === "external") {
            return value.path === filePath;
          }
          return false;
        });
        if (foundPipeline) {
          updateFileStore((state) => {
            state.pipelines = (state.pipelines || []).filter(
              (value) => value.id !== foundPipeline.id,
            );
          });
        }
        continue;
      }

      const result = configResult.result;
      fileContent = result;
    } else if (file.type === "internal") {
      // Load internal file
      const configResult = await api.execute("pipeline:load-by-name", { name: file.configName });
      if (configResult.type === "success") {
        fileContent = configResult.result;
      } else {
        console.error("Failed to load internal file", configResult);
        continue;
      }
    } else if (file.type === "pipelab-cloud") {
      // Cloud loading not implemented yet
      continue;
    } else {
      throw new Error(t("home.invalid-file-type"));
    }

    if (!fileContent) {
      continue;
    }
    const content = fileContent;

    if (file.type === "external") {
      result.push({
        lastModified: file.lastModified,
        path: file.path,
        summary: file.summary,
        type: file.type,
        id: file.id,
        content: content,
        project: file.project,
      });
    } else if (file.type === "internal") {
      result.push({
        lastModified: file.lastModified,
        type: file.type,
        id: file.id,
        content: content,
        project: file.project,
        configName: file.configName,
      });
    }
  }

  filesEnhanced.value = result;
  isLoading.value = false;
});

watchEffect(async () => {
  const result: Array<{ id: string; project: string; lastModified: string; content: ReleaseFlow }> = [];
  for (const flow of releaseFlows.value) {
    const loaded = await api.execute("release-flow:load-by-name", { name: flow.configName });
    if (loaded.type === "success") result.push({ id: flow.id, project: flow.project, lastModified: flow.lastModified, content: loaded.result as ReleaseFlow });
  }
  releaseFlowsEnhanced.value = result;
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
const { hasCloudSaveBenefit, hasBuildHistoryBenefit, hasMultipleProjectsBenefit } =
  storeToRefs(authStore);

const isCloudProject = ref(false);

const newProjectPreset = ref<string>();
const newPipelinePresets = ref<Presets>({});

const newProjectData = ref<Preset>();

/**
 * Open new project dialog
 */
const openNewProjectDialog = async () => {
  newProjectName.value = "";
  newProjectDescription.value = "";
  newProjectPreset.value = undefined;
  newProjectData.value = undefined;

  // find presets
  const presetsResult = await api.execute("presets:get");

  if (presetsResult.type === "error") {
    throw new Error(presetsResult.ipcError);
  }

  newPipelinePresets.value = presetsResult.result;

  // show dialog
  isNewPipelineModalVisible.value = true;
};

const openReleaseFlowWizard = () => { isReleaseFlowWizardVisible.value = true; };
const createReleaseFlow = async (flow: ReleaseFlow) => {
  await fileStore.saveReleaseFlow(flow);
  await router.push(`/release-flows/${flow.id}/${flow.project}`);
};
const openReleaseFlow = (id: string) => router.push(`/release-flows/${id}/${activeProjectId.value}`);
const toggleReleaseMenu = (_event: Event, _flow: any) => { /* lifecycle actions land in the flow editor menu */ };
const destinationLabel = (d: ReleaseFlow["destinations"][number]) => d.type === "web" ? "Web folder" : d.type === "steam" ? "Steam" : "Itch.io";
const onNewProjectCreation = async () => {
  const projectId = nanoid();
  updateFileStore((state) => {
    state.projects.push({
      id: projectId,
      name: newProjectName.value,
      description: "",
    });
  });
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
    updateFileStore((state) => {
      const project = state.projects.find((p) => p.id === projectToRenameId.value);
      if (project) {
        project.name = renameProjectName.value;
      }
    });
    isRenameProjectModalVisible.value = false;
    projectToRenameId.value = null;
  }
};

const onNewFileCreation = async (preset?: Preset) => {
  const pipelineId = nanoid();

  const actualPreset =
    preset ??
    (newProjectPreset.value ? newPipelinePresets.value[newProjectPreset.value]?.data : undefined);

  if (!actualPreset) {
    throw new Error(t("home.invalid-preset"));
  }

  const projectId = activeProject.value?.id;
  if (!projectId) {
    return;
  }
  let pathOrConfigName = "";
  let type: SaveLocation["type"] = isCloudProject.value ? "pipelab-cloud" : "internal";

  if (isAdminExternal.value) {
    type = "external";
  }

  if (type === "internal") {
    pathOrConfigName = `pipelines/${pipelineId}`;
  } else if (type === "external") {
    pathOrConfigName = newProjectLocalLocation.value;
    if (!pathOrConfigName) {
      toast.add({
        severity: "error",
        summary: t("base.error"),
        detail: "Please choose a location to save the external file",
        life: 3000,
      });
      return;
    }
  }

  const updatedPreset: Preset = {
    ...actualPreset,
    name: newProjectName.value,
    description: newProjectDescription.value,
  } satisfies Preset;

  // write file
  if (type === "internal") {
    await api.execute("pipeline:save-by-name", {
      name: pathOrConfigName,
      data: JSON.stringify(updatedPreset),
    });
  } else if (type === "external") {
    await api.execute("fs:write", {
      path: pathOrConfigName,
      content: JSON.stringify(updatedPreset, null, 2),
    });
  } else if (type === "pipelab-cloud") {
    // TODO:
  }

  // update file store
  updateFileStore((state) => {
    state.pipelines = state.pipelines || [];
    if (type === "internal") {
      state.pipelines.push({
        lastModified: new Date().toISOString(),
        configName: pathOrConfigName,
        type: "internal",
        project: projectId,
        id: pipelineId,
      });
    } else if (type === "pipelab-cloud") {
      state.pipelines.push({
        type: "pipelab-cloud",
        project: projectId,
        id: pipelineId,
      });
    } else {
      state.pipelines.push({
        lastModified: new Date().toISOString(),
        path: pathOrConfigName,
        summary: {
          description: newProjectDescription.value,
          name: newProjectName.value,
          plugins: [],
        },
        type: "external",
        project: projectId,
        id: pipelineId,
      });
    }
  });

  newProjectName.value = "";
  newProjectDescription.value = "";
  newProjectLocalLocation.value = "";
  isAdminExternal.value = false;

  await router.push({
    name: "Editor",
    params: {
      pipelineId: pipelineId,
      projectId: projectId,
    },
  });
};

const loadExisting = async (id: string) => {
  // Find the file to check its type
  const enhancedFile = filesEnhanced.value.find((f) => f.id === id);
  if (!enhancedFile) {
    return;
  }

  const projectId = enhancedFile.project;

  await router.push({
    name: "Editor",
    params: {
      pipelineId: id,
      projectId: projectId,
    },
  });
};

const handleRowClick = (event: any) => {
  console.log("event", event);
  loadExisting(event.data.id);
};

const deletePipeline = async (id: string) => {
  confirm.require({
    message: "Are you sure you want to delete this pipeline? This action cannot be undone.",
    header: "Delete Pipeline",
    icon: "pi pi-exclamation-triangle",
    rejectClass: "p-button-secondary p-button-outlined",
    acceptClass: "p-button-danger",
    accept: async () => {
      await remove(id);
    },
    reject: () => {
      // do nothing
    },
  });
};

const deleteProject = async (projectId?: string) => {
  const id = projectId || activeProjectId.value;
  if (!id) return;

  const projectPipelines = (files.value.pipelines || []).filter(
    (pipeline) => pipeline.project === id,
  );

  if (projectPipelines.length > 0) {
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
      await removeProject(id);
    },
    reject: () => {
      // do nothing
    },
  });
};

const menu = ref();
const selectedPipelineForMenu = ref<EnhancedFile | null>(null);
const isTransferModalVisible = ref(false);
const selectedTargetProject = ref();

const toggleMenu = (event: Event, data: EnhancedFile) => {
  selectedPipelineForMenu.value = data;
  menu.value.toggle(event);
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
      {
        label: t("home.import-pipeline-file"),
        icon: "mdi mdi-file-import-outline",
        command: () => {
          importPipeline();
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
    {
      label: t("home.import-pipeline-file"),
      icon: "mdi mdi-file-import-outline",
      command: () => {
        importPipeline();
      },
    },
  ];
});

const menuItems = computed(() => [
  {
    label: t("home.build-history"),
    icon: "mdi mdi-history",
    command: () => {
      if (selectedPipelineForMenu.value) viewProjectBuildHistory(selectedPipelineForMenu.value);
    },
    visible: hasBuildHistoryBenefit.value,
  },
  {
    label: t("home.duplicate"),
    icon: "mdi mdi-content-copy",
    command: () => {
      if (selectedPipelineForMenu.value) duplicateProject(selectedPipelineForMenu.value.content);
    },
  },
  {
    label: t("home.export-pipeline"),
    icon: "mdi mdi-file-export-outline",
    command: () => {
      if (selectedPipelineForMenu.value) exportPipeline(selectedPipelineForMenu.value);
    },
  },
  {
    label: t("home.migrate-to-internal"),
    icon: "mdi mdi-folder-move",
    command: () => {
      if (selectedPipelineForMenu.value) migratePipeline(selectedPipelineForMenu.value);
    },
    visible: shouldMigrate === true && selectedPipelineForMenu.value?.type === "external",
  },
  {
    label: t("home.transfer"),
    icon: "mdi mdi-folder-move",
    command: () => {
      openTransferDialog();
    },
    visible: projects.value.length > 1,
  },
  {
    separator: true,
  },
  {
    label: t("base.delete"),
    icon: "mdi mdi-delete",
    class: "text-red-500",
    command: () => {
      if (selectedPipelineForMenu.value) deletePipeline(selectedPipelineForMenu.value.id);
    },
  },
]);

const openTransferDialog = () => {
  isTransferModalVisible.value = true;
  selectedTargetProject.value = null;
};

const performTransfer = async () => {
  if (selectedPipelineForMenu.value && selectedTargetProject.value) {
    await transferPipeline(selectedPipelineForMenu.value.id, selectedTargetProject.value.id);
    isTransferModalVisible.value = false;
    toast.add({
      severity: "success",
      summary: t("home.transfer-successful"),
      detail: t("home.pipeline-transferred"),
      life: 3000,
    });
  }
};

const availableProjectsForTransfer = computed(() => {
  return projects.value
    .filter((p) => p.id !== activeProject.value?.id)
    .map((p) => ({ label: p.name, value: p }));
});

const duplicateProject = async (file: Preset) => {
  console.log("file", file);
  newProjectName.value = file.name + " (copy)";
  newProjectData.value = file;
  isNewPipelineModalVisible.value = true;
};

const migratePipeline = async (file: EnhancedFile) => {
  confirm.require({
    message: t("home.confirm-migration-message"),
    header: t("home.migrate-pipeline"),
    icon: "pi pi-info-circle",
    rejectClass: "p-button-secondary p-button-outlined",
    acceptClass: "p-button-primary",
    accept: async () => {
      const newConfigName = `pipelines/${nanoid()}`;

      // Save content to internal config
      await api.execute("pipeline:save-by-name", {
        name: newConfigName,
        data: JSON.stringify(file.content),
      });

      // Update store: replace external pipeline definition with internal one
      updateFileStore((state) => {
        state.pipelines = state.pipelines || [];
        const index = state.pipelines.findIndex((p) => p.id === file.id);
        if (index !== -1) {
          state.pipelines[index] = {
            id: file.id,
            project: file.project,
            lastModified: new Date().toISOString(),
            type: "internal",
            configName: newConfigName,
          };
        }
      });

      toast.add({
        severity: "success",
        summary: t("base.success"),
        detail: t("home.migration-success"),
        life: 3000,
      });
    },
  });
};

const exportPipeline = async (file: EnhancedFile) => {
  const paths = await api.execute("dialog:showSaveDialog", {
    title: t("home.export-pipeline"),
    properties: ["createDirectory", "showOverwriteConfirmation"],
    filters: [{ name: "Pipelab Project", extensions: [PROJECT_EXTENSION] }],
    defaultPath: `${file.content.name || "pipeline"}.${PROJECT_EXTENSION}`,
  });

  if (paths.type === "error") {
    toast.add({
      severity: "error",
      summary: t("base.error"),
      detail: t("home.export-failed"),
      life: 3000,
    });
    return;
  }

  if (paths.result.canceled || !paths.result.filePath) {
    return;
  }

  let saveLocation = paths.result.filePath;
  if (!saveLocation.endsWith(`.${PROJECT_EXTENSION}`)) {
    saveLocation = `${saveLocation}.${PROJECT_EXTENSION}`;
  }

  const writeResult = await api.execute("fs:write", {
    path: saveLocation,
    content: JSON.stringify(file.content, null, 2),
  });

  if (writeResult.type === "error" || !writeResult.result.ok) {
    toast.add({
      severity: "error",
      summary: t("base.error"),
      detail: t("home.export-failed"),
      life: 3000,
    });
    return;
  }

  toast.add({
    severity: "success",
    summary: t("base.success"),
    detail: t("home.export-success"),
    life: 3000,
  });
};

const importPipeline = async () => {
  const projectId = activeProject.value?.id;
  if (!projectId) {
    return;
  }

  const paths = await api.execute("dialog:showOpenDialog", {
    title: t("home.import-pipeline"),
    filters: [{ name: "Pipelab Project", extensions: [PROJECT_EXTENSION] }],
    properties: ["openFile"],
  });

  if (paths.type === "error" || paths.result.canceled || paths.result.filePaths.length === 0) {
    return;
  }

  const filePath = paths.result.filePaths[0];
  const fileContentResult = await api.execute("fs:read", { path: filePath });

  if (fileContentResult.type === "error") {
    toast.add({
      severity: "error",
      summary: t("base.error"),
      detail: t("home.failed-to-read-file"),
      life: 3000,
    });
    return;
  }

  try {
    const fileDataRaw = JSON.parse(fileContentResult.result.content);

    if (!fileDataRaw || typeof fileDataRaw !== "object" || !("version" in fileDataRaw)) {
      toast.add({
        severity: "error",
        summary: t("base.error"),
        detail: t("editor.invalid-file-content"),
        life: 3000,
      });
      return;
    }

    const originalVersion = fileDataRaw.version || "Unknown";

    // Migrate on frontend to normalize the data before display and save
    const fileData = (await savedFileMigrator.migrate(fileDataRaw)) as SavedFile;

    const blocksCount = fileData.canvas?.blocks?.length || 0;
    const isSimple = fileDataRaw.type === "simple";
    const typeLabel = isSimple ? "Basic Pipeline" : "Advanced Canvas Pipeline";

    const confirmMessage =
      `Are you sure you want to import this pipeline?\n\n` +
      `• Name: ${fileData.name || "Unnamed"}\n` +
      `• Description: ${fileData.description || "No description"}\n` +
      `• Version: ${originalVersion}\n` +
      `• Type: ${typeLabel}` +
      (!isSimple ? `\n• Actions: ${blocksCount} action block(s)` : "");

    confirm.require({
      message: confirmMessage,
      header: "Import Pipeline Confirmation",
      icon: "pi pi-info-circle",
      acceptClass: "p-button-primary",
      rejectClass: "p-button-secondary p-button-outlined",
      accept: async () => {
        try {
          const pipelineId = nanoid();
          const configName = `pipelines/${pipelineId}`;

          // Save migrated file to internal storage
          await api.execute("pipeline:save-by-name", {
            name: configName,
            data: JSON.stringify(fileData),
          });

          // Add to store
          updateFileStore((state) => {
            state.pipelines = state.pipelines || [];
            state.pipelines.push({
              lastModified: new Date().toISOString(),
              configName: configName,
              type: "internal",
              project: projectId,
              id: pipelineId,
            });
          });

          toast.add({
            severity: "success",
            summary: t("base.success"),
            detail: t("home.import-success"),
            life: 3000,
          });
        } catch (err) {
          toast.add({
            severity: "error",
            summary: t("base.error"),
            detail: t("editor.invalid-file-content"),
            life: 3000,
          });
        }
      },
    });
  } catch (err) {
    toast.add({
      severity: "error",
      summary: t("base.error"),
      detail: t("editor.invalid-file-content"),
      life: 3000,
    });
  }
};

const viewProjectBuildHistory = async (file: EnhancedFile) => {
  selectedPipelineId.value = file.id;
  showBuildHistoryDialog.value = true;
};

const isNewPipelineModalVisible = ref(false);
const isNewProjectModalVisible = ref(false);

const isAdminExternal = ref(false);
const newProjectLocalLocation = ref("");
const isDevMode = computed(() => process.env.NODE_ENV === "development");
const newProjectNamePathified = computed(() => {
  return `${newProjectName.value || "pipeline"}`;
});

// Build history dialog state
const showBuildHistoryDialog = ref(false);
const selectedPipelineId = ref<string>();

const startTour = (force = false) => {
  triggerTour(
    [
      {
        element: "#tour-projects-list",
        popover: {
          title: t("tour.projects-list-title"),
          description: t("tour.projects-list-description"),
        },
      },
      {
        element: "#tour-add-project",
        popover: {
          title: t("tour.add-project-title"),
          description: t("tour.add-project-description"),
        },
      },
      {
        element: "#tour-rename-project, #tour-delete-project",
        popover: {
          title: t("tour.project-actions-title"),
          description: t("tour.project-actions-description"),
        },
      },
      {
        element: "#tour-new-pipeline, #tour-new-pipeline-empty",
        popover: {
          title: t("tour.new-pipeline-title"),
          description: t("tour.new-pipeline-description"),
        },
      },
    ],
    force,
  );
};
</script>

<style lang="scss" scoped>
.release-flow-row { border-left: 3px solid var(--primary-color); background: color-mix(in srgb, var(--primary-color) 4%, transparent); }
.release-flow-row:hover { background: color-mix(in srgb, var(--primary-color) 9%, transparent); }
.release-flow-icon { color: var(--primary-color); font-size: 24px; display:flex; justify-content:center; }
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

/* ─── Pipeline Content Area ─────────────────────────────── */
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

.pipelines-count {
  font-size: 0.8rem;
  font-weight: 500;
  color: var(--p-text-muted-color);
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

/* ─── Pipelines List ────────────────────────────────────── */
.pipelines-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  flex: 1;
}

.pipeline-row {
  display: flex;
  align-items: center;
  padding: 8px 12px;
  background: var(--p-surface-0);
  border: 1px solid var(--p-surface-200);
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  position: relative;
  overflow: hidden;

  :root.dark & {
    background: var(--p-surface-900);
    border-color: var(--p-surface-800);
  }

  &:hover {
    border-color: var(--p-surface-300);

    :root.dark & {
      background: var(--p-surface-850);
      border-color: var(--p-surface-700);
    }

    .row-actions {
      opacity: 1;
    }
  }
}

/* ─── Tech Stack Icons ──────────────────────────────────── */
.pipeline-tech-stack {
  margin-right: 20px;
  flex-shrink: 0;
}

.tech-icons {
  display: flex;
  align-items: center;
  gap: 4px;
  background: var(--p-surface-50);
  padding: 2px 6px;
  border-radius: 6px;
  border: 1px solid var(--p-surface-100);
  min-height: 28px;

  :root.dark & {
    background: var(--p-surface-950);
    border-color: var(--p-surface-800);
  }
}

.tech-icon {
  flex-shrink: 0;
}

.empty-tech-icon {
  color: var(--p-text-muted-color);
  font-size: 1.1rem;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
}

/* ─── Pipeline Info ─────────────────────────────────────── */
.pipeline-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding-right: 16px;
}

.pipeline-title-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.pipeline-name {
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

.pipeline-desc {
  font-size: 0.75rem;
  color: var(--p-text-muted-color);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* ─── Pipeline Meta & Actions ───────────────────────────── */
.pipeline-meta-actions {
  display: flex;
  align-items: center;
  gap: 16px;
  flex-shrink: 0;
}

.pipeline-updated {
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

  .no-pipelines-text,
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

/* ─── New Pipeline Dialog ──────────────────────────────── */
.new-pipeline-dialog {
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

.new-pipeline {
  display: flex;
  flex-direction: column;
  gap: 14px;
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

.presets-section {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.presets {
  display: flex;
  flex-direction: column;
  gap: 6px;

  .preset {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    border: 1px solid var(--p-surface-200);
    border-radius: 8px;
    padding: 10px 12px;
    background: var(--p-surface-0);
    transition: all 0.15s ease;
    cursor: pointer;
    min-height: 52px;

    :root.dark & {
      border-color: var(--p-surface-700);
      background: var(--p-surface-850);
    }

    &:hover {
      border-color: var(--p-surface-300);

      :root.dark & {
        border-color: var(--p-surface-600);
      }
    }

    &.active {
      border-color: var(--p-primary-color);
      background: color-mix(in srgb, var(--p-primary-color) 6%, var(--p-surface-0));

      :root.dark & {
        background: color-mix(in srgb, var(--p-primary-color) 10%, var(--p-surface-850));
      }
    }

    &.disabled {
      pointer-events: none;
      opacity: 0.5;
    }
  }

  .preset-content {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
    flex: 1;
  }

  .preset-title {
    font-size: 0.85rem;
    font-weight: 600;
    color: var(--p-text-color);
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .preset-star {
    font-size: 14px;
    color: #f59e0b;
  }

  .preset-description {
    font-size: 0.75rem;
    color: var(--p-text-muted-color);
    line-height: 1.35;
    overflow: hidden;
    text-overflow: ellipsis;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
  }

  .preset-check {
    font-size: 18px;
    color: var(--p-primary-color);
    flex-shrink: 0;
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

/* ─── Unused legacy (kept for reference) ────────────────── */
.scenarios {
  display: grid;
  grid-template-columns: repeat(1, 1fr);
  grid-template-rows: repeat(1, auto);
  gap: 16px;
}

@media (min-width: 768px) {
  .scenarios {
    grid-template-columns: repeat(2, 1fr);
  }
}

@media (min-width: 1024px) {
  .scenarios {
    grid-template-columns: repeat(3, 1fr);
  }
}

@media (min-width: 1280px) {
  .scenarios {
    grid-template-columns: repeat(4, 1fr);
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

  .pipeline-row {
    flex-wrap: wrap;
    gap: 8px;
    padding: 12px;
  }

  .pipeline-tech-stack {
    margin-right: 0;
  }

  .pipeline-info {
    flex: 1 1 calc(100% - 60px);
    padding-right: 0;
  }

  .pipeline-meta-actions {
    flex: 1 1 100%;
    justify-content: space-between;
  }

  .pipeline-updated {
    font-size: 0.7rem;
  }

  .row-actions {
    opacity: 1;
  }
}
</style>
