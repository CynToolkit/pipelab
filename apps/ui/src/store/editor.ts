import { computed, onMounted, ref, shallowRef, watch } from "vue";
import {
  Block,
  BlockAction,
  BlockEvent,
  SavedFile,
  savedFileMigrator,
  SavedFileValidator,
  Steps,
} from "@pipelab/shared";
import { Action, Event, PipelabNode, RendererNodeDefinition } from "@pipelab/shared";
import { Variable } from "@pipelab/shared";
import { defineStore, storeToRefs } from "pinia";
// @ts-expect-error get-value has no type definitions
import get from "get-value";
// @ts-expect-error set-value has no type definitions
import set from "set-value";
import { AddNodeEvent, AddTriggerEvent } from "@renderer/components/AddNodeButton.model";
import { useAppStore } from "./app";
import { useFiles } from "./files";
import { useRouteParams } from "@vueuse/router";
import { ValidationError } from "@renderer/models/error";
import { isRequired } from "@pipelab/shared";
import { useLogger } from "@pipelab/shared";
import { nanoid } from "nanoid";
import { klona } from "klona";
import { create } from "mutative";
import { parse, value } from "valibot";
import { createEventHook, watchDebounced } from "@vueuse/core";
import { makeResolvedParams } from "@pipelab/shared";
import { useAPI } from "@renderer/composables/api";
import { createQuickJsFromVariant, newVariant, RELEASE_SYNC } from "@pipelab/shared";
// @ts-ignore — Vite ?url suffix resolves the WASM file URL at build time
import wasmLocation from "@jitl/quickjs-wasmfile-release-sync/wasm?url";
const _browserVariant = newVariant(RELEASE_SYNC, { wasmLocation });
const createQuickJsBrowser = () => createQuickJsFromVariant(_browserVariant);
import { Context } from "@pipelab/shared";

// Definitions
export const isActionDefinition = (nodeDefinition: PipelabNode): nodeDefinition is Action => {
  return nodeDefinition.type === "action";
};

export const isEventDefinition = (nodeDefinition: PipelabNode): nodeDefinition is Event => {
  return nodeDefinition.type === "event";
};

export const isActionBlock = (nodeDefinition: Block): nodeDefinition is BlockAction => {
  return nodeDefinition.type === "action";
};

export type BlockToNode<T extends Block> = T["type"] extends "action"
  ? Action
  : T["type"] extends "event"
    ? Event
    : never;

export type Status = "idle" | "running" | "error" | "canceled" | "done";

export const useEditor = defineStore("editor", () => {
  const appStore = useAppStore();
  const { presets, pluginDefinitions } = storeToRefs(appStore);
  const { getNodeDefinition, getPluginDefinition } = appStore;

  const { logger } = useLogger();

  const filesStore = useFiles();
  const { files } = storeToRefs(filesStore);

  const pipelineId = useRouteParams<string>("pipelineId");
  const projectId = useRouteParams<string>("projectId");

  const name = ref("");
  const description = ref("");

  /**
   * Derived list of plugin IDs referenced by all block/trigger origins.
   * Bundled mode: no versions — every referenced plugin is expected to be
   * registered (see plugin:ensure-loaded).
   */
  const plugins = computed<string[]>(() => {
    const ids = new Set<string>();
    for (const block of blocks.value) {
      if (block?.origin?.pluginId) {
        ids.add(block.origin.pluginId);
      }
    }
    for (const trigger of triggers.value) {
      if (trigger?.origin?.pluginId) {
        ids.add(trigger.origin.pluginId);
      }
    }
    return [...ids];
  });

  const isRunning = ref(false);
  const setIsRunning = (value: boolean) => {
    isRunning.value = value;
  };

  /** All the nodes on the editor */
  const blocks = ref<Array<Block>>([]);

  /** All the trigger nodes on the editor */
  const triggers = ref<Array<BlockEvent>>([]);

  /** All the variables of the editor */
  const variables = ref<Array<Variable>>([]);

  /** All the environnement variables supported for the editor */
  const environnements = ref<Array<any>>([]);

  /** All log lines relative to their plugin instance */
  const logLines = ref<Record<string, unknown[]>>({});
  const artifactsLog = ref<Record<string, { name: string; path: string }[]>>({});

  const nodeStatuses = ref<Record<string, Status>>({});

  const asyncErrors = ref<Record<string, ValidationError[]>>({});

  const validateAsync = async () => {
    const newErrors: Record<string, ValidationError[]> = {};
    const allNodes = [...blocks.value, ...triggers.value];

    for (const node of allNodes) {
      if (node.type === "action" || node.type === "event") {
        const definition = getNodeDefinition(node.origin.nodeId, node.origin.pluginId);
        if (!definition) continue;

        const pathParams = Object.entries(definition.node?.params ?? {}).filter(
          ([_, param]) => param.control.type === "path" && param.control.warnIfBlacklisted,
        );

        const nodeErrors: ValidationError[] = [];

        for (const [key, param] of pathParams) {
          let val = node.params[key]?.value;
          if (val && typeof val === "string") {
            val = val.trim();
            if (val.startsWith('"') && val.endsWith('"')) {
              val = val.slice(1, -1);
            }

            try {
              const api = useAPI();
              const response = await api.execute("fs:isPathBlacklisted", { path: val });
              if (response.type === "success" && response.result.isBlacklisted) {
                nodeErrors.push({
                  type: "blacklisted",
                  param: key,
                });
              }
            } catch (e) {
              logger().error("Failed to check blacklist in store for path:", val, e);
            }
          }
        }

        if (nodeErrors.length > 0) {
          newErrors[node.uid] = nodeErrors;
        }
      }
    }

    asyncErrors.value = newErrors;
  };

  watchDebounced(
    [blocks, triggers],
    () => {
      validateAsync();
    },
    { deep: true, immediate: true, debounce: 300 },
  );

  const pushLine = (nodeUid: string, data: string) => {
    if (!logLines.value[nodeUid]) {
      logLines.value[nodeUid] = [];
    }
    logLines.value[nodeUid].push(data);
  };

  const pushArtifact = (nodeUid: string, artifact: { name: string; path: string }) => {
    if (!artifactsLog.value[nodeUid]) {
      artifactsLog.value[nodeUid] = [];
    }
    artifactsLog.value[nodeUid].push(artifact);
  };

  const clearLogs = () => {
    logLines.value = {};
    artifactsLog.value = {};
  };

  const currentFilePointer = computed(() => {
    return files.value.pipelines?.find((x) => x.id === pipelineId.value);
  });

  // const savedFile = computed(() => {
  //   return {
  //     version: '2.0.0',
  //     name: toRaw(name.value),
  //     description: '',
  //     canvas: {
  //       blocks: toRaw(blocks.value),
  //       triggers: toRaw(triggers.value)
  //     },
  //     variables: toRaw(variables.value)
  //   } satisfies SavedFile
  // })

  // watchEffect(async () => {
  //   if (id.value === undefined) {
  //     return
  //   }
  //   await update((state) => {
  //     state[id.value] = {
  //       data: savedFile.value,
  //     }
  //   })
  // })

  const stepsDisplay = computed(() => {
    const result: Steps = {};

    for (const node of blocks.value) {
      const pluginDef = getNodeDefinition(node.origin.nodeId, node.origin.pluginId);

      if (!result[node.uid]) {
        result[node.uid] = {
          outputs: {},
        };
      }

      if (pluginDef) {
        if (pluginDef.node.type === "action") {
          const outputs = pluginDef.node.outputs;

          for (const [key, output] of Object.entries(outputs)) {
            /*
            <i
              class="mdi mdi-play-circle"
              />
            */
            result[node.uid]["outputs"][key] =
              `<span class="step">${node.name ?? pluginDef.node.name} → ${output.label}</span>`;
          }
        }
      }
    }

    return result;
  });

  const activeNode = ref<BlockAction>();
  const setActiveNode = (node: BlockAction | undefined) => {
    activeNode.value = node;
  };

  const selectedNodeUid = ref<string | undefined>();
  const selectedNode = computed(() => {
    if (!selectedNodeUid.value) {
      return undefined;
    }
    return blocks.value.find((x) => x.uid === selectedNodeUid.value);
  });
  const setSelectedNode = (node: BlockAction | undefined) => {
    console.log("node", node);
    selectedNodeUid.value = node?.uid;
  };

  /** All the plugins's node definitions */
  const nodeDefinitions = computed(() => {
    return pluginDefinitions.value
      .map((x) =>
        x.nodes.map((n) => ({
          ...n,
          plugin: x.id,
        })),
      )
      .flat(3) satisfies RendererNodeDefinition[];
  });

  const clear = () => {
    blocks.value = [];
    variables.value = [];
    triggers.value = [];
    asyncErrors.value = {};
    setActiveNode(undefined);
    setSelectedNode(undefined);
  };

  const errors = computed(() => {
    const editorErrors: Record<string, ValidationError[]> = {};
    const allNodes = [...blocks.value, ...triggers.value];

    for (const node of allNodes) {
      const syncErrors = validate(node);
      const customErrors = asyncErrors.value[node.uid] ?? [];
      const combined = [...syncErrors, ...customErrors];

      if (combined.length > 0) {
        editorErrors[node.uid] = combined;
      }
    }

    return editorErrors;
  });

  const validate = (block: Block | BlockEvent) => {
    const errors: ValidationError[] = [];
    if (block.type === "action" || block.type === "event") {
      const definition = getNodeDefinition(block.origin.nodeId, block.origin.pluginId);
      if (!definition) {
        errors.push({
          type: "missing",
          param: block.origin.nodeId + ":" + block.origin.pluginId,
        });
        logger().warn(`Missing required node "${block.origin.nodeId}:${block.origin.pluginId}"`);
        return errors;
      }
      const requiredParams = Object.entries(definition.node?.params ?? {});
      for (const [key, param] of requiredParams) {
        if (
          (isRequired(param) && !(key in block.params)) ||
          (isRequired(param) && !block.params[key].value)
        ) {
          logger().warn(`Missing required param "${key}" in node "${block.uid}"`);
          errors.push({
            type: "missing",
            param: key,
          });
        }
      }
    }
    return errors;
  };

  const loadSavedFile = async (data: Readonly<SavedFile>) => {
    clear();

    // ensure all params are there
    const finalData = create(data, (draft) => {
      for (const block of draft.canvas.blocks) {
        const definition = getNodeDefinition(block.origin.nodeId, block.origin.pluginId);
        if (definition) {
          const params = definition.node.params;
          for (const param of Object.keys(params)) {
            if (!(param in block.params)) {
              console.log("params[param]", params[param]);
              console.warn("adding mising param", param, {
                editor: "simple",
                value: params[param].value,
              });
              block.params[param] = {
                editor: "simple",
                value: params[param].value,
              };
            }
          }
        }
      }
    });

    await parse(SavedFileValidator, finalData);

    name.value = finalData.name;
    description.value = finalData.description;
    // plugins is now derived as a computed from block origins — no assignment needed

    for (const variable of finalData.variables) {
      addVariable(variable);
    }

    for (const block of finalData.canvas.blocks) {
      blocks.value.push(block);
      validate(block);
    }

    for (const trigger of finalData.canvas.triggers) {
      triggers.value.push(trigger);
      validate(trigger);
    }

    // // load connections
    // for (const connection of data.connections) {
    //   editor.addConnection({
    //     id: connection.uid,
    //     source: connection.sourceUid,
    //     sourceOutput: connection.sourcePort,
    //     target: connection.targetUid,
    //     targetInput: connection.targetPort
    //   })
    // }

    // console.log('/ loadSchemaIntoEditor')
  };

  /**
   * TODO: support nested removals
   */
  const removeNode = (nodeId: string) => {
    const nodeIndex = blocks.value.findIndex((b) => b.uid === nodeId);
    if (nodeIndex > -1) {
      blocks.value = [
        ...blocks.value.slice(0, nodeIndex),
        ...blocks.value.slice(nodeIndex + 1, undefined),
      ];
    }
  };

  const removeTrigger = (triggerId: string) => {
    const triggerIndex = triggers.value.findIndex((b) => b.uid === triggerId);
    if (triggerIndex > -1) {
      triggers.value = [
        ...triggers.value.slice(0, triggerIndex),
        ...triggers.value.slice(triggerIndex + 1, undefined),
      ];
    }
  };

  const setBlockValue = (nodeId: string, value: Block) => {
    const nodeIndex = blocks.value.findIndex((b) => b.uid === nodeId);
    if (nodeIndex > -1) {
      // replace node
      blocks.value = [
        ...blocks.value.slice(0, nodeIndex),
        value,
        ...blocks.value.slice(nodeIndex + 1, undefined),
      ];
    }
  };

  const setTriggerValue = (nodeId: string, value: BlockEvent) => {
    const nodeIndex = triggers.value.findIndex((b) => b.uid === nodeId);
    if (nodeIndex > -1) {
      // replace node
      triggers.value = [
        ...triggers.value.slice(0, nodeIndex),
        value,
        ...triggers.value.slice(nodeIndex + 1, undefined),
      ];
    }
  };

  const swapNodes = (index: number, direction: "up" | "down") => {
    const newIndex = index + (direction === "up" ? -1 : 1);
    const output = blocks.value.map((element, _index) =>
      _index === index
        ? blocks.value[newIndex]
        : _index === newIndex
          ? blocks.value[index]
          : element,
    );
    console.log("input", blocks.value);
    console.log("output", output);

    blocks.value = output;
  };

  const cloneNode = (node: Block, newIndex: number) => {
    const newNode = klona(node);
    newNode.uid = nanoid();
    addNodeToBlock(newNode, [], newIndex);
  };

  const disableNode = (node: Block) => {
    blocks.value = create(klona(blocks.value), (draft) => {
      for (let i = 0; i < draft.length; i += 1) {
        if (draft[i].uid === node.uid) {
          draft[i].disabled = true;
        }
      }
    });
  };

  const enableNode = (node: Block) => {
    blocks.value = create(klona(blocks.value), (draft) => {
      for (let i = 0; i < draft.length; i += 1) {
        if (draft[i].uid === node.uid) {
          draft[i].disabled = false;
        }
      }
    });
  };

  const addNode = (event: AddNodeEvent) => {
    const { node: nodeDefinition, path, plugin: pluginDefinition, insertAt } = event;

    if (nodeDefinition && pluginDefinition) {
      if (isActionDefinition(nodeDefinition)) {
        console.log("nodeDefinition", nodeDefinition);

        const createParams: BlockAction["params"] = {};
        for (const [key, param] of Object.entries(nodeDefinition.params)) {
          // ensure the value is converted to code expression
          const val = param.value;

          createParams[key] = {
            editor: "simple",
            value: val,
          };
        }

        console.log("createParams", createParams);

        const node: BlockAction = {
          uid: nanoid(),
          name: nodeDefinition.name,
          type: nodeDefinition.type,
          origin: {
            nodeId: nodeDefinition.id,
            pluginId: pluginDefinition.id,
          },
          params: createParams,
        };
        addNodeToBlock(node, path, insertAt);
      } else {
        logger().error("Unhandled", nodeDefinition);
      }
    }
  };

  const addTrigger = (event: AddTriggerEvent) => {
    const { trigger: triggerDefinition, path, plugin: pluginDefinition, insertAt } = event;

    if (triggerDefinition && pluginDefinition) {
      if (isEventDefinition(triggerDefinition)) {
        const node: BlockEvent = {
          uid: nanoid(),
          type: triggerDefinition.type,
          origin: {
            nodeId: triggerDefinition.id,
            pluginId: pluginDefinition.id,
          },
          params: {},
        };
        addTriggerToBlock(node, path, insertAt);
      } else {
        logger().error("Unhandled", triggerDefinition);
      }
    }
  };

  const addTriggerToBlock = (node: BlockEvent, path: string[], insertAt: number) => {
    const value = path.length === 0 ? triggers.value : get(triggers.value, path);

    // const firstPart = value.slice(0, insertAt)
    // const secondPart = value.slice(insertAt + 1)

    const newValue = [
      ...value.slice(0, insertAt),
      node,
      ...value.slice(
        insertAt, // already has +1
      ),
    ];
    if (path.length === 0) {
      triggers.value = newValue;
    } else {
      set(triggers.value, path, newValue);
    }

    return;
  };

  // const addNodeToBlock = (node: Block, path: string[], insertAt: number) => {
  //   console.log('node', node)
  //   console.log('path', path)
  //   console.log('insertAt', insertAt)
  //   const value = path.length === 0 ? blocks.value : get(blocks.value, path)

  //   const firstPart = value.slice(0, insertAt)
  //   const secondPart = value.slice(insertAt + 1)

  //   const newValue = [
  //     ...value.slice(0, insertAt),
  //     node,
  //     ...value.slice(
  //       insertAt // already has +1
  //     )
  //   ]
  //   if (path.length === 0) {
  //     blocks.value = newValue
  //   } else {
  //     set(blocks.value, path, newValue)
  //   }

  //   return
  // }

  const addNodeToBlock = (node: Block, path: string[], insertAt: number) => {
    console.log("node", node);
    console.log("path", path);
    console.log("insertAt", insertAt);

    const value = blocks.value;

    const newValue = [
      ...value.slice(0, insertAt),
      node,
      ...value.slice(
        insertAt, // already has +1
      ),
    ];
    blocks.value = newValue;

    return;
  };

  const addVariable = (variable: Variable) => {
    variables.value.push(variable);
  };

  const removeVariable = (id: string) => {
    const index = variables.value.findIndex((x) => x.id === id);
    variables.value = [
      ...variables.value.slice(0, index),
      ...variables.value.slice(index + 1, undefined),
    ];
  };

  const updateVariable = (variable: Variable) => {
    variables.value = create(variables.value, (draft) => {
      console.log("draft", draft);
      for (let i = 0; i < draft.length; i += 1) {
        console.log("draft[i]", draft[i]);
        if (draft[i].id === variable.id) {
          draft[i] = klona(variable);
        }
      }
      return draft;
    });
  };

  const loadPreset = async (preset: string) => {
    if (!presets.value) {
      throw new Error("No presets");
    }

    if (preset) {
      const selectedPreset = presets.value[preset];
      if (selectedPreset) {
        await loadSavedFile(selectedPreset.data);
      }
    }
  };

  const variablesDisplay = computed(() => {
    const result: Record<string, string> = {};
    for (const variable of variables.value) {
      result[variable.id] = `<div class="variable">@${variable.name}</div>`;
    }
    return result;
  });

  const vm = shallowRef();
  createQuickJsBrowser().then((_vm) => {
    vm.value = _vm;
  });

  const whenModified = createEventHook();

  async function saveParams() {
    const newResolvedParams: Record<string, Record<string, unknown>> = {};

    for (const block of blocks.value) {
      if (block.type === "action") {
        const resolved = await makeResolvedParams(
          {
            params: block.params,
            steps: stepsDisplay.value,
            context: {},
            variables: variablesDisplay.value,
          },
          (item) => {
            return item;
          },
          vm.value,
        );
        newResolvedParams[block.uid] = resolved;
      }
    }

    resolvedParams.value = newResolvedParams;
    whenModified.trigger();
  }

  const resolvedParams = ref<Record<string, Record<string, unknown>>>({});
  watch([blocks, stepsDisplay, variablesDisplay], saveParams, {
    deep: true,
  });

  onMounted(() => {
    console.group("onMounted");
    saveParams();
    console.groupEnd();
  });

  return {
    nodes: blocks,
    triggers,
    variables,
    environnements,
    nodeDefinitions,
    activeNode,
    selectedNode,
    name,
    pipelineId,
    projectId,
    description,
    plugins,
    errors,

    stepsDisplay,

    currentFilePointer,

    pushLine,
    pushArtifact,
    clearLogs,
    logLines,
    asyncErrors,
    artifactsLog,

    nodeStatuses,

    setActiveNode,
    setSelectedNode,
    setBlockValue,
    setTriggerValue,
    removeNode,
    removeTrigger,

    clear,
    loadSavedFile,
    addNode,
    addNodeToBlock,

    addTrigger,
    addTriggerToBlock,

    addVariable,
    updateVariable,
    removeVariable,
    getPluginDefinition,
    getNodeDefinition,
    loadPreset,
    isRunning,
    setIsRunning,

    swapNodes,
    cloneNode,
    disableNode,
    enableNode,

    saveParams,

    vm,
    resolvedParams,
    steps: stepsDisplay,

    // Hooks
    onEditorChanged: whenModified.on,
  };
});

export type UseEditorFn = ReturnType<typeof useEditor>;
