import { useAPI, HandleListenerSendFn } from "../ipc-core";
import { userDataPath } from "../context";
import { useLogger } from "@pipelab/shared";
import { getFinalPlugins, executeGraphWithHistory } from "../utils";
import { presets } from "../presets/list";
import { handleActionExecute, handleConditionExecute } from "../handler-func";
import { generateTempFolder } from "@pipelab/plugin-core";
import { tmpdir } from "node:os";
import { setupConfigFile } from "../config";
import { AppConfig } from "@pipelab/shared";

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
    const cwd = await generateTempFolder(tmpdir());
    await handleConditionExecute(nodeId, pluginId, params, cwd);
  });

  let abortControllerGraph: undefined | AbortController = undefined;

  const effectiveActionExecute = async (
    nodeId: string,
    pluginId: string,
    params: Record<string, string>,
    mainWindow: any | undefined,
    send: HandleListenerSendFn<"action:execute">,
    cwd: string,
    cachePath: string,
  ) => {
    try {
      const result = await handleActionExecute(
        nodeId,
        pluginId,
        params,
        mainWindow,
        send,
        abortControllerGraph!.signal,
        cwd,
        cachePath,
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
    const settings = await setupConfigFile<AppConfig>("settings");
    const config = await settings.getConfig();

    const cachePath = config?.cacheFolder || tmpdir();
    const cwd = await generateTempFolder(cachePath);

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
      effectiveActionExecute(nodeId, pluginId, params, mainWindow, send, cwd, cachePath),
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
    const settings = await setupConfigFile<AppConfig>("settings");
    const config = await settings.getConfig();

    const effectiveProjectName = projectName || "Unnamed Project";
    const effectiveProjectPath = projectPath || "";
    const effectivePipelineId = pipelineId || "unknown";
    const effectiveCachePath = config?.cacheFolder || tmpdir();

    const mainWindow = undefined;
    abortControllerGraph = new AbortController();

    try {
      const { result, buildId } = await executeGraphWithHistory({
        graph,
        variables,
        projectName: effectiveProjectName,
        projectPath: effectiveProjectPath,
        pipelineId: effectivePipelineId,
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
        cachePath: effectiveCachePath,
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
      console.error("Graph execution failed:", e);
      logger().error("Graph execution failed:", e);
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
