<template>
  <div class="index">
    <Toast />
    <Layout>
      <div class="your-projects">
        <div v-if="filesEnhanced.length === 0" class="no-projects">
          <div>{{ $t('home.no-projects-yet') }}</div>
          <Button @click="newFile">
            <i class="mdi mdi-plus-circle-outline mr-2"></i>
            {{ $t('home.new-project') }}
          </Button>
        </div>
        <div class="your-projects__table">
          <DataTable
            :value="filesEnhanced"
            data-key="id"
            class="w-full h-full"
            :scrollable="true"
            scroll-height="flex"
          >
            <template #header>
              <div class="flex justify-content-between">
                <div class="list-header bold">{{ $t('home.your-projects') }}</div>

                <div class="flex justify-content-end gap-2">
                  <Button @click="newFile">
                    <i class="mdi mdi-plus-circle-outline mr-2"></i>
                    {{ $t('home.new-project') }}
                  </Button>
                  <Button outlined @click="openFile">
                    <i class="mdi mdi-folder-open-outline mr-2"></i>
                    {{ $t('home.open') }}
                  </Button>
                  <Button v-slot="slotProps" as-child>
                    <RouterLink :to="{ name: 'BuildHistory' }" :class="slotProps.class">
                      <i class="mdi mdi-folder-open-outline mr-2"></i>
                      {{ $t('home.open') }}
                    </RouterLink>
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
            </Column>
            <Column field="content.name" header="Name" />
            <!-- <Column field="content.description" header="Description" /> -->
            <!-- <Column header="Path">
              <template #body="{ data }">
                <span v-if="data.type === 'external'">{{ data.path }}</span>
              </template>
            </Column> -->
            <Column header="" style="width: 200px">
              <template #body="{ data }">
                <ButtonGroup class="p-buttonset">
                  <Button
                    size="small"
                    severity="info"
                    class="p-button-outlined"
                    @click.stop="duplicateProject(data)"
                  >
                    <template #icon><i class="mdi mdi-content-copy"></i></template>
                  </Button>
                  <Button
                    v-if="!data.noDeleteBtn"
                    size="small"
                    severity="danger"
                    class="p-button-outlined"
                    @click.stop="deleteProject(data.id)"
                  >
                    <template #icon><i class="mdi mdi-delete"></i></template>
                  </Button>
                  <Button
                    size="small"
                    class="p-button-outlined"
                    @click.stop="loadExisting(data.id)"
                  >
                    <template #icon><i class="mdi mdi-folder-open"></i></template>
                  </Button>
                </ButtonGroup>
              </template>
            </Column>
          </DataTable>
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

              <div class="mb-1">{{ $t('settings.tabs.storage') }}</div>
              <div class="mb-2">
                <Select
                  v-model="newProjectType"
                  class="w-full"
                  option-label="label"
                  option-disabled="disabled"
                  :options="newProjectTypes"
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

              <div v-if="newProjectType === 'local'" class="location">
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
                    v-for="(preset, key) of newProjectPresets"
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
                  :disabled="!canCreateproject"
                  @click="onNewFileCreation(newProjectData)"
                  >{{ $t('home.duplicate-project') }}</Button
                >
                <Button v-else :disabled="!canCreateproject" @click="onNewFileCreation()">{{
                  $t('home.create-project')
                }}</Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watchEffect } from 'vue'
import { storeToRefs } from 'pinia'
import { EnhancedFile, SavedFile, Preset } from '@@/model'
import { nanoid } from 'nanoid'
import { useRouter } from 'vue-router'
import { useAPI } from '@renderer/composables/api'
import { useFiles } from '@renderer/store/files'
import { loadExternalFile } from '@renderer/utils/config'

import { Presets } from '@@/apis'
import FileInput from '@renderer/components/FileInput.vue'
import { PROJECT_EXTENSION } from '@renderer/models/constants'
import { kebabCase } from 'change-case'

import PluginIcon from '../components/nodes/PluginIcon.vue'
import { useAppStore } from '@renderer/store/app'
import Layout from '../components/Layout.vue'
import { useI18n } from 'vue-i18n'
import { useAuth } from '@renderer/store/auth'

const router = useRouter()
const api = useAPI()

// Table data
const fileStore = useFiles()
const { files } = storeToRefs(fileStore)
const { update: updateFileStore, remove } = fileStore

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

const canCreateproject = computed(() => {
  if (newProjectData.value) {
    return (
      newProjectType.value !== undefined &&
      newProjectName.value !== undefined &&
      (newProjectType.value === 'cloud' ||
        (newProjectType.value === 'local' && newProjectLocalLocation.value !== undefined))
    )
  }
  return (
    newProjectType.value !== undefined &&
    newProjectPreset.value !== undefined &&
    newProjectName.value !== undefined &&
    (newProjectType.value === 'cloud' ||
      (newProjectType.value === 'local' && newProjectLocalLocation.value !== undefined))
  )
})

const { t } = useI18n()

watchEffect(async () => {
  const entries = Object.entries(files.value.data)

  const result: EnhancedFile[] = []

  for (const [id, file] of entries) {
    let fileContent: string
    if (file.type === 'external') {
      const resultLoad = await loadExternalFile(file.path)

      if (resultLoad.type === 'error') {
        console.error('Unable to load file', resultLoad.ipcError)
        const [id] = Object.entries(files.value.data).find(([, value]) => {
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
          delete state.data[id]
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
        id,
        content: content
      })
    }
  }

  filesEnhanced.value = result
})

const openFile = async () => {
  const pathsResult = await api.execute(
    'dialog:showOpenDialog',
    {
      title: t('home.choose-a-new-path'),
      properties: ['openFile'],
      filters: [{ name: t('home.pipelab-project'), extensions: [PROJECT_EXTENSION] }]
    },
    async (_, message) => {
      const { type } = message
      if (type === 'end') {
        //
      }
    }
  )

  if (pathsResult.type === 'error') {
    throw new Error(pathsResult.ipcError)
  }

  const paths = pathsResult.result

  if (!paths.canceled) {
    if (paths.filePaths.length === 1) {
      const fileToRead = paths.filePaths[0]
      let newId = nanoid()

      const alreadyAddedPaths = Object.entries(files.value.data).map(([id, file]) => {
        if (file.type === 'external') {
          return {
            ...file,
            id
          }
        }
      })

      const foundElement = alreadyAddedPaths.find((x) => x.path === fileToRead)

      if (foundElement) {
        newId = foundElement.id
      }
      // save file to store
      updateFileStore((state) => {
        state.data[newId] = {
          lastModified: new Date().toISOString(),
          path: fileToRead,
          summary: {
            description: '',
            name: '',
            plugins: []
          },
          type: 'external'
        }
      })

      await router.push({
        name: t('headers.editor'),
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

const { hasBenefit } = useAuth()

const newProjectType = ref()
const newProjectTypes = computed<Item[]>(() => {
  return [
    {
      label: t('home.local'),
      value: 'local',
      description: t('home.store-project-locally'),
      icon: 'mdi mdi-folder'
    },
    {
      label: t('home.cloud'),
      value: 'cloud',
      icon: 'mdi mdi-cloud',
      disabled: !hasBenefit('cloud-save'),
      isPremium: true,
      description: t('home.store-project-on-the-cloud')
    }
  ]
})

const newProjectPreset = ref<string>()
const newProjectPresets = ref<Presets>({})

const newProjectLocalLocation = ref<string>()
const newProjectData = ref<SavedFile>()

/**
 * Create a new project
 * save it to the repo
 * and save it to user location
 */
const newFile = async () => {
  // find presets
  const presetsResult = await api.execute('presets:get')

  if (presetsResult.type === 'error') {
    throw new Error(presetsResult.ipcError)
  }

  newProjectPresets.value = presetsResult.result

  // show dialog
  isNewProjectModalVisible.value = true
}

const onNewFileCreation = async (
  preset: SavedFile = newProjectPresets.value[newProjectPreset.value].data
) => {
  let id = nanoid()

  if (!preset) {
    throw new Error(t('home.invalid-preset'))
  }

  const alreadyAddedPaths = Object.entries(files.value.data).map(([id, file]) => {
    if (file.type === 'external') {
      return {
        ...file,
        id
      }
    }
  })

  const foundExisting = alreadyAddedPaths.find((x) => x.path === newProjectLocalLocation.value)

  if (foundExisting && foundExisting.type === 'external') {
    id = foundExisting.id
  }

  // update file store
  updateFileStore((state) => {
    state.data[id] = {
      lastModified: new Date().toISOString(),
      path: newProjectLocalLocation.value,
      summary: {
        description: '',
        name: newProjectName.value,
        plugins: []
      },
      type: 'external'
    }
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
    name: t('headers.editor'),
    params: {
      id
    }
  })
}

const loadExisting = async (id: string) => {
  await router.push({
    name: t('headers.editor'),
    params: {
      id
    }
  })
}

const deleteProject = async (id: string) => {
  await remove(id)
}

const duplicateProject = async (file: SavedFile) => {
  console.log('file', file)
  newProjectName.value = file.name + ' (copy)'
  newProjectData.value = file
  isNewProjectModalVisible.value = true
}

const isNewProjectModalVisible = ref(false)
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

.content {
  display: flex;
  flex-direction: column;
  gap: 16px;
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
</style>
