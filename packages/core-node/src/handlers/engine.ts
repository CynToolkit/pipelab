import { useAPI, HandleListenerSendFn } from "../ipc-core";
import { userDataPath } from "../context";
import { useLogger } from "@pipelab/shared/logger";
import { getFinalPlugins, executeGraphWithHistory } from "../utils";
import { presets } from "../presets/list";
import { handleActionExecute, handleConditionExecute } from "../handler-func";

export const registerEngineHandlers = () => {
  const { handle } = useAPI();
  const { logger } = useLogger();

  handle("nodes:get", async (_, { send }) => {
    const finalPlugins = getFinalPlugins();
    send({
      type: "end",
      data: {
        type: "success",
        result: {
          nodes: finalPlugins,
        },
      },
    });
  });

  handle("presets:get", async (_, { send }) => {
    const presetData = await presets();
    send({
      type: "end",
      data: {
        type: "success",
        result: presetData,
      },
    });
  });

  handle("condition:execute", async (_, { value }) => {
    const { nodeId, params, pluginId } = value;
    await handleConditionExecute(nodeId, pluginId, params);
  });

  let abortControllerGraph: undefined | AbortController = undefined;

  const effectiveActionExecute = async (
    nodeId: string,
    pluginId: string,
    params: Record<string, string>,
    mainWindow: any | undefined,
    send: HandleListenerSendFn<"action:execute">,
  ) => {
    try {
      const result = await handleActionExecute(
        nodeId,
        pluginId,
        params,
        mainWindow,
        send,
        abortControllerGraph!.signal,
      );

      await send({
        data: result,
        type: "end",
      });
    } catch (e) {
      console.error("Error during action execution:", e);
      await send({
        type: "end",
        data: {
          ipcError: e instanceof Error ? e.message : "Unknown error",
          type: "error",
        },
      });
    }
  };

  handle("action:execute", async (event, { send, value }) => {
    const { nodeId, params, pluginId } = value;
    const mainWindow = undefined;
    abortControllerGraph = new AbortController();

    const signalPromise = new Promise((resolve, reject) => {
      abortControllerGraph!.signal.addEventListener("abort", async () => {
        await send({
          type: "end",
          data: {
            ipcError: "Action aborted",
            type: "error",
          },
        });
        return reject(new Error("Action interrupted"));
      });
    });

    await Promise.race([
      signalPromise,
      effectiveActionExecute(nodeId, pluginId, params, mainWindow, send),
    ]);
  });

  handle("constants:get", async (_, { send }) => {
    const userData = userDataPath;
    send({
      type: "end",
      data: {
        type: "success",
        result: {
          result: {
            userData,
          },
        },
      },
    });
  });

  handle("action:cancel", async (_, { send }) => {
    if (abortControllerGraph) {
      abortControllerGraph.abort("Interrupted by user");
    }
    send({
      type: "end",
      data: {
        type: "success",
        result: {
          result: "ok",
        },
      },
    });
  });

  handle("graph:execute", async (event, { send, value }) => {
    const { graph, variables, projectName, projectPath, pipelineId } = value;
    const mainWindow = undefined;
    abortControllerGraph = new AbortController();

    try {
      const { result, buildId } = await executeGraphWithHistory({
        graph,
        variables,
        projectName,
        projectPath,
        pipelineId,
        mainWindow,
        onNodeEnter: (node) => {
          send({
            type: "node-enter",
            data: {
              nodeUid: node.uid,
              nodeName: node.name,
            },
          });
        },
        onNodeExit: (node) => {
          send({
            type: "node-exit",
            data: {
              nodeUid: node.uid,
              nodeName: node.name,
            },
          });
        },
        onLog: (data, node) => {
          if (data.type === "log") {
            const sanitizedData = {
              message: data.data.message,
              timestamp: data.data.time,
            };
            send({
              type: "node-log",
              data: {
                nodeUid: node?.uid || "unknown",
                logData: sanitizedData,
              },
            });
          }
        },
        abortSignal: abortControllerGraph!.signal,
      });

      send({
        type: "end",
        data: {
          type: "success",
          result: {
            result,
            buildId,
          },
        },
      });
    } catch (e) {
      const isCanceled = e instanceof Error && e.name === "AbortError";
      send({
        type: "end",
        data: {
          type: "error",
          code: isCanceled ? "canceled" : "error",
          ipcError: e instanceof Error ? e.message : "Unknown error",
        },
      });
    }
  });
};
