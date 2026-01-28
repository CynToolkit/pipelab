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
            <Button @click="newFile">
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
                    <Button @click="newFile">
                      <i class="mdi mdi-plus-circle-outline mr-2"></i>
                      {{ $t('home.new-pipeline') }}
                    </Button>
                    <Button outlined @click="openFile">
                      <i class="mdi mdi-folder-open-outline mr-2"></i>
                      {{ $t('home.import') }}
                    </Button>
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
                <Button :disabled="!canCreateProject" @click="onNewProjectCreation()">{{
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
              <div class="mb-1">{{ $t('home.pipeline-name') }}</div>
              <div class="mb-2">
                <InputText v-model="newProjectName" class="w-full"> </InputText>
              </div>

              <div class="mb-1">{{ $t('settings.tabs.storage') }}</div>
              <div class="mb-2">
                <Select
                  v-model="newPipelineType"
                  class="w-full"
                  option-label="label"
                  option-disabled="disabled"
                  :options="newPipelineTypes"
                  :disabled="newProjectName.length === 0"
                >
                  <template #option="{ option }: { option: Item }">
                    <div class="w-full flex align-items-center justify-content-between gap-2">
                      <div class="flex align-items-center gap-2">
                        <i v-if="option.icon" :class="option.icon"></i>
                        <span>{{ option.label }}</span>
                      </div>
                      <div v-if="option.isPremium" class="premium-icon">
                        <i class="mdi mdi-crown ml-2"></i>
                      </div>
                    </div>
                  </template>
                  <template #value="{ value }: { value: Item | undefined }">
                    <div v-if="value" class="flex align-items-center gap-2">
                      <i v-if="value.icon" :class="value.icon"></i>
                      <span>{{ value.label }}</span>
                    </div>
                  </template>
                </Select>
              </div>

              <div v-if="newPipelineType && newPipelineType.value === 'local'" class="location">
                <FileInput
                  v-model="newProjectLocalLocation"
                  :default-path="newProjectNamePathified"
                ></FileInput>
              </div>

              <div class="presets">
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
        <Button
          label="Transfer"
          :disabled="!selectedTargetProject"
          @click="performTransfer"
        />
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
        <Button label="Cancel" text severity="secondary" @click="isRenameProjectModalVisible = false" />
        <Button
          label="Rename"
          :disabled="!renameProjectName"
          @click="onRenameProject"
        />
      </template>
    </Dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watchEffect, inject, watch } from 'vue'
import { useToast } from 'primevue/usetoast'
import { storeToRefs } from 'pinia'
import Menu from 'primevue/menu'
import { EnhancedFile, SavedFile, Preset } from '@@/model'
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

const router = useRouter()
const api = useAPI()
const openUpgradeDialog = inject('openUpgradeDialog') as () => void
const confirm = useConfirm()
const toast = useToast()

// Table data
const fileStore = useFiles()
const { files } = storeToRefs(fileStore)
const { update: updateFileStore, remove, removeProject, transferPipeline } = fileStore

const filesEnhanced = ref<EnhancedFile[]>([])

const appStore = useAppStore()
const { getPluginDefinition } = appStore

// Icon logic adapted from ScenarioListItem
function getScenarioIcons(scenario: EnhancedFile) {
  const icons: any[] = []
  if (!scenario?.content?.canvas?.blocks) return icons
  const blocks = scenario.content.canvas.blocks
  for (const node of blocks) {
    const def = getPluginDefinition(node.origin.pluginId)
    if (def && def.icon) {
      icons.push({ origin: node.origin, ...def.icon })
    }
  }
  if (icons.length > 4) {
    return icons
      .slice(0, 3)
      .concat({ type: 'icon', icon: 'mdi-plus', origin: { nodeId: '0', pluginId: '0' } })
  }
  return icons
}

const canCreatePipeline = computed(() => {
  if (newProjectData.value) {
    return (
      newPipelineType.value !== undefined &&
      newProjectName.value !== undefined &&
      (newPipelineType.value.value === 'cloud' ||
        (newPipelineType.value.value === 'local' && newProjectLocalLocation.value !== undefined))
    )
  }
  return (
    newPipelineType.value !== undefined &&
    newProjectPreset.value !== undefined &&
    newProjectName.value !== undefined &&
    (newPipelineType.value.value === 'cloud' ||
      (newPipelineType.value.value === 'local' && newProjectLocalLocation.value !== undefined))
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

watchEffect(async () => {
  isLoading.value = true

  const result: EnhancedFile[] = []

  for (const file of pipelines.value) {
    let fileContent: string
    if (file.type === 'external') {
      const resultLoad = await loadExternalFile(file.path)

      console.log('resultLoad', resultLoad)

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
        console.log('id', id)
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
    } else {
      throw new Error(t('home.invalid-file-type'))
    }

    const content = JSON.parse(fileContent) as SavedFile

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

const openFile = async () => {
  const pathsResult = await api.execute(
    'dialog:showOpenDialog',
    {
      title: t('home.choose-a-new-path'),
      properties: ['openFile'],
      filters: [{ name: t('home.pipelab-project'), extensions: [PROJECT_EXTENSION] }]
    }
    // async (_, message) => {
    //   const { type } = message
    //   if (type === 'end') {
    //     //
    //   }
    // }
  )

  if (pathsResult.type === 'error') {
    throw new Error(pathsResult.ipcError)
  }

  const paths = pathsResult.result

  if (!paths.canceled) {
    if (paths.filePaths.length === 1) {
      const fileToRead = paths.filePaths[0]
      let newId = nanoid()

      const alreadyAddedPaths = files.value.pipelines.map((file) => {
        if (file.type === 'external') {
          return {
            ...file
          }
        }
      })

      const foundElement = alreadyAddedPaths.find((x) => x.path === fileToRead)

      if (foundElement) {
        newId = foundElement.id
      }
      // save file to store
      updateFileStore((state) => {
        state.pipelines.push({
          lastModified: new Date().toISOString(),
          path: fileToRead,
          summary: {
            description: '',
            name: '',
            plugins: []
          },
          type: 'external',
          project: activeProject.value.id,
          id: newId
        })
      })

      await router.push({
        name: 'Editor',
        params: {
          id: newId
        }
      })
    } else {
      console.error(t('home.invalid-number-of-paths-selected'))
    }
  }
}

const newProjectName = ref('')
const newProjectNamePathified = computed(() => {
  return kebabCase(newProjectName.value)
})

type Item = {
  label: string
  value: string
  description: string
  icon: string
  disabled?: boolean
  isPremium?: boolean
}

const authStore = useAuth()
const {
  isLoadingSubscriptions,
  hasCloudSaveBenefit,
  hasBuildHistoryBenefit,
  hasMultipleProjectsBenefit
} = storeToRefs(authStore)

const newPipelineType = ref<Item>()
const newPipelineTypes = computed<Item[]>(() => {
  return [
    {
      label: t('home.local'),
      value: 'local',
      description: t('home.store-project-locally'),
      icon: 'mdi mdi-folder',
      disabled: false
    },
    {
      label: t('home.cloud'),
      value: 'cloud',
      icon: 'mdi mdi-cloud',
      // eslint-disable-next-line no-constant-binary-expression
      disabled: true || !hasCloudSaveBenefit,
      isPremium: true,
      description: t('home.store-project-on-the-cloud')
    }
  ]
})

const newProjectPreset = ref<string>()
const newPipelinePresets = ref<Presets>({})

const newProjectLocalLocation = ref<string>()
const newProjectData = ref<SavedFile>()

/**
 * Create a new project
 * save it to the repo
 * and save it to user location
 */
const createProject = async () => {
  newProjectName.value = ''
  // show dialog
  isNewProjectModalVisible.value = true
}

/**
 * Create a new project
 * save it to the repo
 * and save it to user location
 */
const newFile = async () => {
  newProjectName.value = ''
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
    createProject()
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
  let pipelineId = nanoid()

  if (!preset) {
    throw new Error(t('home.invalid-preset'))
  }

  const alreadyAddedPaths = files.value.pipelines.map((file) => {
    if (file.type === 'external') {
      return {
        ...file,
        id: file.id
      }
    }
  })

  const foundExisting = alreadyAddedPaths.find((x) => x.path === newProjectLocalLocation.value)

  if (foundExisting && foundExisting.type === 'external') {
    pipelineId = foundExisting.id
  }

  const projectId = activeProject.value.id

  // update file store
  updateFileStore((state) => {
    state.pipelines.push({
      lastModified: new Date().toISOString(),
      path: newProjectLocalLocation.value,
      summary: {
        description: '',
        name: newProjectName.value,
        plugins: []
      },
      type: 'external',
      project: projectId,
      id: pipelineId
    })
  })

  const updatedPreset: Preset = {
    ...preset,
    name: newProjectName.value,
    description: ''
  } satisfies Preset

  // write file
  await api.execute('fs:write', {
    path: newProjectLocalLocation.value,
    content: JSON.stringify(updatedPreset)
  })

  await router.push({
    name: 'Editor',
    params: {
      pipelineId: pipelineId,
      projectId: projectId
    }
  })
}

const loadExisting = async (id: string) => {
  await router.push({
    name: 'Editor',
    params: {
      pipelineId: id,
      projectId: activeProject.value.id
    }
  })
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
