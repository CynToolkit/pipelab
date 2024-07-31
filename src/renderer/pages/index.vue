<template>
  <div class="index">
    <div class="header">
      <div>{{ headerSentence }}</div>
      <div class="button">
        <Button @click="openFile">
          <i class="mdi mdi-open-in-app mr-2"></i>
          Open
        </Button>
        <Button @click="newFile">
          <i class="mdi mdi-plus-circle-outline mr-2"></i>
          New Project
        </Button>
      </div>
    </div>
    <div class="content">
      <div class="your-projects">
        <div class="list-header">Your projects</div>
        <div class="scenarios">
          <div class="no-projects" v-if="filesEnhanced.length === 0">
            <div>No projects yet</div>
            <Button @click="newFile">
              <i class="mdi mdi-plus-circle-outline mr-2"></i>
              New Project
            </Button>
          </div>
          <ScenarioListItem
            @click="loadExisting(file.id)"
            v-for="file in filesEnhanced"
            :scenario="file"
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
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch, watchEffect } from 'vue'
import ScenarioListItem from '@renderer/components/ScenarioListItem.vue'
import ScenarioListItemRecent from '@renderer/components/ScenarioListItemRecent.vue'
import { useAppStore } from '@renderer/store/app'
import { storeToRefs } from 'pinia'
import { EnhancedFile, SavedFile } from '@@/model'
import { nanoid } from 'nanoid'
import { useEditor } from '@renderer/store/editor'
import { useRouter } from 'vue-router'
import { Recent, useRecentsStore } from '@renderer/store/recents'
import { useAPI } from '@renderer/composables/api'
import { useFiles } from '@renderer/store/files'
import { asyncComputed, computedAsync } from '@vueuse/core'
import { WithId } from '@@/utils'
import { loadExternalFile, loadInternalFile } from '@renderer/utils/config'
import { SaveLocation } from '@@/save-location'

const appStore = useAppStore()
const { presets } = storeToRefs(appStore)

const editorStore = useEditor()
const {} = storeToRefs(editorStore)
const {} = editorStore

const recentStore = useRecentsStore()
const { recents } = storeToRefs(recentStore)
const { addRecent } = recentStore

const router = useRouter()

const headerSentence = computed(() => {
  return `Welcome back!`
})

const api = useAPI()

const fileStore = useFiles()
const { files } = storeToRefs(fileStore)
const { update: updateFileStore, remove } = fileStore

const filesEnhanced = ref<EnhancedFile[]>([])

watchEffect(async () => {
  const entries = Object.entries(files.value.data)

  console.log('entries', entries)

  const result: EnhancedFile[] = []

  for (const [id, file] of entries) {
    let fileContent: string
    if (file.type === 'external') {
      const result = await loadExternalFile(file.path)
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
  const paths = await api.execute(
    'dialog:showOpenDialog',
    {
      title: 'Choose a new path',
      properties: ['openFile'],
      filters: [{ name: 'Cyn Project', extensions: ['cyn'] }]
    },
    async (_, message) => {
      const { type, data } = message
      if (type === 'end') {
        console.log('end', data)
      }
    }
  )

  console.log('paths', paths)

  if (!paths.canceled) {
    if (paths.filePaths.length === 1) {
      const fileToRead = paths.filePaths[0]
      console.log('fileToRead', fileToRead)

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
      console.error('Invalid number of paths selected')
    }
  }
}

/**
 * Create a new project
 * save it to the repo
 * and save it to user location
 */
const newFile = async () => {
  let id = nanoid()

  const presets = await api.execute('presets:get')

  console.log('presets.newProject.data', presets.newProject.data)

  // TODO: choose cloud or local

  const paths = await api.execute(
    'dialog:showSaveDialog',
    {
      title: 'Choose a new path',
      properties: ['createDirectory', 'showOverwriteConfirmation'],
      filters: [{ name: 'Cyn Project', extensions: ['cyn'] }]
    },
    async (_, message) => {
      const { type, data } = message
      if (type === 'end') {
        console.log('end', data)
      }
    }
  )

  if (paths.canceled) {
    console.error('Save cancelled')
    return
  }

  let path = paths.filePath

  const alreadyAddedPaths = Object.entries(files.value.data).map(([id, file]) => {
    if (file.type === 'external') {
      return {
        ...file,
        id
      }
    }
  })

  const foundExisting = alreadyAddedPaths.find((x) => x.path === path)

  if (foundExisting && foundExisting.type === 'external') {
    id = foundExisting.id
  }

  // update file store
  updateFileStore((state) => {
    console.log('state', state)

    state.data[id] = {
      lastModified: new Date().toISOString(),
      path,
      summary: {
        description: '',
        name: '',
        plugins: []
      },
      type: 'external'
    }
  })

  // write file
  await api.execute('fs:write', {
    path,
    content: JSON.stringify(presets.newProject.data)
  })

  await router.push({
    name: 'Editor',
    params: {
      id
    }
  })
}

const loadRecent = (recent: Recent) => {
  void recent
  // TODO:
  // return load()
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
</script>

<style scoped>
.header {
  font-size: 2rem;
  margin: 32px 16px 64px 16px;
  display: flex;
  flex-direction: row;
  justify-content: space-between;

  .button {
    display: flex;
    gap: 4px;
    flex-direction: row;
  }
}

.content {
  display: flex;
  flex-direction: column;
  overflow: auto;
  gap: 16px;
}

.index {
  display: flex;
  flex-direction: column;
  overflow: auto;
  height: 100%;
}

.list-header {
  font-size: 1.4rem;
  margin-bottom: 8px;
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
</style>
