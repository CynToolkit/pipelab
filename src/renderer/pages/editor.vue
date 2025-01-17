<template>
  <div class="editor">
    <Toast position="bottom-center" />

    <div class="editor-content">
      <div class="buttons">
        <div class="left">
          <Button outlined label="Close" :disabled="isRunning" size="small" @click="onCloseRequest">
            <template #icon>
              <i class="mdi mdi-close mr-1"></i>
            </template>
          </Button>
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
              <InputText v-model="instance.name" type="text" />
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
          <Button outlined label="Save" :disabled="isRunning" size="small" @click="onSaveRequest">
            <template #icon>
              <i class="mdi mdi-content-save mr-1"></i>
            </template>
          </Button>
          <Button v-if="!isRunning" outlined label="Run" size="small" @click="run">
            <template #icon>
              <i class="mdi mdi-play mr-1"></i>
            </template>
          </Button>
          <Button v-else outlined label="Cancel" size="small" disabled @click="run">
            <template #icon>
              <i class="mdi mdi-cancel mr-1"></i>
            </template>
          </Button>
          <!-- <Button label="Save" size="small" icon="pi pi-pencil" rounded @click="save"></Button> -->
        </div>
      </div>

      <div class="editor-wrapper">
        <div class="aside">
          <div>
            <div class="bold">Project Settings</div>
            <ProjectSettingsEditor v-if="instance"></ProjectSettingsEditor>
          </div>
          <div>
            <div class="bold">Variables</div>
            <VariablesEditor v-if="instance"></VariablesEditor>
          </div>
          <div>
            <div class="bold">Environement</div>
            <EnvironementEditor v-if="instance"></EnvironementEditor>
          </div>
        </div>
        <div class="main">
          <div class="node-editor-wrapper">
            <EditorNodeEvent
              v-for="trigger in triggers"
              v-if="triggers.length > 0"
              :key="trigger.uid"
              :steps="stepsDisplay"
              :path="['0']"
              :value="trigger"
            ></EditorNodeEvent>
            <EditorNodeEventEmpty v-else :path="[]"></EditorNodeEventEmpty>

            <NodesEditor
              v-if="instance"
              :errors="errors"
              :nodes="nodes"
              :path="[]"
              :steps="stepsDisplay"
              :starting-index="1"
            ></NodesEditor>
            <EditorNodeDummy title="End"></EditorNodeDummy>
          </div>
        </div>
        <!-- <div class="aside">
          <p class="m-0">
            Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor
            incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud
            exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure
            dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur.
            Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt
            mollit anim id est laborum.
          </p>
        </div> -->
      </div>

      <div class="bottom" :class="{ expanded: bottomExpanded }">
        <div class="header" @click="toggleLogsWindow">
          <div class="ml-2 h3">Logs</div>
          <div class="actions">
            <Button text>
              <template #icon>
                <i
                  class="mdi mr-1"
                  :class="{ 'mdi-minus': bottomExpanded, 'mdi-plus': !bottomExpanded }"
                ></i>
              </template>
            </Button>
          </div>
        </div>
        <div v-if="bottomExpanded" class="logs">
          <div v-if="Object.keys(logLines).length > 0" class="card">
            <Accordion
              :value="currentLogAccordion"
              expand-icon="pi pi-plus"
              collapse-icon="pi pi-minus"
              class="accordion"
            >
              <AccordionPanel
                v-for="(log, key) in logLines"
                :key="key"
                class="accordion-panel"
                :value="key"
              >
                <AccordionHeader>
                  <span class="flex items-center gap-2 w-full">
                    <i
                      class="mdi mr-1"
                      :class="{
                        'mdi-check-circle': nodeStatuses[key] === 'done',
                        'mdi-close-circle': nodeStatuses[key] === 'error',
                        'mdi-progress-question': nodeStatuses[key] === 'idle',
                        'mdi-cog': nodeStatuses[key] === 'running',
                        'rotate': nodeStatuses[key] === 'running'
                      }"
                    ></i>
                    <span class="font-bold whitespace-nowrap">{{ keyToNodeName(key) }}</span>
                  </span>
                </AccordionHeader>
                <AccordionContent class="content">
                  <!-- <ScrollPanel style="width: 100%; height: 300px"> -->
                  <!-- <span class="line-indicator">{{ index }}.</span> -->
                  <!-- <span
                      v-for="(cell, index2) of line"
                      :key="index2"
                      class="cell"
                      v-html="cell"
                    ></span> -->
                  <div v-for="(line, index) of log" :key="index" class="line" v-html="line"></div>
                  <!-- </ScrollPanel> -->
                </AccordionContent>
              </AccordionPanel>
            </Accordion>
          </div>
        </div>
      </div>

      <Dialog
        v-model:visible="isPromptDialogVisible"
        modal
        :header="lastPromptInfos.message"
        :style="{ width: '25rem' }"
      >
        <div class="flex items-center gap-4 mb-4">
          <InputText
            id="answer"
            v-model="promptDialogAnswer"
            class="flex-auto"
            autocomplete="off"
          />
        </div>
        <div class="flex justify-end gap-2">
          <Button
            type="button"
            label="Cancel"
            severity="secondary"
            @click="onPromptDialogCancel"
          ></Button>
          <Button type="button" label="OK" @click="onPromptDialogOK"></Button>
        </div>
      </Dialog>
    </div>
  </div>
</template>

<script lang="ts" setup>
import { reactive, ref, watch } from 'vue'
import Accordion from 'primevue/accordion'
import AccordionPanel from 'primevue/accordionpanel'
import AccordionHeader from 'primevue/accordionheader'
import AccordionContent from 'primevue/accordioncontent'
import { useEditor } from '@renderer/store/editor'
import NodesEditor from '@renderer/pages/nodes-editor.vue'
import EditorNodeDummy from '@renderer/components/nodes/EditorNodeDummy.vue'
import { storeToRefs } from 'pinia'
import { useRouter } from 'vue-router'
import { SavedFile } from '@@/model'
import { useAPI } from '@renderer/composables/api'
import { useAppStore } from '@renderer/store/app'
import { useToast } from 'primevue/usetoast'
import { tinykeys } from 'tinykeys'
import { useFiles } from '@renderer/store/files'
import { klona } from 'klona'
import { loadExternalFile, saveExternalFile } from '@renderer/utils/config'
import EditorNodeEvent from '@renderer/components/nodes/EditorNodeEvent.vue'
import EditorNodeEventEmpty from '@renderer/components/nodes/EditorNodeEventEmpty.vue'
import { handle, HandleListenerRendererSendFn } from '@renderer/composables/handlers'
import VariablesEditor from './variables-editor.vue'
import EnvironementEditor from './environement-editor.vue'
import ProjectSettingsEditor from './project-settings-editor.vue'
import { format } from 'date-fns'
import { FancyAnsi, hasAnsi } from 'fancy-ansi'

const router = useRouter()

const fancyAnsi = new FancyAnsi()

const instance = useEditor()
const {
  nodes,
  triggers,
  variables,
  name,
  currentFilePointer,
  errors,
  stepsDisplay,
  id,
  logLines,
  nodeStatuses,
  isRunning
} = storeToRefs(instance)
const { processGraph, loadSavedFile, setIsRunning, pushLine, clearLogs, getNodeDefinition } =
  instance

const app = useAppStore()
const { pluginDefinitions } = storeToRefs(app)

const filesStore = useFiles()
const { files } = storeToRefs(filesStore)
const { update } = filesStore

const keyToNodeName = (key: string) => {
  const foundNode = nodes.value.find((x) => x.uid === key)
  const node = getNodeDefinition(foundNode.origin.nodeId, foundNode.origin.pluginId)
  return node.node.name ?? key
}

// const nodeLogLines = computed(() => {
//   const item = logLines.value[value.value.uid]
//   if (item) {
//     return item
//   }
//   return []
// })

watch(
  id,
  async (newId) => {
    const file = files.value.data[newId]

    if (file && file.type === 'external') {
      const { path: filePath } = file

      const fileDataResult = await loadExternalFile(filePath)

      if (fileDataResult.type === 'error') {
        throw new Error(fileDataResult.ipcError)
      }

      const fileData = fileDataResult.result

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

const toast = useToast()

const currentLogAccordion = ref()

const run = async () => {
  const instance = useEditor()
  const api = useAPI()

  const { setActiveNode } = instance
  const { activeNode } = storeToRefs(instance)

  setIsRunning(true)
  clearLogs()
  try {
    await processGraph({
      graph: klona(nodes.value),
      definitions: pluginDefinitions.value,
      variables: variables.value,
      context: {},
      steps: {},
      onNodeEnter: (node) => {
        setActiveNode(node)
      },
      onNodeExit: () => {
        setActiveNode()
      },
      onExecuteItem: async (node, params, steps) => {
        nodeStatuses.value[node.uid] = 'running'
        /* if (node.type === 'condition') {
        return api.execute('condition:execute', {
          nodeId: node.origin.nodeId,
          pluginId: node.origin.pluginId,
          params,
          steps
        })
      } else  */
        currentLogAccordion.value = node.uid
        if (node.type === 'action') {
          const result = await api.execute(
            'action:execute',
            {
              nodeId: node.origin.nodeId,
              pluginId: node.origin.pluginId,
              params,
              steps
            },
            async (event, data) => {
              // console.log('event', event)
              // console.log('data', data)
              if (data.type === 'log') {
                const lines = data.data.message.join(' ')

                const splittedInnerLines = lines.split('\n')

                for (const l of splittedInnerLines
                  .map((x) => x.trim())
                  .filter((x) => !!x)
                  .filter((x) => x !== '')) {
                  let content = ''

                  if (hasAnsi(l)) {
                    content += fancyAnsi.toHtml(l)
                  } else {
                    content += l
                  }

                  pushLine(
                    node.uid,
                    [format(data.data.time, 'dd/MM/yyyy - hh:mm:ss'), content].join(' ')
                  )
                }

                // const content = data.data.message.map((x) => {
                //   const linesInlines = x.split('\n')
                //   console.log('linesInlines', linesInlines)
                //   let final = ''
                //   for (const l of linesInlines) {
                //     if (hasAnsi(l)) {
                //       final += fancyAnsi.toHtml(l)
                //     } else {
                //       final += l
                //     }
                //   }
                //   return final
                // })
                // console.log('content', content)
                // pushLine(
                //   node.uid,
                //   [format(data.data.time, 'dd/MM/yyyy - hh:mm:ss'), content].join(' ')
                // )
              }
            }
          )
          nodeStatuses.value[node.uid] = 'done'
          return result
        } else {
          throw new Error('Unhandled type ' + node.type)
        }
      }
    })

    toast.add({
      summary: 'Execution done',
      life: 10_000,
      severity: 'success',
      detail: 'Your project has been executed successfully'
    })
  } catch (e) {
    nodeStatuses.value[activeNode.value.uid] = 'error'

    console.error('error while executing process', e)
    if (e instanceof Error) {
      toast.add({
        summary: 'Execution failed',
        life: 10_000,
        severity: 'error',
        detail: 'Project has encountered an error: ' + e.message
      })
    }
  }
  setActiveNode()
  setIsRunning(false)
}

// const isSaving = ref(false)

const onSaveRequest = async () => {
  if (currentFilePointer.value.type === 'external') {
    await saveLocal(currentFilePointer.value.path)
  } else {
    // TODO: save to cloud
    throw new Error('TODO')
  }
}

const onCloseRequest = async () => {
  console.log('close request')
  await router.push({
    name: 'Dashboard'
  })
}

// const onSaveRequest = async () => {
//   if (saveLocation.value) {
//     if (saveLocation.value.type === 'file') {
//       await saveLocal(saveLocation.value.path)
//     } else if (saveLocation.value.type === 'pipelab-cloud') {
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

// const saveOptions = [
//   {
//     id: 'local',
//     title: 'Local file',
//     subtitle: 'Save on your own computer',
//     icon: 'mdi-file-document-outline'
//   },
//   {
//     id: 'cloud',
//     title: 'Cloud',
//     subtitle: 'Securely save online',
//     icon: 'mdi-cloud-arrow-up-outline',
//     disabled: true
//   }
// ] as const

// const saveOption = ref<(typeof saveOptions)[number]>()

// const saveCloud = () => {
//   throw new Error('TODO')
// }

const saveLocal = async (path: string) => {
  const result: SavedFile = {
    version: '3.0.0',
    name: name.value,
    description: '',
    canvas: {
      blocks: nodes.value,
      triggers: triggers.value
    },
    variables: variables.value
  }

  console.log('result', result)

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

// const api = useAPI()

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

// TODO: proper alert and prompt

handle('dialog:alert', async (event, { value, send }) => {
  alert(value.message)

  send({
    type: 'end',
    data: {
      type: 'success',
      result: {
        answer: 'ok'
      }
    }
  })
})

const isPromptDialogVisible = ref(false)
const promptDialogAnswer = ref('')
const onPromptDialogCancel = () => {
  lastPromptInfos.callback({
    type: 'end',
    data: {
      type: 'error',
      ipcError: 'canceled'
    }
  })
  isPromptDialogVisible.value = false
}
const onPromptDialogOK = () => {
  lastPromptInfos.callback({
    type: 'end',
    data: {
      type: 'success',
      result: {
        answer: promptDialogAnswer.value
      }
    }
  })
  isPromptDialogVisible.value = false
}

const lastPromptInfos = reactive({
  callback: undefined as undefined | HandleListenerRendererSendFn<'dialog:prompt'>,
  message: ''
})

handle('dialog:prompt', async (event, { value, send }) => {
  lastPromptInfos.message = value.message
  lastPromptInfos.callback = send

  isPromptDialogVisible.value = true
})

const bottomExpanded = ref(false)
const toggleLogsWindow = () => {
  bottomExpanded.value = !bottomExpanded.value
}

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
  width: 100vw;
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
  height: 100%;

  .editor-content {
    width: 100%;
    display: flex;
    flex-direction: column;
    height: calc(100% - 80px);

    .editor-wrapper {
      display: flex;
      flex-direction: row;
      height: 100%;
      min-height: 0;
    }
  }

  .aside {
    border: 1px solid #ddd;
    border-radius: 16px;
    margin: 8px;
    padding: 16px;
    width: 400px;

    background-color: white;
  }

  .bottom {
    position: absolute;
    left: 0px;
    right: 0px;
    bottom: 0px;

    margin: 8px;
    padding: 8px;
    background-color: white;
    border-radius: 16px;
    border: 1px solid #ddd;
    border-radius: 16px;
    height: 64px;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    min-height: 0;

    transition:
      height 0.3s ease,
      box-shadow 0.3s ease;

    &.expanded {
      height: 50%;
      box-shadow: 0px 0px 25px 5px rgba(0, 0, 0, 0.1);
    }

    .logs {
      height: 100%;
      width: 100%;
      min-height: 0;

      font-family: 'Geist Mono', serif;

      .card {
        width: 100%;
        height: 100%;
      }
    }

    .header {
      cursor: pointer;
      width: 100%;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .actions {
    }

    .accordion {
      height: 100%;
      overflow: auto;

      .accordion-panel {
        // height: 100%;
      }

      .content {
        :deep(.p-accordioncontent-content) {
          width: 100%;
          height: 100%;
          overflow: auto;
        }
        // max-height: 300px;
      }
      .line {
        display: flex;
        flex-wrap: wrap;
        gap: 4px;
        overflow-wrap: anywhere;

        .cell {
          // flex: 1 1 auto;
        }
      }
    }
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
  padding: 64px 0;

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

.h3 {
  // font-size: 1.2rem;
  font-weight: 700;
}
</style>
