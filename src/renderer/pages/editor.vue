<template>
  <div class="editor">
    <!-- <div class="aside">
      <div>
        <div>Editor</div>
      </div>
      <div>
        <div>Variables</div>
        <VariablesEditor v-if="instance"></VariablesEditor>
      </div>
    </div> -->

    <div class="editor-content">
      <div class="buttons">
        <div class="left">
          <!-- <Button
            type="button"
            @click="toggle"
            aria-haspopup="true"
            aria-controls="overlay_menu"
            label="Project"
          >
            <template #icon>
              <i class="mdi mdi-list-status mr-2"></i>
            </template>
          </Button>
          <Menu ref="menu" id="overlay_menu" :model="pipelineMenu" :popup="true" /> -->
        </div>
        <div class="center">
          <Inplace>
            <template #display>
              <div class="flex flex-row align-items-center">
                <div>{{ instance.name }}</div>
                <Button text size="small">
                  <template #icon>
                    <i class="mdi mdi-pencil mr-1"></i>
                  </template>
                </Button>
              </div>
            </template>
            <template #content="{ closeCallback }">
              <InputText type="text" v-model="instance.name" />
              <Button text size="small" @click="closeCallback">
                <template #icon>
                  <i class="mdi mdi-content-save mr-1"></i>
                </template>
              </Button>
              <!-- <Button text size="small" @click="closeCallback">
                <template #icon>
                  <i class="mdi mdi-close mr-1"></i>
                </template>
              </Button> -->
            </template>
          </Inplace>
        </div>
        <div class="right">
          <Button label="Save" size="small" @click="onSaveRequest">
            <template #icon>
              <i class="mdi mdi-content-save mr-1"></i>
            </template>
          </Button>
          <Button label="Run" size="small" @click="run">
            <template #icon>
              <i class="mdi mdi-play mr-1"></i>
            </template>
          </Button>
          <!-- <Button label="Save" size="small" icon="pi pi-pencil" rounded @click="save"></Button> -->
        </div>
      </div>
      <div class="main">
        <div class="node-editor-wrapper">
          <NodesEditor
            :errors="errors"
            v-if="instance"
            :nodes="nodes"
            :path="[]"
            :steps="stepsDisplay"
          ></NodesEditor>
          <EditorNodeDummy title="End"></EditorNodeDummy>
        </div>
      </div>

      <Dialog
        v-model:visible="showSaveDialog"
        modal
        header="Choose location"
        :style="{ width: '50%' }"
      >
        <!-- @vue-expect-error -->
        <Listbox
          v-model="saveOption"
          :options="saveOptions"
          optionLabel="name"
          class="w-full"
          optionDisabled="disabled"
        >
          <template #option="slotProps">
            <div class="item" :class="{ disabled: slotProps.option.disabled }">
              <i class="icon mdi" :class="{ [slotProps.option.icon]: true }"></i>
              <div>
                <div class="title">{{ slotProps.option.title }}</div>
                <div class="subtitle">{{ slotProps.option.subtitle }}</div>
              </div>
            </div>
          </template>
        </Listbox>
        <div class="flex justify-content-end gap-2 mt-2">
          <Button
            type="button"
            label="Cancel"
            severity="secondary"
            @click="showSaveDialog = false"
          ></Button>
          <Button
            :disabled="!saveOption"
            type="button"
            label="Save"
            :loading="isSaving"
            @click="onSaveCallback"
          ></Button>
        </div>
      </Dialog>
    </div>
  </div>
</template>

<script lang="ts" setup>
import { computed, onMounted, ref, watch } from 'vue'
import { useEditor } from '@renderer/store/editor'
import NodesEditor from '@renderer/pages/nodes-editor.vue'
import EditorNodeDummy from '@renderer/components/nodes/EditorNodeDummy.vue'
import { storeToRefs } from 'pinia'
import { useRoute } from 'vue-router'
import { SavedFile } from '@@/model'
import { useAPI } from '@renderer/composables/api'
import { useAppStore } from '@renderer/store/app'
import { MenuItem } from 'primevue/menuitem'
import { tinykeys } from 'tinykeys'
import { useRouteParams } from '@vueuse/router'
import { useFiles } from '@renderer/store/files'
import { klona } from 'klona'
import { loadExternalFile, loadInternalFile, saveExternalFile } from '@renderer/utils/config'

const route = useRoute()

const instance = useEditor()
const { nodes, variables, name, currentFilePointer, errors, stepsDisplay, id } = storeToRefs(instance)
const { processGraph, loadPreset, loadSavedFile } = instance

const app = useAppStore()
const { pluginDefinitions } = storeToRefs(app)

const filesStore = useFiles()
const { files } = storeToRefs(filesStore)
const { update } = filesStore

watch(
  id,
  async (newId) => {
    console.log('newId', newId)
    console.log('files', files)
    const file = files.value.data[newId]

    console.log('file', file)

    if (file && file.type === 'external') {
      const { path: filePath } = file

      const fileData = await loadExternalFile(filePath)
      console.log('fileData', fileData)

      if ('content' in fileData) {
        const content = JSON.parse(fileData.content) as SavedFile
        await loadSavedFile(content)
      } else {
        throw new Error('Invalid file content')
      }
    }
  },
  {
    immediate: true
  }
)

const run = async () => {
  const instance = useEditor()
  const api = useAPI()

  const { setActiveNode } = instance

  await processGraph({
    graph: klona(nodes.value),
    definitions: pluginDefinitions.value,
    variables: variables.value,
    context: {},
    steps: {},
    onNodeEnter: (node) => {
      console.log('onNodeEnter', node)
      setActiveNode(node)
    },
    onNodeExit: () => {
      console.log('onNodeExit')
      setActiveNode()
    },
    onExecuteItem: async (node, params, steps) => {
      console.log('onExecuteItem', node, params, steps)
      if (node.type === 'condition') {
        return api.execute('condition:execute', {
          nodeId: node.origin.nodeId,
          pluginId: node.origin.pluginId,
          params,
          steps
        })
      } else if (node.type === 'action') {
        const result = await api.execute('action:execute', {
          nodeId: node.origin.nodeId,
          pluginId: node.origin.pluginId,
          params,
          steps
        })
        console.log('result', result)
        return result
      } else {
        throw new Error('Unhandled type ' + node.type)
      }
    }
  })
}

const isSaving = ref(false)

const onSaveRequest = async () => {
  if (currentFilePointer.value.type === 'external') {
    await saveLocal(currentFilePointer.value.path)
  } else {
    // TODO: save to cloud
    throw new Error('TODO')
  }
}
// const onSaveRequest = async () => {
//   if (saveLocation.value) {
//     if (saveLocation.value.type === 'file') {
//       await saveLocal(saveLocation.value.path)
//     } else if (saveLocation.value.type === 'cyn-cloud') {
//       throw new Error('TODO')
//     }
//   } else {
//     showSaveDialog.value = true
//   }
// }

// const onSaveCallback = async () => {
//   isSaving.value = true

//   await saveLocal()

//   isSaving.value = false
// }

// const onSaveCallback = async () => {
//   isSaving.value = true

//   if (!saveOption.value) {
//     return
//   }

//   console.log('saveOption.value.id', saveOption.value.id)

//   if (saveOption.value.id === 'local') {
//     await saveLocal()
//   } else if (saveOption.value.id === 'cloud') {
//     await saveCloud()
//   }

//   isSaving.value = false
//   showSaveDialog.value = false
// }

const saveOptions = [
  {
    id: 'local',
    title: 'Local file',
    subtitle: 'Save on your own computer',
    icon: 'mdi-file-document-outline'
  },
  {
    id: 'cloud',
    title: 'Cloud',
    subtitle: 'Securely save online',
    icon: 'mdi-cloud-arrow-up-outline',
    disabled: true
  }
] as const

const saveOption = ref<(typeof saveOptions)[number]>()

const saveCloud = () => {
  throw new Error('TODO')
}

const saveLocal = async (path: string) => {
  const result: SavedFile = {
    version: '1.0.0',
    name: name.value,
    description: '',
    canvas: {
      blocks: nodes.value
    },
    variables: variables.value
  }

  await saveExternalFile(path, result)

  await update((state) => {
    const data = state.data[id.value]
    if (data.type === 'external') {
      data.lastModified = new Date().toISOString()
    } else {
      throw new Error('Invalid file type')
    }
  })

  new Notification('Project saved', {
    body: 'Your project has be saved successfully'
  })
}

const api = useAPI()

// const load = async () => {
//   const paths = await api.execute(
//     'dialog:showOpenDialog',
//     { title: 'Choose a new path', properties: ['openFile'] },
//     async (_, message) => {
//       const { type, data } = message
//       if (type === 'end') {
//         console.log('end', data)
//       }
//     }
//   )

//   console.log('paths', paths)

//   if (!paths.canceled) {
//     if (paths.filePaths.length === 1) {
//       const fileToRead = paths.filePaths[0]
//       console.log('fileToRead', fileToRead)

//       const response = await api.execute('fs:read', { path: fileToRead }, async (_, message) => {
//         const { type, data } = message
//         if (type === 'end') {
//           console.log('end', data)
//         }
//       })

//       console.log('response', response)

//       const json = JSON.parse(response.content)

//       instance.clear()
//       await instance.loadSavedFile(json)
//     } else {
//       console.error('Invalid number of paths selected')
//     }
//   }
// }

// const clear = async () => {
//   instance.clear()
//   const defaultPreset = presets.value?.['newProject']
//   if (defaultPreset) {
//     await instance.loadSavedFile(defaultPreset.data)
//   }
// }

const pipelineMenu = computed<MenuItem[]>(() => [
  {
    label: 'Save',
    icon: 'pi pi-save',
    command: () => {
      onSaveRequest()
    }
  }
])

const menu = ref()
const toggle = (event) => {
  menu.value.toggle(event)
}

const showSaveDialog = ref(false)

tinykeys(window, {
  '$mod+KeyS': (event) => {
    event.preventDefault()
    onSaveRequest()
  }
})
</script>

<style scoped lang="scss">
.editor {
  height: 100%;
  width: 100%;
  display: flex;
  flex-direction: row;
  position: relative;
  overflow: hidden;

  background:
    linear-gradient(90deg, #ffffff 17.5px, transparent 70%) center,
    linear-gradient(#ffffff 17.5px, transparent 70%) center,
    #e0e4e8b3;
  background-size: 20px 20px;
  // background-position: -19px -19px;

  .editor-content {
    width: 100%;
    display: flex;
    flex-direction: column;
  }

  .aside {
    border: 1px solid #ddd;
    border-radius: 16px;
    margin: 8px;
    padding: 16px;
    min-width: 300px;

    background-color: white;
  }

  .buttons {
    background: #fff;
    border-bottom: 2px solid #eee;
    width: 100%;
    display: flex;
    justify-content: space-between;
    gap: 4px;
    height: 64px;
    align-items: center;
    padding: 0 8px;

    .right {
      display: flex;
      gap: 4px;
    }

    .presets {
      display: flex;
      flex: 1;

      select {
        flex: 1;
      }
    }
  }
}

.main {
  height: 100%;
  width: 100%;
  display: flex;
  flex-direction: column;
  overflow: auto;
  padding: 128px 0;

  .node-editor-wrapper {
    margin: 16px;
    align-items: center;
    display: flex;
    flex-direction: column;
  }
}

.vl {
  border-left: 2px solid #c2c9d1;
  height: 32px;
}

.item {
  display: flex;
  gap: 32px;

  .icon {
    font-size: 32px;
  }

  .title {
  }

  .subtitle {
    font-size: 0.75rem;
    color: #aaa;
  }
}
</style>
