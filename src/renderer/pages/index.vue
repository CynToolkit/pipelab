<template>
  <div class="index">
    <div class="header">
      <div class="bold title">{{ headerSentence }}</div>
      <div class="button">
        <Button outlined @click="newFile">
          <i class="mdi mdi-plus-circle-outline mr-2 fs-18"></i>
          New Project
        </Button>
        <Button outlined @click="openFile">
          <i class="mdi mdi-folder-open-outline mr-2"></i>
          Open
        </Button>

        <Button link class="list-item" @click="toggleAccountMenu">
          <i class="icon mdi mdi-account fs-24"></i>
          <!-- {{ user.email }} -->
        </Button>
        <!-- <Button link v-else class="list-item" @click="isAuthModalVisible = true" @click="">
          <i class="icon mdi mdi-account fs-24"></i>
        </Button> -->
        <!-- @vue-expect-error -->
        <Menu ref="$menu" :model="accountMenuItems" :popup="true" />
      </div>
    </div>
    <div class="content">
      <div class="your-projects">
        <div class="list-header bold">Your projects</div>
        <div v-if="filesEnhanced.length === 0" class="no-projects">
          <div>No projects yet</div>
          <Button @click="newFile">
            <i class="mdi mdi-plus-circle-outline mr-2"></i>
            New Project
          </Button>
        </div>
        <div class="scenarios">
          <ScenarioListItem
            v-for="file in filesEnhanced"
            :key="file.id"
            :scenario="file"
            @open="loadExisting(file.id)"
            @delete="deleteProject(file.id)"
          >
          </ScenarioListItem>
        </div>
      </div>

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
    </div>

    <Dialog
      v-model:visible="isNewProjectModalVisible"
      modal
      :style="{ width: '75vw' }"
      :breakpoints="{ '575px': '90vw' }"
    >
      <template #header>
        <div class="flex flex-column w-full">
          <p class="text-xl text-center">New Project</p>
        </div>
      </template>

      <div class="new-project">
        <div class="grid justify-content-center">
          <div class="col-12 xl:col-6 w-full">
            <div class="h-full w-full">
              <div class="mb-1">Project Name</div>
              <div class="mb-2">
                <InputText v-model="newProjectName" class="w-full"> </InputText>
              </div>

              <div class="mb-1">Storage</div>
              <div class="mb-2">
                <Select
                  v-model="newProjectType"
                  class="w-full"
                  option-label="label"
                  option-value="value"
                  option-disabled="disabled"
                  :options="newProjectTypes"
                  :disabled="newProjectName.length === 0"
                >
                </Select>
              </div>

              <div v-if="newProjectType === 'local'" class="location">
                <FileInput
                  v-model="newProjectLocalLocation"
                  :default-path="newProjectNamePathified"
                ></FileInput>
              </div>

              <div class="presets">
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
              </div>

              <div class="buttons">
                <Button :disabled="!canCreateproject" @click="onNewFileCreation"
                  >Create project</Button
                >
              </div>
            </div>
          </div>
        </div>
      </div>
    </Dialog>

    <Dialog
      v-model:visible="isAuthModalVisible"
      modal
      :style="{ width: '30vw' }"
      :breakpoints="{ '1199px': '75vw', '575px': '90vw' }"
    >
      <template #header>
        <div class="flex flex-column w-full">
          <p class="text-xl text-center">{{ type === 'login' ? 'Login' : 'Register' }}</p>
        </div>
      </template>

      <div v-if="type === 'login'" class="login">
        <div class="grid justify-content-center">
          <div class="col-12 xl:col-6 w-full">
            <div class="h-full w-full">
              <!-- @vue-expect-error -->
              <form @submit.prevent="handleSubmit">
                <div class="w-full md:w-10 mx-auto">
                  <InputText
                    id="mail"
                    v-model="emailModel"
                    v-bind="emailProps"
                    type="text"
                    :class="{
                      'w-full': true
                    }"
                    placeholder="Email"
                    :invalid="!!errors.email"
                  />
                  <small v-if="errors.email" id="username-help">
                    {{ errors.email }}
                  </small>

                  <div class="mb-2"></div>

                  <Password
                    id="password1"
                    v-model="passwordModel"
                    v-bind="passwordProps"
                    placeholder="Password"
                    :toggle-mask="true"
                    :feedback="false"
                    :invalid="!!errors.password"
                    :class="{
                      'w-full': true
                    }"
                    input-class="w-full"
                  >
                  </Password>

                  <small v-if="errors.password" class="p-error">
                    {{ errors.password }}
                  </small>

                  <div class="mb-2"></div>

                  <div class="flex align-items-center justify-content-between mb-5">
                    <Button text> Forgot password? </Button>
                  </div>

                  <Button
                    type="submit"
                    label="Sign In"
                    color="primary"
                    class="w-full p-3 text-lg mb-2"
                    @click="onSubmit"
                  />
                  <Button
                    text
                    label="Don't have an account?"
                    class="w-full p-3 text-lg"
                    @click="type = 'register'"
                  />
                </div>
              </form>
            </div>
          </div>
        </div>
      </div>
      <div v-if="type === 'register'" class="login">
        <div class="grid justify-content-center">
          <div class="col-12 xl:col-6 w-full">
            <div class="h-full w-full">
              <!-- @vue-expect-error -->
              <form @submit.prevent="handleSubmit">
                <div class="w-full md:w-10 mx-auto">
                  <InputText
                    id="mail"
                    v-model="emailModel"
                    v-bind="emailProps"
                    type="text"
                    :class="{
                      'w-full': true
                    }"
                    placeholder="Email"
                    :invalid="!!errors.email"
                  />
                  <small v-if="errors.email" id="username-help">
                    {{ errors.email }}
                  </small>

                  <div class="mb-2"></div>

                  <Password
                    id="password1"
                    v-model="passwordModel"
                    v-bind="passwordProps"
                    placeholder="Password"
                    :toggle-mask="true"
                    :invalid="!!errors.password"
                    :class="{
                      'w-full': true
                    }"
                    input-class="w-full"
                  >
                    <template #header>
                      <div class="text-lg font-bold mb-3">Pick a password</div>
                    </template>

                    <!-- @vue-expect-error -->
                    <template #footer="sp">
                      <!-- @vue-expect-error -->
                      {{ sp.level }}
                      <Divider />
                      <ul class="pl-2 ml-2 mt-0 line-height-3">
                        <li>At least one lowercase</li>
                        <li>At least one uppercase</li>
                        <li>At leaset one numeric</li>
                        <li>Minimum 8 characters</li>
                      </ul>
                    </template>
                  </Password>

                  <small v-if="errors.password" class="p-error">
                    {{ errors.password }}
                  </small>

                  <div class="mb-2"></div>

                  <div class="flex align-items-center justify-content-between mb-5">
                    <Button text> Forgot password? </Button>
                  </div>

                  <Button
                    type="submit"
                    label="Sign Up"
                    color="primary"
                    class="w-full p-3 text-lg mb-2"
                    @click="onSubmit"
                  />
                  <Button
                    text
                    label="Already have an account?"
                    class="w-full p-3 text-lg"
                    @click="type = 'login'"
                  />
                </div>
              </form>
            </div>
          </div>
        </div>
      </div>
    </Dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watchEffect } from 'vue'
import ScenarioListItem from '@renderer/components/ScenarioListItem.vue'
import { storeToRefs } from 'pinia'
import { EnhancedFile, SavedFile, Preset } from '@@/model'
import { nanoid } from 'nanoid'
import { useRouter } from 'vue-router'
import { useAPI } from '@renderer/composables/api'
import { useFiles } from '@renderer/store/files'
import { loadExternalFile } from '@renderer/utils/config'
import { useLogger } from '@@/logger'
import { useForm } from 'vee-validate'
import { email, minLength, nonEmpty, object, pipe, regex, string } from 'valibot'
import { toTypedSchema } from '@vee-validate/valibot'
import { useAuth } from '@renderer/store/auth'
import { MenuItem } from 'primevue/menuitem'
import { Presets } from '@@/apis'
import FileInput from '@renderer/components/FileInput.vue'
import { PROJECT_EXTENSION } from '@renderer/models/constants'
import { kebabCase } from 'change-case'

const router = useRouter()

const headerSentence = computed(() => {
  return `Dashboard`
})

const api = useAPI()

const { logger } = useLogger()

const fileStore = useFiles()
const { files } = storeToRefs(fileStore)
const { update: updateFileStore, remove } = fileStore

const filesEnhanced = ref<EnhancedFile[]>([])

const canCreateproject = computed(() => {
  return (
    newProjectType.value !== undefined &&
    newProjectPreset.value !== undefined &&
    newProjectName.value !== undefined &&
    (newProjectType.value === 'cloud' ||
      (newProjectType.value === 'local' && newProjectLocalLocation.value !== undefined))
  )
})

onMounted(async () => {
  await auth.init()
})

watchEffect(async () => {
  const entries = Object.entries(files.value.data)

  const result: EnhancedFile[] = []

  for (const [id, file] of entries) {
    let fileContent: string
    if (file.type === 'external') {
      console.log('loading file', file.path)
      const resultLoad = await loadExternalFile(file.path)

      if (resultLoad.type === 'error') {
        console.error('Unable to load file', resultLoad.ipcError)
        continue
      }

      const result = resultLoad.result

      if ('content' in result) {
        fileContent = result.content
      } else {
        throw new Error('Invalid file content')
      }
    } else {
      throw new Error('Invalid file type')
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
      title: 'Choose a new path',
      properties: ['openFile'],
      filters: [{ name: 'Pipelab Project', extensions: [PROJECT_EXTENSION] }]
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
        name: 'Editor',
        params: {
          id: newId
        }
      })
    } else {
      logger().error('Invalid number of paths selected')
    }
  }
}

const newProjectName = ref('')
const newProjectNamePathified = computed(() => {
  return kebabCase(newProjectName.value)
})

const newProjectType = ref()
const newProjectTypes = ref([
  {
    label: 'Local',
    value: 'local',
    description: 'Store project locally',
    icon: ''
  },
  {
    label: 'Cloud',
    value: 'cloud',
    icon: '',
    disabled: true,
    description: 'Store project on the cloud'
  }
])

const newProjectPreset = ref<string>()
const newProjectPresets = ref<Presets>({})

const newProjectLocalLocation = ref<string>()

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

const onNewFileCreation = async () => {
  let id = nanoid()

  const preset = newProjectPresets.value[newProjectPreset.value].data

  if (!preset) {
    throw new Error('Invalid preset')
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
    name: 'Editor',
    params: {
      id
    }
  })
}

const loadExisting = async (id: string) => {
  await router.push({
    name: 'Editor',
    params: {
      id
    }
  })
}

const deleteProject = async (id: string) => {
  await remove(id)
}

const appVersion = ref(window.version)
const isAuthModalVisible = ref(false)
const isNewProjectModalVisible = ref(false)
const auth = useAuth()
const { user } = storeToRefs(auth)

const schema = toTypedSchema(
  object({
    email: pipe(
      string('An email adress is required'),
      nonEmpty('Email is required'),
      email('Invalid email')
    ),
    password: pipe(
      string('A password is required'),
      nonEmpty('Password is required'),
      minLength(10, 'Password must be at least 10 characters long'),
      regex(/[a-z]/, 'Password must contain at least one lowercase letter'),
      regex(/[A-Z]/, 'Password must contain at least one uppercase letter'),
      regex(/[0-9]/, 'Password must contain at least one number'),
      regex(/[!@#$%^&*()_+-=[\]{};':"|<>?,./`~.]/, 'Password must contain at least one symbol')
    )
  })
)

const { defineField, handleSubmit, errors } = useForm({
  validationSchema: schema
})

const [emailModel, emailProps] = defineField('email')
const [passwordModel, passwordProps] = defineField('password')

const onSuccess = async (values: any) => {
  if (type.value === 'register') {
    await auth.register(values.email, values.password)
  } else {
    await auth.login(values.email, values.password)
  }
}

function onInvalidSubmit({ values, errors, results }: any) {
  logger().info({ values }) // current form values
  logger().info({ errors }) // a map of field names and their first error message
  logger().info({ results }) // a detailed map of field names and their validation results
}

const onSubmit = handleSubmit(onSuccess, onInvalidSubmit)

const type = ref<'login' | 'register'>('login')

const $menu = ref()
const accountMenuItems = computed(() => {
  const items = []

  if (user.value) {
    items.push(
      {
        label: 'Profile',
        icon: 'mdi mdi-account',
        disabled: true
      },
      {
        label: 'Team',
        icon: 'mdi mdi-account-multiple',
        disabled: true
      },
      {
        label: 'Settings',
        icon: 'mdi mdi-cog',
        disabled: true
      },
      {
        separator: true
      },
      {
        label: 'Logout',
        icon: 'mdi mdi-logout',
        disabled: true
      }
    )
  } else {
    items.push({
      label: 'Login',
      icon: 'mdi mdi-account',
      command: () => {
        isAuthModalVisible.value = true
      }
    } satisfies MenuItem)
  }

  items.push(
    {
      separator: true
    },
    {
      label: appVersion,
      icon: 'mdi mdi-information'
    }
  )

  const result = [
    {
      label: 'Account',
      icon: 'mdi mdi-account',
      items
    }
  ] satisfies MenuItem

  return result
})

const toggleAccountMenu = (event: MouseEvent) => {
  $menu.value.toggle(event)
}
</script>

<style scoped>
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
  overflow: auto;
  gap: 16px;
  padding: 0 16px;
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
}

.list-header {
  font-size: 1.8rem;
  margin-bottom: 16px;
  margin-left: 8px;
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
</style>
