<template>
  <div class="index">
    <Toast />
    <ConfirmDialog />
    <Layout>
      <div class="main-layout">
        <div class="drawer">
          <div class="project-header">
            <div class="project-text">
              <i class="mdi mdi-folder mr-2"></i>
              Projects
            </div>
            <div class="flex gap-1">
              <Button
                text
                size="small"
                severity="secondary"
                :disabled="!activeProject"
                @click="openRenameProjectDialog"
              >
                <i class="icon mdi mdi-pencil fs-16"></i>
              </Button>
              <Button
                v-if="hasMultipleProjectsBenefit"
                text
                size="small"
                severity="danger"
                :disabled="!activeProject"
                @click="deleteProject"
              >
                <i class="icon mdi mdi-delete fs-16"></i>
              </Button>
              <Button
                v-tooltip.top="!hasMultipleProjectsBenefit ? $t('home.premium-feature') : undefined"
                text
                size="small"
                @click="onCreateProjectClick"
              >
                <i class="icon mdi mdi-plus fs-16"></i>
              </Button>
            </div>
          </div>
          <Tree
            v-model:selection-keys="selectedKey"
            selection-mode="single"
            :value="nodes"
            class="w-full md:w-[30rem]"
            @node-unselect="onNodeUnselect"
          ></Tree>
        </div>

        <div class="your-projects">
          <div v-if="!isLoading && filesEnhanced.length === 0" class="no-projects">
            <div>{{ $t('home.no-pipelines-yet') }}</div>
            <Button @click="openNewProjectDialog">
              <i class="mdi mdi-plus-circle-outline mr-2"></i>
              {{ $t('home.new-pipeline') }}
            </Button>
          </div>
          <div v-else class="your-projects__table">
            <DataTable
              :value="filesEnhanced"
              data-key="id"
              class="w-full h-full clickable-rows"
              :scrollable="true"
              scroll-height="flex"
              :loading="isLoading"
              @row-click="handleRowClick"
            >
              <template #header>
                <div class="flex justify-content-between">
                  <div class="list-header bold">{{ activeProject.name }}</div>

                  <div class="flex justify-content-end gap-2">
                    <Button @click="openNewProjectDialog">
                      <i class="mdi mdi-plus-circle-outline mr-2"></i>
                      {{ $t('home.new-pipeline') }}
                    </Button>
                    <!-- <Button outlined @click="openFile">
                      <i class="mdi mdi-folder-open-outline mr-2"></i>
                      {{ $t('home.import') }}
                    </Button> -->
                  </div>
                </div>
              </template>
              <Column header="" style="width: 120px">
                <template #body="{ data }">
                  <div class="icons" style="display: flex; gap: 4px">
                    <PluginIcon
                      v-for="(icon, idx) in getScenarioIcons(data)"
                      :key="idx"
                      width="32px"
                      :icon="icon"
                    />
                  </div>
                </template>
                <template #loading>
                  <Skeleton width="32px" height="32px" />
                </template>
              </Column>
              <Column field="content.name" header="Name">
                <template #body="{ data }">
                  <div class="flex align-items-center gap-2">
                    <span>{{ data.content.name }}</span>
                    <i
                      v-if="data.type === 'external' && shouldMigrate === true"
                      v-tooltip.top="$t('home.migrate-warning')"
                      class="mdi mdi-alert-circle text-orange-500"
                    ></i>
                  </div>
                </template>
                <template #loading>
                  <Skeleton width="200px" />
                </template>
              </Column>
              <!-- <Column field="content.description" header="Description" /> -->
              <!-- <Column header="Path">
              <template #body="{ data }">
                <span v-if="data.type === 'external'">{{ data.path }}</span>
              </template>
            </Column> -->
              <Column header="" style="width: 240px">
                <template #body="{ data }">
                  <Button
                    icon="mdi mdi-dots-vertical"
                    text
                    rounded
                    @click.stop="toggleMenu($event, data)"
                  />
                </template>
                <template #loading>
                  <Skeleton width="240px" height="32px" />
                </template>
              </Column>
            </DataTable>
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
      :style="{ width: '75vw' }"
      :breakpoints="{ '575px': '90vw' }"
    >
      <template #header>
        <div class="flex flex-column w-full">
          <p class="text-xl text-center">{{ $t('home.new-project') }}</p>
        </div>
      </template>

      <div class="new-project">
        <div class="grid justify-content-center">
          <div class="col-12 xl:col-6 w-full">
            <div class="h-full w-full">
              <div class="mb-1">{{ $t('home.project-name') }}</div>
              <div class="mb-2">
                <InputText v-model="newProjectName" class="w-full"> </InputText>
              </div>

              <div class="buttons">
                <Button :disabled="!canCreateProject" @click="onNewProjectCreation">{{
                  $t('home.create-project')
                }}</Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Dialog>

    <Dialog
      v-model:visible="isNewPipelineModalVisible"
      modal
      :style="{ width: '75vw' }"
      :breakpoints="{ '575px': '90vw' }"
    >
      <template #header>
        <div class="flex flex-column w-full">
          <p class="text-xl text-center">{{ $t('home.new-pipeline') }}</p>
        </div>
      </template>

      <div class="new-pipeline">
        <div class="grid justify-content-center">
          <div class="col-12 xl:col-6 w-full">
            <div class="h-full w-full">
              <div class="mb-4 flex justify-content-center">
                <SelectButton
                  v-show="hasSimplePipelines"
                  v-model="projectMode"
                  :options="projectModes"
                  option-label="label"
                  option-value="value"
                  :allow-empty="false"
                />
              </div>

              <div class="mb-1">{{ $t('home.pipeline-name') }}</div>
              <div class="mb-2">
                <InputText v-model="newProjectName" class="w-full"> </InputText>
              </div>

              <div v-if="false" class="field-checkbox mb-2 flex align-items-center">
                <Checkbox
                  v-model="isCloudProject"
                  binary
                  input-id="cloudProject"
                  :disabled="!hasCloudSaveBenefit"
                />
                <label for="cloudProject" class="cursor-pointer ml-2 flex align-items-center">
                  {{ $t('home.store-project-on-the-cloud') }}
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

              <div v-if="!isSimpleProjectCreation" class="presets">
                <div v-if="newProjectData">
                  <div :class="{ active: true }" class="preset">
                    <div class="preset-title">{{ newProjectData.name }}</div>
                    <div>{{ newProjectData.description }}</div>
                    <div class="selection-icon">
                      <i class="mdi mdi-check-circle mr-2 fs-24"></i>
                    </div>
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
                    <div class="preset-title">{{ preset.data.name }}</div>
                    <div>{{ preset.data.description }}</div>
                    <div v-if="preset.hightlight" class="highlight-icon">
                      <i class="mdi mdi-star-circle-outline mr-2 fs-24"></i>
                    </div>
                    <div v-if="newProjectPreset === key" class="selection-icon">
                      <i class="mdi mdi-check-circle mr-2 fs-24"></i>
                    </div>
                  </div>
                </template>
              </div>

              <div class="buttons">
                <Button
                  v-if="newProjectData"
                  :disabled="!canCreatePipeline"
                  @click="onNewFileCreation(newProjectData)"
                  >{{ $t('home.duplicate-project') }}</Button
                >
                <Button v-else :disabled="!canCreatePipeline" @click="onNewFileCreation()">{{
                  $t('home.create-project')
                }}</Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Dialog>

    <BuildHistoryDialog
      v-model:visible="showBuildHistoryDialog"
      :pipeline-id="selectedPipelineId"
      @hide="showBuildHistoryDialog = false"
    />

    <Menu ref="menu" :model="menuItems" :popup="true" />

    <Dialog
      v-model:visible="isTransferModalVisible"
      modal
      :style="{ width: '50vw' }"
      :breakpoints="{ '575px': '90vw' }"
    >
      <template #header>
        <p class="text-xl font-bold">{{ $t('home.transfer') }}</p>
      </template>
      <div class="flex flex-column gap-2">
        <label>{{ $t('home.select-project') }}</label>
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
      :style="{ width: '50vw' }"
      :breakpoints="{ '575px': '90vw' }"
    >
      <template #header>
        <p class="text-xl font-bold">{{ $t('home.rename-project') }}</p>
      </template>
      <div class="flex flex-column gap-2">
        <label>{{ $t('home.new-project-name') }}</label>
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
import { computed, ref, watchEffect, inject, watch } from 'vue'
import { useToast } from 'primevue/usetoast'
import { storeToRefs } from 'pinia'
import Menu from 'primevue/menu'
import { EnhancedFile, SavedFile, Preset, savedFileMigrator } from '@@/model'
import { nanoid } from 'nanoid'
import { useRouter } from 'vue-router'
import { useAPI } from '@renderer/composables/api'
import { useFiles } from '@renderer/store/files'
import { loadExternalFile } from '@renderer/utils/config'
import Tree from 'primevue/tree'

import { Presets } from '@@/apis'
import FileInput from '@renderer/components/FileInput.vue'
import { PROJECT_EXTENSION } from '@renderer/models/constants'
import { kebabCase } from 'change-case'

import PluginIcon from '../components/nodes/PluginIcon.vue'
import { useAppStore } from '@renderer/store/app'
import Layout from '../components/Layout.vue'
import { useI18n } from 'vue-i18n'
import { useAuth } from '@renderer/store/auth'
import BuildHistoryDialog from '@renderer/components/BuildHistoryDialog.vue'
import Skeleton from 'primevue/skeleton'
import ConfirmDialog from 'primevue/confirmdialog'
import { useConfirm } from 'primevue/useconfirm'
import { TreeNode } from 'primevue/treenode'
import { SaveLocation, SaveLocationExternal, SaveLocationInternal } from '@@/save-location'
import { usePipeline } from '@renderer/composables/usePipeline'
import { usePostHog } from '@renderer/composables/usePostHog'

const router = useRouter()
const api = useAPI()
const openUpgradeDialog = inject('openUpgradeDialog') as () => void
const confirm = useConfirm()
const toast = useToast()
const { posthog } = usePostHog()

// Table data
const fileStore = useFiles()
const { files } = storeToRefs(fileStore)
const { update: updateFileStore, remove, removeProject, transferPipeline } = fileStore

const filesEnhanced = ref<EnhancedFile[]>([])

const hasSimplePipelines = posthog.isFeatureEnabled('simple-pipeline')
console.log('hasSimplePipelines', hasSimplePipelines)

const { createPipeline } = usePipeline()

const shouldMigrate = false // TODO:

// Icon logic adapted from ScenarioListItem
function getScenarioIcons(pipeline: EnhancedFile) {
  const p = createPipeline(pipeline)

  return p.getIcons()
}

const canCreatePipeline = computed(() => {
  if (newProjectData.value) {
    return newProjectName.value !== undefined && newProjectName.value.length > 0
  }
  return (
    newProjectPreset.value !== undefined &&
    newProjectName.value !== undefined &&
    newProjectName.value.length > 0
  )
})

const canCreateProject = computed(() => {
  return newProjectName.value !== undefined && newProjectName.value.length > 0
})

const { t } = useI18n()

const isLoading = ref(false)

const selectedKey = ref<Record<string, boolean>>({})
const activeProjectId = computed(() => Object.keys(selectedKey.value)[0])
const activeProject = computed(() =>
  activeProjectId.value
    ? projects.value.find((project) => project.id === activeProjectId.value)
    : undefined
)
const projects = computed(() => files.value.projects)

const pipelines = computed(() =>
  activeProjectId.value
    ? files.value.pipelines.filter((pipeline) => pipeline.project === activeProjectId.value)
    : []
)

const onNodeUnselect = (node: TreeNode) => {
  console.log('onNodeUnselect', node)
}

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
      label: file.name
      // children
    } satisfies TreeNode
  })
})

// When pipelines are loaded
watchEffect(async () => {
  isLoading.value = true

  const result: EnhancedFile[] = []

  // for each pipeline file
  for (const file of pipelines.value) {
    let fileContent: string = ''

    // When external
    if (file.type === 'external') {
      const resultLoad = await loadExternalFile(file.path)

      if (resultLoad.type === 'error') {
        console.error('Unable to load file', resultLoad.ipcError)
        const { id } = files.value.pipelines.find((value) => {
          if (value.type === 'internal') {
            if (value.path === file.path) {
              return true
            }
          } else if (value.type === 'external') {
            if (value.path === file.path) {
              return true
            }
          }
          return false
        })
        updateFileStore((state) => {
          state.pipelines = state.pipelines.filter((value) => value.id !== id)
        })
        continue
      }

      const result = resultLoad.result

      if ('content' in result) {
        fileContent = result.content
      } else {
        throw new Error(t('editor.invalid-file-content'))
      }
    } else if (file.type === 'internal') {
      // Load internal file
      const configResult = await api.execute('config:load', { config: file.configName })
      if (configResult.type === 'success') {
        fileContent = JSON.stringify(configResult.result.result)
      } else {
        console.error('Failed to load internal file', configResult)
        continue
      }
    } else if (file.type === 'pipelab-cloud') {
      // Cloud loading not implemented yet
      continue
    } else {
      throw new Error(t('home.invalid-file-type'))
    }

    if (!fileContent) {
      throw new Error(t('editor.invalid-file-content'))
    }

    const _content = JSON.parse(fileContent) as SavedFile

    const content = await savedFileMigrator.migrate(_content)

    console.log('content', content)

    if (file.type === 'external') {
      result.push({
        lastModified: file.lastModified,
        path: file.path,
        summary: file.summary,
        type: file.type,
        id: file.id,
        content: content,
        project: file.project
      })
    } else if (file.type === 'internal') {
      result.push({
        lastModified: file.lastModified,
        type: file.type,
        id: file.id,
        content: content,
        project: file.project,
        configName: file.configName
      })
    }
  }

  filesEnhanced.value = result
  isLoading.value = false
})

watch(
  [projects, selectedKey],
  ([newProjects, newSelectedKey]) => {
    // Automatically select the first project if nothing is selected
    if (Object.keys(newSelectedKey).length === 0 && newProjects.length > 0) {
      const firstProjectId = newProjects[0].id
      selectedKey.value = { [firstProjectId]: true }
    }
  },
  { immediate: true }
)

const newProjectName = ref('')

const authStore = useAuth()
const { hasCloudSaveBenefit, hasBuildHistoryBenefit, hasMultipleProjectsBenefit } =
  storeToRefs(authStore)

const projectMode = ref(hasSimplePipelines ? 'simple' : 'advanced')
console.log('projectMode', projectMode.value)
const isSimpleProjectCreation = computed(() => projectMode.value === 'simple')
const projectModes = computed(() => [
  { label: t('home.simple-pipeline'), value: 'simple' },
  { label: t('home.advanced-pipeline'), value: 'advanced' }
])

watch(projectMode, (mode) => {
  if (mode === 'simple') {
    // Inject and select simple preset
    newPipelinePresets.value['simple'] = {
      data: {
        version: '4.0.0',
        type: 'simple',
        name: 'Simple Pipeline',
        description: 'A simplified editor for quick projects',
        canvas: { blocks: [], triggers: [] },
        variables: [],
        source: { type: 'c3-html', path: '' },
        packaging: { enabled: false },
        publishing: {
          steam: { enabled: false },
          itch: { enabled: false },
          poki: { enabled: false }
        }
      },
      hightlight: true,
      disabled: false
    }
    newProjectPreset.value = 'simple'
  } else {
    // Clear simple preset selection if switching to advanced
    if (newProjectPreset.value === 'simple') {
      newProjectPreset.value = undefined
    }
  }
})

const isCloudProject = ref(false)

const newProjectPreset = ref<string>()
const newPipelinePresets = ref<Presets>({})

const newProjectData = ref<SavedFile>()

/**
 * Open new project dialog
 */
const openNewProjectDialog = async () => {
  newProjectName.value = ''
  projectMode.value = 'advanced' // Default to advanced TODO:

  // find presets
  const presetsResult = await api.execute('presets:get')

  if (presetsResult.type === 'error') {
    throw new Error(presetsResult.ipcError)
  }

  newPipelinePresets.value = presetsResult.result

  // show dialog
  isNewPipelineModalVisible.value = true
}
const onNewProjectCreation = async () => {
  const projectId = nanoid()
  updateFileStore((state) => {
    state.projects.push({
      id: projectId,
      name: newProjectName.value,
      description: ''
    })
  })
  isNewProjectModalVisible.value = false
  // Select the new project
  selectedKey.value = { [projectId]: true }
  newProjectName.value = ''
}

const onCreateProjectClick = () => {
  if (hasMultipleProjectsBenefit.value) {
    isNewProjectModalVisible.value = true
  } else {
    openUpgradeDialog()
  }
}

const isRenameProjectModalVisible = ref(false)
const renameProjectName = ref('')

const openRenameProjectDialog = () => {
  if (activeProject.value) {
    renameProjectName.value = activeProject.value.name
    isRenameProjectModalVisible.value = true
  }
}

const onRenameProject = async () => {
  if (activeProject.value && renameProjectName.value) {
    updateFileStore((state) => {
      const project = state.projects.find((p) => p.id === activeProject.value?.id)
      if (project) {
        project.name = renameProjectName.value
      }
    })
    isRenameProjectModalVisible.value = false
  }
}

const onNewFileCreation = async (
  preset: SavedFile = newPipelinePresets.value[newProjectPreset.value].data
) => {
  const pipelineId = nanoid()

  if (!preset) {
    throw new Error(t('home.invalid-preset'))
  }

  const projectId = activeProject.value.id
  let pathOrConfigName = ''
  const type: SaveLocation['type'] = isCloudProject.value ? 'pipelab-cloud' : 'internal'

  if (type === 'internal') {
    pathOrConfigName = `pipeline-${pipelineId}`
  }

  // update file store
  updateFileStore((state) => {
    if (type === 'internal') {
      state.pipelines.push({
        lastModified: new Date().toISOString(),
        configName: pathOrConfigName,
        type: 'internal',
        project: projectId,
        id: pipelineId
      })
    } else if (type === 'pipelab-cloud') {
      state.pipelines.push({
        type: 'pipelab-cloud',
        project: projectId,
        id: pipelineId
      })
    } else {
      state.pipelines.push({
        lastModified: new Date().toISOString(),
        path: pathOrConfigName,
        summary: {
          description: '',
          name: newProjectName.value,
          plugins: []
        },
        type: 'external',
        project: projectId,
        id: pipelineId
      })
    }
  })

  const updatedPreset: Preset = {
    ...preset,
    name: newProjectName.value,
    description: ''
  } satisfies Preset

  // write file
  if (type === 'internal') {
    await api.execute('config:save', {
      config: pathOrConfigName,
      data: JSON.stringify(updatedPreset)
    })
  } else if (type === 'pipelab-cloud') {
    // TODO:
  }

  if (updatedPreset.type === 'simple') {
    await router.push({
      name: 'SimpleEditor',
      params: {
        pipelineId: pipelineId,
        projectId: projectId
      }
    })
  } else {
    await router.push({
      name: 'Editor',
      params: {
        pipelineId: pipelineId,
        projectId: projectId
      }
    })
  }
}

const loadExisting = async (id: string) => {
  // Find the file to check its type
  const enhancedFile = filesEnhanced.value.find((f) => f.id === id)

  if (enhancedFile && enhancedFile.content.type === 'simple') {
    await router.push({
      name: 'SimpleEditor',
      params: {
        pipelineId: id,
        projectId: activeProject.value.id
      }
    })
  } else {
    await router.push({
      name: 'Editor',
      params: {
        pipelineId: id,
        projectId: activeProject.value.id
      }
    })
  }
}

const handleRowClick = (event: any) => {
  console.log('event', event)
  loadExisting(event.data.id)
}

const deletePipeline = async (id: string) => {
  confirm.require({
    message: 'Are you sure you want to delete this pipeline? This action cannot be undone.',
    header: 'Delete Pipeline',
    icon: 'pi pi-exclamation-triangle',
    rejectClass: 'p-button-secondary p-button-outlined',
    acceptClass: 'p-button-danger',
    accept: async () => {
      await remove(id)
    },
    reject: () => {
      // do nothing
    }
  })
}

const deleteProject = async () => {
  if (!activeProject.value) return

  if (pipelines.value.length > 0) {
    toast.add({
      severity: 'error',
      summary: t('home.cannot-delete-project'),
      detail: t('home.project-not-empty'),
      life: 3000
    })
    return
  }

  confirm.require({
    message: t('home.confirm-delete-project'),
    header: t('home.delete-project'),
    icon: 'pi pi-exclamation-triangle',
    rejectClass: 'p-button-secondary p-button-outlined',
    acceptClass: 'p-button-danger',
    accept: async () => {
      await removeProject(activeProject.value.id)
    },
    reject: () => {
      // do nothing
    }
  })
}

const menu = ref()
const selectedPipelineForMenu = ref<EnhancedFile | null>(null)
const isTransferModalVisible = ref(false)
const selectedTargetProject = ref()

const toggleMenu = (event: Event, data: EnhancedFile) => {
  selectedPipelineForMenu.value = data
  menu.value.toggle(event)
}

const menuItems = computed(() => [
  {
    label: t('home.build-history'),
    icon: 'mdi mdi-history',
    command: () => {
      if (selectedPipelineForMenu.value) viewProjectBuildHistory(selectedPipelineForMenu.value)
    },
    visible: hasBuildHistoryBenefit.value
  },
  {
    label: t('home.duplicate'),
    icon: 'mdi mdi-content-copy',
    command: () => {
      if (selectedPipelineForMenu.value) duplicateProject(selectedPipelineForMenu.value.content)
    }
  },
  {
    label: t('home.migrate-to-internal'),
    icon: 'mdi mdi-folder-move',
    command: () => {
      if (selectedPipelineForMenu.value) migratePipeline(selectedPipelineForMenu.value)
    },
    visible: shouldMigrate === true && selectedPipelineForMenu.value?.type === 'external'
  },
  {
    label: t('home.transfer'),
    icon: 'mdi mdi-folder-move',
    command: () => {
      openTransferDialog()
    }
  },
  {
    separator: true
  },
  {
    label: t('base.delete'),
    icon: 'mdi mdi-delete',
    class: 'text-red-500',
    command: () => {
      if (selectedPipelineForMenu.value) deletePipeline(selectedPipelineForMenu.value.id)
    }
  }
])

const openTransferDialog = () => {
  isTransferModalVisible.value = true
  selectedTargetProject.value = null
}

const performTransfer = async () => {
  if (selectedPipelineForMenu.value && selectedTargetProject.value) {
    await transferPipeline(selectedPipelineForMenu.value.id, selectedTargetProject.value.id)
    isTransferModalVisible.value = false
    toast.add({
      severity: 'success',
      summary: t('home.transfer-successful'),
      detail: t('home.pipeline-transferred'),
      life: 3000
    })
  }
}

const availableProjectsForTransfer = computed(() => {
  return projects.value
    .filter((p) => p.id !== activeProject.value?.id)
    .map((p) => ({ label: p.name, value: p }))
})

const duplicateProject = async (file: SavedFile) => {
  console.log('file', file)
  newProjectName.value = file.name + ' (copy)'
  newProjectData.value = file
  isNewPipelineModalVisible.value = true
}

const migratePipeline = async (file: EnhancedFile) => {
  confirm.require({
    message: t('home.confirm-migration-message'),
    header: t('home.migrate-pipeline'),
    icon: 'pi pi-info-circle',
    rejectClass: 'p-button-secondary p-button-outlined',
    acceptClass: 'p-button-primary',
    accept: async () => {
      const newConfigName = `pipeline-${nanoid()}`

      // Save content to internal config
      await api.execute('config:save', {
        config: newConfigName,
        data: JSON.stringify(file.content)
      })

      // Update store: replace external pipeline definition with internal one
      updateFileStore((state) => {
        const index = state.pipelines.findIndex((p) => p.id === file.id)
        if (index !== -1) {
          state.pipelines[index] = {
            id: file.id,
            project: file.project,
            lastModified: new Date().toISOString(),
            type: 'internal',
            configName: newConfigName
          }
        }
      })

      toast.add({
        severity: 'success',
        summary: t('base.success'),
        detail: t('home.migration-success'),
        life: 3000
      })
    }
  })
}

const viewProjectBuildHistory = async (file: EnhancedFile) => {
  if (!hasBuildHistoryBenefit) {
    openUpgradeDialog()
    return
  }

  selectedPipelineId.value = file.id
  showBuildHistoryDialog.value = true
}

const isNewPipelineModalVisible = ref(false)
const isNewProjectModalVisible = ref(false)

// Build history dialog state
const showBuildHistoryDialog = ref(false)
const selectedPipelineId = ref<string>()
</script>

<style lang="scss" scoped>
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

.scenarios {
  display: grid;
  grid-template-columns: repeat(1, 1fr);
  grid-template-rows: repeat(1, auto);
  grid-gap: 20px;
  gap: 16px;
}

@media (min-width: 768px) {
  .scenarios {
    grid-template-columns: repeat(2, 1fr);
    grid-template-rows: repeat(1, auto);
  }
}

@media (min-width: 1024px) {
  .scenarios {
    grid-template-columns: repeat(3, 1fr);
    grid-template-rows: repeat(1, auto);
  }
}

@media (min-width: 1280px) {
  .scenarios {
    grid-template-columns: repeat(4, 1fr);
    grid-template-rows: repeat(1, auto);
  }
}

@media (min-width: 1536px) {
  .scenarios {
    grid-template-columns: repeat(5, 1fr);
    grid-template-rows: repeat(1, auto);
  }
}

@media (min-width: 1920px) {
  .scenarios {
    grid-template-columns: repeat(6, 1fr);
    grid-template-rows: repeat(1, auto);
  }
}

.index {
  display: flex;
  flex-direction: column;
  overflow: auto;
  height: 100%;
  width: 100%;
}

.list-header {
  font-size: 1.8rem;
}

.no-projects {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  margin-top: 32px;
}

.presets {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  gap: 8px;
  margin-top: 16px;
  margin-bottom: 16px;

  .preset {
    border: 1px solid #eee;
    overflow: hidden;
    border-radius: 8px;
    padding: 8px;
    position: relative;
    height: 100px;

    &:hover {
      cursor: pointer;
      background-color: #eee;
      border: 1px solid #aaa;
    }

    &.highlight {
      border: 1px solid #ffff00;
    }

    .preset-title {
      font-size: 1.2rem;
      font-weight: 700;
      margin-bottom: 4px;
    }

    .highlight-icon {
      position: absolute;
      right: 4px;
      top: 8px;
    }

    .selection-icon {
      position: absolute;
      right: 4px;
      bottom: 8px;
    }

    &.active {
      cursor: pointer;
      background-color: #eee;
      outline: 2px solid #000;
    }

    &.disabled {
      pointer-events: none;
      opacity: 0.75;
    }
  }
}

@media screen and (width < 1280px) {
  .presets {
    grid-template-columns: 1fr 1fr;
  }
}

@media screen and (width < 960px) {
  .presets {
    grid-template-columns: 1fr;
  }
}

.your-projects {
  height: 100%;
  width: 100%;
  display: flex;
  flex-direction: column;

  &__table {
    flex: 1;
    height: 100%;
  }
}

.clickable-rows :deep(.p-datatable-tbody > tr:hover) {
  cursor: pointer;
  background-color: rgba(0, 0, 0, 0.05);
}

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

.main-layout {
  display: flex;
  flex-direction: row;
  height: 100%;
  width: 100%;
}

.drawer {
  width: 400px;

  .project-header {
    padding: 0 16px;
    display: flex;
    flex-direction: row;
    align-items: center;
    justify-content: space-between;

    .project-text {
    }
  }
}
</style>
