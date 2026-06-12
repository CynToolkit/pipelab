<template>
  <div class="editor-page">
    <Layout>
      <div class="editor">
        <div class="editor-content">
          <div class="buttons">
            <div class="left">
              <Button
                id="tour-editor-close"
                outlined
                :label="t('base.close')"
                :disabled="isRunning"
                size="small"
                @click="onCloseRequest"
              >
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
              <Inplace :pt="{ display: { style: { padding: '4px' } } }">
                <template #display>
                  <div class="flex flex-row align-items-center">
                    <div>{{ instance.name }}</div>
                    <Button text size="small" class="ml-1">
                      <template #icon>
                        <i class="mdi mdi-pencil"></i>
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
              <Button
                outlined
                :label="t('editor.project-settings')"
                :disabled="isRunning"
                size="small"
                @click="showProjectSettingsDialog = true"
              >
                <template #icon>
                  <i class="mdi mdi-cog mr-1"></i>
                </template>
              </Button>
              <Button
                v-if="hasBuildHistoryBenefit"
                outlined
                :label="t('editor.view-history')"
                :disabled="isRunning"
                size="small"
                @click="navigateToBuildHistory"
              >
                <template #icon>
                  <i class="mdi mdi-history mr-1"></i>
                </template>
              </Button>
              <Button
                id="tour-editor-save"
                outlined
                :label="t('base.save')"
                :disabled="isRunning || isSaving || !isDirty"
                :loading="isSaving"
                size="small"
                @click="onSaveRequest(false)"
              >
                <template #icon>
                  <i class="mdi mdi-content-save mr-1"></i>
                </template>
              </Button>
              <Button
                v-if="!isRunning"
                id="tour-editor-run"
                outlined
                :label="t('base.run')"
                size="small"
                @click="run"
              >
                <template #icon>
                  <i class="mdi mdi-play mr-1"></i>
                </template>
              </Button>
              <Button v-else outlined :label="t('base.cancel')" size="small" @click="cancel">
                <template #icon>
                  <i class="mdi mdi-cancel mr-1"></i>
                </template>
              </Button>
              <!-- <Button label="Save" size="small" icon="pi pi-pencil" rounded @click="save"></Button> -->
            </div>
          </div>

          <Splitter class="editor-wrapper" stateKey="pipelab-editor-splitter" stateStorage="local">
            <SplitterPanel :size="75" :minSize="30">
              <div id="tour-editor-canvas" class="main">
                <div class="node-editor-wrapper">
                  <EditorNodeEvent
                    v-for="trigger in triggers"
                    v-slot="{}"
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
                    :is-running="isRunning"
                  ></NodesEditor>
                  <EditorNodeDummy :title="t('base.end')"></EditorNodeDummy>
                </div>
              </div>
            </SplitterPanel>
            <SplitterPanel :size="25" :minSize="15" v-if="selectedNode">
              <div class="drawer right">
                <transition name="fade-fast" mode="out-in">
                  <div :key="selectedNode.uid" class="drawer-content-inner">
                    <div class="drawer-header">
                      <div class="text-bold text-xl">
                        {{ selectedNode?.name ?? nodeDefinition?.name }}
                      </div>
                      <Button
                        icon="pi pi-times"
                        class="flex"
                        size="small"
                        @click="setSelectedNode(undefined)"
                      ></Button>
                    </div>
                    <div class="drawer-body">
                      <div v-if="nodeDefinition" class="flex flex-column gap-4">
                        <div
                          v-for="(paramDefinition, key) in nodeDefinition.params"
                          :key="key"
                          class="param"
                        >
                          <ParamEditor
                            :param="selectedNode.params[key]"
                            :param-key="key"
                            :param-definition="paramDefinition"
                            :value="selectedNode"
                            :steps="stepsDisplay"
                            :variables="variables"
                            @update:model-value="onValueChanged($event, key.toString())"
                          ></ParamEditor>
                        </div>
                      </div>
                    </div>
                    <div class="drawer-footer">
                      <Button
                        :label="t('base.delete')"
                        icon="pi pi-trash"
                        class="w-full"
                        severity="danger"
                        @click="removeNode(selectedNode.uid)"
                      ></Button>
                    </div>
                  </div>
                </transition>
              </div>
            </SplitterPanel>
          </Splitter>

          <div class="bottom" :class="{ expanded: bottomExpanded }">
            <div id="tour-editor-logs" class="header" @click="toggleLogsWindow">
              <div class="ml-2 h3 logs-header">
                <div>{{ t("base.logs") }}</div>
                <div v-if="isRunning" class="logs-animated">
                  <div
                    v-for="log in quickLogs"
                    :key="log.id"
                    class="log-entry"
                    :class="{ 'slide-out': log.isExiting, 'slide-in': !log.isExiting }"
                  >
                    <span v-html="log.text"></span>
                  </div>
                </div>
              </div>
              <div class="actions">
                <Button v-tooltip.top="'Export log'" text @click.stop="exportLog">
                  <template #icon>
                    <i class="mdi mr-1 mdi-file-export"></i>
                  </template>
                </Button>
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
                            rotate: nodeStatuses[key] === 'running',
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
                      <div
                        v-for="(line, index) of log"
                        :key="index"
                        class="line"
                        v-html="line"
                      ></div>
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
                :label="t('base.cancel')"
                severity="secondary"
                @click="onPromptDialogCancel"
              ></Button>
              <Button type="button" :label="t('base.ok')" @click="onPromptDialogOK"></Button>
            </div>
          </Dialog>
        </div>

        <!-- Glassmorphic Loading Overlay while JIT-installing plugins -->
        <transition name="fade">
          <div
            v-if="isJitInstalling"
            class="jit-loader-overlay"
            :class="{ 'light-theme': settingsRef?.theme !== 'dark' }"
          >
            <div class="ambient" aria-hidden="true">
              <div class="orb orb-1" />
              <div class="orb orb-2" />
              <div class="orb orb-3" />
            </div>
            <div class="grid-overlay" aria-hidden="true" />
            <div class="jit-loader-card">
              <div class="logo-wrap">
                <img src="/icon.png" alt="Pipelab" class="logo" />
              </div>
              <div class="jit-loader-text-container">
                <h3>{{ t("editor.jit-loading-title") }}</h3>
                <p>{{ t("editor.jit-loading-subtitle") }}</p>
              </div>
              <div class="progress-track">
                <div class="progress-fill" />
              </div>
              <div class="steps" aria-live="polite">
                <div class="step">
                  <i class="step-icon mdi mdi-loading mdi-spin" />
                  <span>{{ t("editor.jit-loading-status") }}</span>
                </div>
              </div>
            </div>
          </div>
        </transition>
      </div>
    </Layout>

    <BuildHistoryDialog
      v-model:visible="showBuildHistoryDialog"
      :pipeline-id="pipelineId"
      @hide="showBuildHistoryDialog = false"
    />

    <Dialog
      v-model:visible="showProjectSettingsDialog"
      modal
      :header="t('editor.project-settings')"
      :style="{ width: '50rem' }"
    >
      <ProjectSettingsEditor v-if="instance"></ProjectSettingsEditor>
    </Dialog>
  </div>
</template>

<script lang="ts" setup>
import { computed, inject, reactive, ref, watch, onMounted } from "vue";
import Accordion from "primevue/accordion";
import AccordionPanel from "primevue/accordionpanel";
import AccordionHeader from "primevue/accordionheader";
import AccordionContent from "primevue/accordioncontent";
import Splitter from "primevue/splitter";
import SplitterPanel from "primevue/splitterpanel";
import { useEditor } from "@renderer/store/editor";
import NodesEditor from "@renderer/pages/nodes-editor.vue";
import EditorNodeDummy from "@renderer/components/nodes/EditorNodeDummy.vue";
import { storeToRefs } from "pinia";
import { useRouter } from "vue-router";
import { BlockAction, SavedFile } from "@pipelab/shared";
import { useAPI } from "@renderer/composables/api";
import { useToast } from "primevue/usetoast";
// @ts-expect-error - tinykeys type resolution mismatch with moduleResolution
import { tinykeys } from "tinykeys";
import { useFiles } from "@renderer/store/files";
import { klona } from "klona";
import { loadExternalFile, saveExternalFile } from "@renderer/utils/config";
import EditorNodeEvent from "@renderer/components/nodes/EditorNodeEvent.vue";
import EditorNodeEventEmpty from "@renderer/components/nodes/EditorNodeEventEmpty.vue";
import { handle, HandleListenerRendererSendFn } from "@renderer/composables/handlers";
import VariablesEditor from "./variables-editor.vue";
import EnvironementEditor from "./environement-editor.vue";
import ProjectSettingsEditor from "./project-settings-editor.vue";
import { format } from "date-fns";
import { FancyAnsi, hasAnsi } from "fancy-ansi";
import { watchThrottled, useStorage } from "@vueuse/core";
import { stripHtml } from "string-strip-html";
import posthog from "posthog-js";
import Layout from "@renderer/components/Layout.vue";
import { useAuth } from "@renderer/store/auth";
import type { ValueOf } from "type-fest";
import ParamEditor from "@renderer/components/nodes/ParamEditor.vue";
import { useI18n } from "vue-i18n";
import BuildHistoryDialog from "@renderer/components/BuildHistoryDialog.vue";
import { useTour } from "@renderer/composables/useTour";
import { debounce as esDebounce } from "es-toolkit";

import { useAppSettings } from "@renderer/store/settings";
import { useAppStore } from "@renderer/store/app";

type Param = ValueOf<BlockAction["params"]>;

const router = useRouter();
const openUpgradeDialog = inject("openUpgradeDialog") as () => void;

const api = useAPI();

const fancyAnsi = new FancyAnsi();

const appSettings = useAppSettings();
const { settings: settingsRef } = storeToRefs(appSettings);

const instance = useEditor();
const {
  nodes,
  triggers,
  variables,
  name,
  currentFilePointer,
  errors,
  stepsDisplay,
  pipelineId,
  projectId,
  logLines,
  nodeStatuses,
  isRunning,
  selectedNode,
  plugins,
} = storeToRefs(instance);
const {
  loadSavedFile,
  setIsRunning,
  pushLine,
  clearLogs,
  getNodeDefinition,
  removeNode,
  setBlockValue,
  setSelectedNode,
  setActiveNode,
  onEditorChanged,
} = instance;
const { activeNode } = storeToRefs(instance);

const { t } = useI18n();

const appStore = useAppStore();
const { pluginDefinitions } = storeToRefs(appStore);

/**
 * Before loading a pipeline into the editor, check which plugin IDs it uses
 * and JIT-install any that are not yet registered.
 * Plugin versions come from each block/trigger's origin.version.
 */
const ensurePluginsLoaded = async (file: SavedFile) => {
  // Collect (pluginId → version) from all block/trigger origins
  const pluginsMap: Record<string, string> = {};
  for (const block of file.canvas.blocks) {
    if (block?.origin?.pluginId) {
      const id = block.origin.pluginId;
      const ver = block.origin.version ?? "latest";
      if (!pluginsMap[id] || pluginsMap[id] === "latest") pluginsMap[id] = ver;
    }
  }
  for (const trigger of file.canvas.triggers) {
    if (trigger?.origin?.pluginId) {
      const id = trigger.origin.pluginId;
      const ver = trigger.origin.version ?? "latest";
      if (!pluginsMap[id] || pluginsMap[id] === "latest") pluginsMap[id] = ver;
    }
  }

  if (Object.keys(pluginsMap).length === 0) return;
  console.log("[Editor] Requesting ensure-loaded for pipeline plugins:", pluginsMap);
  isJitInstalling.value = true;
  try {
    await api.execute("plugin:ensure-loaded", { plugins: pluginsMap });
  } finally {
    isJitInstalling.value = false;
  }
};

const filesStore = useFiles();
const { files } = storeToRefs(filesStore);
const { update } = filesStore;

const authStore = useAuth();
const { isLoggedIn, hasBuildHistoryBenefit } = storeToRefs(authStore);

const { startTour: triggerTour, isCompleted } = useTour("editor");

const startTour = (force = false) => {
  triggerTour(
    [
      {
        element: "#tour-editor-canvas",
        popover: {
          title: t("tour.editor-canvas-title"),
          description: t("tour.editor-canvas-description"),
        },
      },
      {
        element: "#tour-editor-save",
        popover: {
          title: t("tour.editor-save-title"),
          description: t("tour.editor-save-description"),
        },
      },
      {
        element: "#tour-editor-run",
        popover: {
          title: t("tour.editor-run-title"),
          description: t("tour.editor-run-description"),
        },
      },
      {
        element: "#tour-editor-logs",
        popover: {
          title: t("tour.editor-logs-title"),
          description: t("tour.editor-logs-description"),
        },
      },
      {
        element: "#tour-editor-close",
        popover: {
          title: t("tour.editor-close-title"),
          description: t("tour.editor-close-description"),
        },
      },
    ],
    force,
  );
};

onMounted(() => {
  // if (!isCompleted()) {
  //   setTimeout(() => {
  //     startTour()
  //   }, 1000)
  // }
});

// Build history dialog state
const showBuildHistoryDialog = ref(false);
const showProjectSettingsDialog = ref(false);

const quickLogs = ref<{ id: number; text: string; isExiting: boolean }[]>([]);

const keyToNodeName = (key: string) => {
  const foundNode = nodes.value.find((x) => x.uid === key);
  if (!foundNode) {
    return key;
  }
  const node = getNodeDefinition(foundNode.origin.nodeId, foundNode.origin.pluginId);
  if (!node) {
    return key;
  }
  return node.node.name ?? key;
};

const isLoaded = ref(false);
const isJitInstalling = ref(false);

watch(
  [projectId, pipelineId],
  async () => {
    isLoaded.value = false;
    const file = files.value.pipelines?.find((x) => x.id === pipelineId.value);

    if (file) {
      if (file.type === "external") {
        // @deprecated external files are deprecated
        const { path: filePath } = file;

        const configResult = await api.execute("config:load", { config: filePath });

        if (configResult.type === "error") {
          throw new Error(configResult.ipcError);
        }

        const content = configResult.result.result as SavedFile;
        await ensurePluginsLoaded(content);
        await loadSavedFile(content);
        isLoaded.value = true;
      } else if (file.type === "internal") {
        const { configName } = file;

        const configResult = await api.execute("config:load", { config: configName });

        if (configResult.type === "error") {
          throw new Error(configResult.ipcError);
        }

        const fileData = configResult.result;

        try {
          const content = fileData.result as SavedFile;
          await ensurePluginsLoaded(content);
          await loadSavedFile(content);
          isLoaded.value = true;
        } catch (e) {
          console.error("error", e);
          throw new Error(t("editor.invalid-file-content"));
        }
      }
    }
  },
  {
    immediate: true,
  },
);

watch(
  plugins,
  async (newPlugins) => {
    if (!isLoaded.value) return;
    console.log("[Editor] Plugins config changed, JIT ensuring loaded:", newPlugins);
    isDirty.value = true;
    debouncedSave();
    isJitInstalling.value = true;
    try {
      await api.execute("plugin:ensure-loaded", { plugins: newPlugins });
    } finally {
      isJitInstalling.value = false;
    }
  },
  { deep: true },
);

const toast = useToast();

const currentLogAccordion = ref();

const lastActiveNode = ref<BlockAction>();

const cancel = async () => {
  await api.execute("action:cancel");
};

const run = async () => {
  if (!isLoggedIn.value && authStore.hasLoginProvider) {
    authStore.displayAuthModal(
      t("editor.welcome-back"),
      t("editor.please-log-in-to-run-a-pipeline"),
    );
    return;
  }

  // Prevent run if there are any validation errors (e.g. missing / disabled plugins)
  const errorCount = Object.keys(errors.value).length;
  if (errorCount > 0) {
    const errorDetails: string[] = [];
    for (const [uid, blockErrors] of Object.entries(errors.value)) {
      const block =
        nodes.value.find((n) => n.uid === uid) || triggers.value.find((t) => t.uid === uid);
      if (!block) continue;

      const blockName = "name" in block ? block.name : undefined;

      const nodeDef = getNodeDefinition(block.origin.nodeId, block.origin.pluginId);
      if (!nodeDef) {
        errorDetails.push(
          t("editor.validation-plugin-disabled-or-missing", {
            pluginId: block.origin.pluginId,
            nodeName: blockName || block.origin.nodeId,
          }),
        );
      } else {
        for (const err of blockErrors) {
          if (err.type === "missing") {
            errorDetails.push(
              t("editor.validation-missing-param", {
                nodeName: blockName || nodeDef.node.name,
                paramName: err.param,
              }),
            );
          }
        }
      }
    }

    if (errorDetails.length > 0) {
      toast.add({
        summary: t("editor.validation-failed") || "Validation Failed",
        life: 10_000,
        severity: "error",
        detail: errorDetails.join("\n"),
      });
      return;
    }
  }

  posthog.capture("run_started");

  setIsRunning(true);
  clearLogs();

  try {
    const result = await api.execute(
      "graph:execute",
      {
        graph: klona(nodes.value),
        pipelineId: pipelineId.value,
        projectId: projectId.value,
        variables: variables.value,
        projectName: name.value,
        projectPath:
          currentFilePointer.value?.type === "external"
            ? currentFilePointer.value?.path
            : undefined, // @deprecated external files are deprecated
      },
      async (data) => {
        console.log("graph:execute data", data);
        if (data.type === "node-enter") {
          const node = nodes.value.find((n) => n.uid === data.data.nodeUid);
          if (node) {
            setActiveNode(node);
            lastActiveNode.value = node;
            nodeStatuses.value[node.uid] = "running";
            currentLogAccordion.value = node.uid;
          }
        } else if (data.type === "node-exit") {
          const node = nodes.value.find((n) => n.uid === data.data.nodeUid);
          if (node) {
            setActiveNode(undefined);
            nodeStatuses.value[node.uid] = "done";
          }
        } else if (data.type === "node-log") {
          const { nodeUid, logData } = data.data;
          console.log("logData", logData);
          const lines = logData.message.join(" ");

          const splittedInnerLines = lines.split("\n");

          for (const l of splittedInnerLines
            .map((x: string) => x.trim())
            .filter((x: string) => !!x)
            .filter((x: string) => x !== "")) {
            let content = "";

            if (hasAnsi(l)) {
              content += fancyAnsi.toHtml(l);
            } else {
              content += l;
            }

            pushLine(
              nodeUid,
              [format(logData.timestamp, "dd/MM/yyyy - hh:mm:ss"), content].join(" "),
            );
          }
        }
      },
    );

    console.log("result", result);

    if (result.type === "success") {
      if (lastActiveNode.value) {
        posthog.capture(`node_sucess`, {
          origin_node_id: lastActiveNode.value.origin.nodeId,
          origin_plugin_id: lastActiveNode.value.origin.pluginId,
        });
      }

      // Mark all nodes as done since execution completed successfully
      for (const node of nodes.value) {
        nodeStatuses.value[node.uid] = "done";
      }
    }

    if (result.type === "error") {
      if (result.code === "canceled") {
        // Build was canceled
        toast.add({
          summary: "Build canceled",
          life: 10_000,
          severity: "info",
          detail: "The build was canceled.",
        });
        posthog.capture("run_canceled");
      } else if (result.code === "error") {
        // Find the last active node and mark it as error
        if (lastActiveNode.value) {
          nodeStatuses.value[lastActiveNode.value.uid] = "error";

          posthog.capture(`node_errored`, {
            origin_node_id: lastActiveNode.value.origin.nodeId,
            origin_plugin_id: lastActiveNode.value.origin.pluginId,
          });
        }

        console.error("error while executing process", result.ipcError);
        toast.add({
          summary: t("editor.execution-failed"),
          life: 10_000,
          severity: "error",
          detail: t("editor.project-has-encountered-an-error") + result.ipcError,
        });
        posthog.capture("run_errored");
      }
    } else {
      toast.add({
        summary: t("editor.execution-done"),
        life: 10_000,
        severity: "success",
        detail: t("editor.your-project-has-been-executed-successfully"),
      });
      posthog.capture("run_succeed");
    }
  } catch (e) {
    console.error("error while executing process", e);
    console.error("UNHANDLED ERROR", e);
  }
  setActiveNode(undefined);
  setIsRunning(false);
};

const isSaving = ref(false);
const isDirty = ref(false);

const debouncedSave = esDebounce(() => {
  if (settingsRef.value?.autosave !== false) {
    onSaveRequest();
  }
}, 1000);

let isInitialLoad = true;
onEditorChanged(() => {
  if (isInitialLoad) {
    isInitialLoad = false;
    return;
  }
  isDirty.value = true;
  debouncedSave();
});

const onSaveRequest = async (silent = true) => {
  isSaving.value = true;
  const filePointer = currentFilePointer.value;
  if (!filePointer) {
    isSaving.value = false;
    return;
  }

  if (filePointer.type === "external") {
    // @deprecated external files are deprecated
    await saveLocal(filePointer.path, silent);
  } else if (filePointer.type === "internal") {
    await saveInternal(filePointer.configName, silent);
  } else {
    // TODO: save to cloud
    throw new Error("TODO");
  }
  await sleep(500);
  isSaving.value = false;
  isDirty.value = false;
};

const onCloseRequest = async () => {
  console.log("close request");
  await router.push({
    name: "Dashboard",
  });
};

const navigateToBuildHistory = async () => {
  if (!authStore.hasBuildHistoryBenefit) {
    openUpgradeDialog();
    return;
  }

  showBuildHistoryDialog.value = true;
};

const saveLocal = async (path: string, silent = false) => {
  const result: SavedFile = {
    version: "5.0.0",
    name: name.value,
    description: "",
    canvas: {
      blocks: nodes.value,
      triggers: triggers.value,
    },
    variables: variables.value,
  };

  console.log("result", result);

  await saveExternalFile(path, result);

  await update((state) => {
    state.pipelines = state.pipelines || [];
    const data = state.pipelines.find((x) => x.id === pipelineId.value);
    if (!data) return;
    if (data.type === "external") {
      // @deprecated external files are deprecated
      data.lastModified = new Date().toISOString();
    } else {
      throw new Error("Invalid file type");
    }
  });

  if (!silent) {
    toast.add({
      severity: "success",
      summary: t("editor.project-saved"),
      detail: t("editor.your-project-has-be-saved-successfully"),
    });
  }
};

const saveInternal = async (configName: string, silent = false) => {
  const result: SavedFile = {
    version: "5.0.0",
    name: name.value,
    description: "",
    canvas: {
      blocks: nodes.value,
      triggers: triggers.value,
    },
    variables: variables.value,
  };

  try {
    await api.execute("config:save", {
      config: configName,
      data: JSON.stringify(result),
    });

    await update((state) => {
      state.pipelines = state.pipelines || [];
      const data = state.pipelines.find((x) => x.id === pipelineId.value);
      if (!data) return;
      if (data.type === "external" || data.type === "internal") {
        data.lastModified = new Date().toISOString();
      } else {
        throw new Error("Invalid file type");
      }
    });

    if (!silent) {
      toast.add({
        severity: "success",
        summary: t("editor.project-saved"),
        detail: t("editor.your-project-has-be-saved-successfully"),
      });
    }
  } catch (e) {
    console.error("error", e);
    throw new Error(t("editor.project-has-encountered-an-error"));
  }
};

// TODO: proper alert and prompt

handle("dialog:alert", async (event, { value, send }) => {
  alert(value.message);

  send({
    type: "end",
    data: {
      type: "success",
      result: {
        answer: "ok",
      },
    },
  });
});

const isPromptDialogVisible = ref(false);
const promptDialogAnswer = ref("");
const onPromptDialogCancel = () => {
  if (lastPromptInfos.callback) {
    lastPromptInfos.callback({
      type: "end",
      data: {
        type: "error",
        ipcError: "canceled",
      },
    });
  }
  isPromptDialogVisible.value = false;
};
const onPromptDialogOK = () => {
  if (lastPromptInfos.callback) {
    lastPromptInfos.callback({
      type: "end",
      data: {
        type: "success",
        result: {
          answer: promptDialogAnswer.value,
        },
      },
    });
  }
  isPromptDialogVisible.value = false;
};

const lastPromptInfos = reactive({
  callback: undefined as undefined | HandleListenerRendererSendFn<"dialog:prompt">,
  message: "",
});

handle("dialog:prompt", async (event, { value, send }) => {
  lastPromptInfos.message = value.message;
  lastPromptInfos.callback = send;

  isPromptDialogVisible.value = true;
});

const bottomExpanded = ref(false);
const toggleLogsWindow = () => {
  bottomExpanded.value = !bottomExpanded.value;
};

watchThrottled(
  logLines,
  async () => {
    if (!activeNode.value) {
      return;
    }

    const currentLogItem = logLines.value[activeNode.value.uid] ?? [];
    const lastLine = currentLogItem.length - 1;

    if (lastLine < 0) {
      return;
    }

    quickLogs.value = [
      ...quickLogs.value.map((log) => ({ ...log, isExiting: true })),
      {
        id: Date.now(),
        text: String(currentLogItem[lastLine]) as string,
        isExiting: false,
      },
    ];

    await sleep(1000);

    quickLogs.value = quickLogs.value.filter((log) => !log.isExiting);
  },
  {
    throttle: 1000,
    deep: true,
  },
);

const exportLog = async () => {
  const logPaths = await api.execute("dialog:showSaveDialog", {
    defaultPath: `pipelab-${instance.projectId}-${instance.pipelineId}.log`,
  });

  const myLines = Object.entries(logLines.value);
  let html = "";
  for (const [key, value] of myLines) {
    html += `${key}\n`;
    for (const val of value) {
      html += `${"\t".repeat(2)}${stripHtml(String(val)).result}\n`;
    }
    html += `\n`;
  }

  const content = html;

  if (logPaths.type === "success") {
    if (logPaths.result.filePath) {
      await api.execute("fs:write", {
        path: logPaths.result.filePath,
        content,
      });
    }
  }
};

tinykeys(window, {
  "$mod+KeyS": (event: KeyboardEvent) => {
    event.preventDefault();
    onSaveRequest(false);
  },
});

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const nodeDefinition = computed(() => {
  if (!selectedNode.value) {
    return undefined;
  }
  const def = getNodeDefinition(
    selectedNode.value.origin.nodeId,
    selectedNode.value.origin.pluginId,
  );
  if (def) {
    return def.node;
  }
  return undefined;
});

const onValueChanged = (newValue: Param, paramKey: string) => {
  if (!selectedNode.value) {
    return;
  }
  setBlockValue(selectedNode.value.uid, {
    ...selectedNode.value,
    params: {
      ...selectedNode.value.params,
      [paramKey]: newValue,
    },
  });
};
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
      border: none;
      background: transparent;
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

      font-family: "Geist Mono", serif;

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

.logs-header {
  display: flex;
  flex-direction: row;
  flex: 1;

  .logs-animated {
    width: 100%;
    padding: 0 16px;
    opacity: 0.3;

    .log-entry {
      position: absolute;
    }
  }
}

// .log-entry {
//   position: absolute;
//   width: 100%;
//   left: 48px;
//   padding: 0 1.5rem;
// }

.drawer {
  display: flex;
  flex-direction: column;
  background-color: white;
  overflow: hidden;
  width: 100%;
  height: 100%;

  .drawer-content-inner {
    display: flex;
    flex-direction: column;
    min-width: 320px;
    width: 100%;
    height: 100%;
  }

  .drawer-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 16px;
    border-bottom: 1px solid #eee;
  }

  .drawer-body {
    flex: 1;
    overflow-y: auto;
    padding: 16px;
  }

  .drawer-footer {
    padding: 16px;
    border-top: 1px solid #eee;
  }
}

@keyframes slide-in {
  0% {
    transform: translateY(100%);
    opacity: 0;
  }
  100% {
    transform: translateY(0);
    opacity: 1;
  }
}

@keyframes slide-out {
  0% {
    transform: translateY(0);
    opacity: 1;
  }
  100% {
    transform: translateY(-100%);
    opacity: 0;
  }
}

.slide-in {
  animation: slide-in 500ms forwards;
}

.slide-out {
  animation: slide-out 500ms forwards;
}

.jit-loader-overlay {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: #0d0d14ea;
  color: #fff;
  font-family: var(--font-family, "Geist", system-ui, sans-serif);
  overflow: hidden;
  z-index: 10000;
  backdrop-filter: blur(15px);
  -webkit-backdrop-filter: blur(15px);
  transition:
    background-color 0.5s ease,
    color 0.5s ease;

  &.light-theme {
    background: rgba(248, 250, 252, 0.45);
    color: #0f172a;
    backdrop-filter: blur(28px) saturate(210%);
    -webkit-backdrop-filter: blur(28px) saturate(210%);
  }

  .ambient {
    position: absolute;
    inset: 0;
    pointer-events: none;
  }

  .orb {
    position: absolute;
    border-radius: 50%;
    filter: blur(100px);
    transition: background 0.5s ease;
  }

  .orb-1 {
    width: 40%;
    height: 40%;
    top: -10%;
    left: -10%;
    background: radial-gradient(circle, #5b52f430 0%, transparent 70%);
    animation: drift 22s ease-in-out infinite alternate;

    .light-theme & {
      background: radial-gradient(circle, rgba(99, 102, 241, 0.2) 0%, transparent 70%);
    }
  }

  .orb-2 {
    width: 35%;
    height: 35%;
    bottom: -10%;
    right: -5%;
    background: radial-gradient(circle, #3b82f625 0%, transparent 70%);
    animation: drift 28s ease-in-out infinite alternate-reverse;

    .light-theme & {
      background: radial-gradient(circle, rgba(56, 189, 248, 0.18) 0%, transparent 70%);
    }
  }

  .orb-3 {
    width: 25%;
    height: 25%;
    top: 40%;
    left: 45%;
    transform: translate(-50%, -50%);
    background: radial-gradient(circle, #7c3aed15 0%, transparent 70%);
    animation: drift 18s ease-in-out infinite alternate;

    .light-theme & {
      background: radial-gradient(circle, rgba(236, 72, 153, 0.1) 0%, transparent 70%);
    }
  }

  .grid-overlay {
    position: absolute;
    inset: 0;
    background-image:
      linear-gradient(rgba(255, 255, 255, 0.015) 1px, transparent 1px),
      linear-gradient(90deg, rgba(255, 255, 255, 0.015) 1px, transparent 1px);
    background-size: 40px 40px;
    pointer-events: none;
    transition: background-image 0.5s ease;

    .light-theme & {
      background-image:
        linear-gradient(rgba(99, 102, 241, 0.04) 1px, transparent 1px),
        linear-gradient(90deg, rgba(99, 102, 241, 0.04) 1px, transparent 1px);
    }
  }

  .jit-loader-card {
    position: relative;
    z-index: 10;
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid rgba(255, 255, 255, 0.07);
    box-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.3);
    border-radius: 24px;
    padding: 40px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1.2rem;
    max-width: 450px;
    text-align: center;
    backdrop-filter: blur(5px);
    -webkit-backdrop-filter: blur(5px);
    transition: all 0.5s ease;

    .light-theme & {
      background: rgba(255, 255, 255, 0.82);
      border: 1px solid rgba(99, 102, 241, 0.15);
      box-shadow:
        0 24px 60px rgba(15, 23, 42, 0.1),
        0 4px 20px rgba(99, 102, 241, 0.04),
        inset 0 1px 0 rgba(255, 255, 255, 0.9);
    }
  }

  .logo-wrap {
    width: 72px;
    height: 72px;
    border-radius: 20px;
    background: rgba(91, 82, 244, 0.12);
    border: 1px solid rgba(91, 82, 244, 0.28);
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow:
      0 0 30px rgba(91, 82, 244, 0.15),
      inset 0 1px 0 rgba(255, 255, 255, 0.06);
    margin-bottom: 0.2rem;
    animation: logo-pulse-dark 3s infinite ease-in-out;
    transition: all 0.5s ease;

    .light-theme & {
      background: rgba(99, 102, 241, 0.07);
      border: 1px solid rgba(99, 102, 241, 0.18);
      box-shadow:
        0 8px 24px rgba(99, 102, 241, 0.08),
        inset 0 1px 0 rgba(255, 255, 255, 0.9);
      animation: logo-pulse 3s infinite ease-in-out;
    }
  }

  .logo {
    width: 52px;
    height: 52px;
    object-fit: contain;
  }

  .jit-loader-text-container {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;

    h3 {
      margin: 0;
      font-size: 1.35rem;
      font-weight: 700;
      letter-spacing: -0.02em;
      background: linear-gradient(145deg, #fff 30%, rgba(255, 255, 255, 0.6) 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      transition: background 0.5s ease;

      .light-theme & {
        background: linear-gradient(135deg, #0f172a 30%, #4338ca 100%);
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
      }
    }

    p {
      margin: 0;
      font-size: 0.85rem;
      color: rgba(255, 255, 255, 0.5);
      line-height: 1.5;

      .light-theme & {
        color: #475569;
      }
    }
  }

  .progress-track {
    width: 280px;
    height: 4px;
    background: rgba(255, 255, 255, 0.1);
    border-radius: 99px;
    overflow: hidden;
    margin: 0.4rem 0;
    position: relative;
    transition: background 0.5s ease;

    .light-theme & {
      background: rgba(15, 23, 42, 0.06);
    }
  }

  .progress-fill {
    position: absolute;
    height: 100%;
    background: linear-gradient(90deg, #818cf8, #7c3aed);
    border-radius: 99px;
    animation: indeterminate 1.8s ease-in-out infinite;

    .light-theme & {
      background: linear-gradient(90deg, #6366f1, #4f46e5);
      box-shadow: 0 0 12px rgba(79, 70, 229, 0.25);
    }
  }

  .steps {
    min-height: 1.8rem;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .step {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    font-size: 0.75rem;
    color: rgba(255, 255, 255, 0.7);

    .light-theme & {
      color: #64748b;
      font-weight: 500;
    }
  }

  .step-icon {
    flex-shrink: 0;
    font-size: 0.75rem;
    color: #7c6af7;

    .light-theme & {
      color: #4f46e5;
    }
  }
}

/* Fade transition */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.3s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

/* Fast fade transition for parameters */
.fade-fast-enter-active,
.fade-fast-leave-active {
  transition: opacity 0.15s ease;
}

.fade-fast-enter-from,
.fade-fast-leave-to {
  opacity: 0;
}

/* Keyframes */
@keyframes drift {
  from {
    transform: translate(0, 0);
  }
  to {
    transform: translate(6vw, 4vh);
  }
}

@keyframes indeterminate {
  0% {
    left: -40%;
    right: 100%;
  }
  50% {
    left: 20%;
    right: 20%;
  }
  100% {
    left: 100%;
    right: -40%;
  }
}

@keyframes logo-pulse {
  0% {
    transform: scale(1);
    box-shadow: 0 8px 24px rgba(99, 102, 241, 0.08);
  }
  50% {
    transform: scale(1.04);
    box-shadow: 0 14px 36px rgba(99, 102, 241, 0.16);
  }
  100% {
    transform: scale(1);
    box-shadow: 0 8px 24px rgba(99, 102, 241, 0.08);
  }
}

@keyframes logo-pulse-dark {
  0% {
    transform: scale(1);
    box-shadow: 0 0 30px rgba(91, 82, 244, 0.15);
  }
  50% {
    transform: scale(1.04);
    box-shadow: 0 0 45px rgba(91, 82, 244, 0.3);
  }
  100% {
    transform: scale(1);
    box-shadow: 0 0 30px rgba(91, 82, 244, 0.15);
  }
}
</style>
