import { nanoid } from "nanoid";
import { usePlugins } from "@pipelab/shared";
import { RendererPluginDefinition } from "@pipelab/shared";
import { downloadFile, DownloadHooks } from "./utils/fs-extras";
import { access, chmod, mkdir, rm, writeFile, readdir, cp } from "node:fs/promises";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { isDev, projectRoot, PipelabContext } from "./context";
import { constants, existsSync } from "node:fs";
import { processGraph } from "@pipelab/shared";
import { handleActionExecute } from "./handler-func";
import { useLogger } from "@pipelab/shared";
import { BuildHistoryStorage } from "./handlers/build-history";
import type { BuildHistoryEntry } from "@pipelab/shared";
import type { Variable } from "@pipelab/shared";

import { ensure, generateTempFolder, extractTarGz, extractZip, zipFolder } from "./utils/fs-extras";
import { fetchPipelabAsset, fetchPipelabPlugin } from "./utils/remote";
import { setupConfigFile } from "./config";
import { AppConfig } from "@pipelab/shared";

export const getFinalPlugins = () => {
  const { plugins } = usePlugins();
  // console.log('plugins.value', plugins.value)

  const finalPlugins: RendererPluginDefinition[] = [];

  for (const plugin of plugins.value) {
    const finalNodes = [];

    const transformUrl = (url: string) => {
      if (url.startsWith("file://")) {
        return url.replace("file://", "media://");
      }
      return url;
    };

    const finalIcon =
      plugin.icon?.type === "image"
        ? {
            ...plugin.icon,
            image: transformUrl(plugin.icon.image),
          }
        : plugin.icon;

    for (const nodeDef of plugin.nodes) {
      const node = nodeDef.node;
      finalNodes.push({
        ...nodeDef,
        node: {
          ...node,
          icon: transformUrl(node.icon),
        },
      });
    }

    finalPlugins.push({
      ...plugin,
      icon: finalIcon,
      nodes: finalNodes,
    });
  }

  return finalPlugins;
};

import { ensureNodeJS, ensurePNPM } from "./utils/remote";

export const executeGraphWithHistory = async ({
  graph,
  variables,
  projectName,
  projectPath,
  pipelineId,
  onNodeEnter,
  onNodeExit,
  onLog,
  abortSignal,
  mainWindow,
  cachePath,
  context,
}: {
  graph: any;
  variables: Variable[];
  projectName: string;
  projectPath: string;
  pipelineId: string;
  onNodeEnter?: (node: any) => void;
  onNodeExit?: (node: any) => void;
  onLog?: (data: any, node?: any) => void;
  abortSignal: AbortSignal;
  mainWindow?: any;
  cachePath: string;
  context: PipelabContext;
}) => {
  const ctx = context;
  const buildHistoryStorage = new BuildHistoryStorage(ctx);
  const buildId = nanoid();
  const startTime = Date.now();

  // Save initial build history entry
  const now = Date.now();
  const initialEntry: BuildHistoryEntry = {
    id: buildId,
    projectName,
    projectPath,
    pipelineId,
    startTime,
    status: "running",
    logs: [],
    steps: [],
    totalSteps: graph.length,
    completedSteps: 0,
    failedSteps: 0,
    cancelledSteps: 0,
    createdAt: now,
    updatedAt: now,
  };
  const shouldDisableHistory = process.env.PIPELAB_DISABLE_HISTORY === "true";

  if (!shouldDisableHistory) {
    await buildHistoryStorage.save(initialEntry);
  }

  const logs: any[] = [];
  const sandboxPath = await generateTempFolder(cachePath);
  const { logger } = useLogger();

  // Ensure all plugins used in the graph are downloaded and registered
  const { registerPlugins, plugins: registeredPlugins } = usePlugins();
  const pluginIds = new Set(
    graph.map((node: any) => node.origin?.pluginId).filter(Boolean),
  ) as Set<string>;

  for (const pluginId of pluginIds) {
    const isRegistered = registeredPlugins.value.some((p) => p.id === pluginId);
    if (!isRegistered) {
      logger().info(`[Runner] Plugin "${pluginId}" not found, attempting to load...`);
      try {
        const packageName = `@pipelab/plugin-${pluginId}`;

        const { packageDir, entryPoint } = await fetchPipelabPlugin(packageName, "latest", {
          context: ctx,
        });
        const pluginModule = await import(pathToFileURL(entryPoint).href);
        const pluginDefinition = pluginModule.default;

        registerPlugins([pluginDefinition]);
        logger().info(`[Runner] Plugin "${pluginId}" loaded and registered successfully`);
      } catch (e) {
        logger().error(`[Runner] Failed to load or register plugin "${pluginId}":`, e);
      }
    }
  }

  logger().info(`[Sandbox] Execution sandbox created at: ${sandboxPath}`);
  const settingsFile = await setupConfigFile<AppConfig>("settings", { context: ctx });
  const config = await settingsFile.getConfig();
  const shouldCleanup = true;

  try {
    const result = await processGraph({
      graph,
      definitions: getFinalPlugins(),
      variables,
      steps: {},
      context: {},
      onExecuteItem: async (node, params, steps) => {
        if (node.type === "action") {
          return await handleActionExecute(
            node.origin.nodeId,
            node.origin.pluginId,
            params,
            mainWindow,
            async (data) => {
              if (data.type === "log") {
                const logEntry = {
                  type: data.type,
                  message: data.data.message,
                  timestamp: data.data.time,
                  nodeUid: node?.uid,
                };
                logs.push(logEntry);
                onLog?.(data, node);
              }
            },
            abortSignal,
            sandboxPath,
            cachePath,
            ctx,
          );
        }
        throw new Error(`Execution of node type ${node.type} not implemented in utils.ts`);
      },
      onNodeEnter: (node) => {
        onNodeEnter?.(node);
      },
      onNodeExit: (node) => {
        onNodeExit?.(node);
      },
      abortSignal,
    });

    const endTime = Date.now();
    if (!shouldDisableHistory) {
      await buildHistoryStorage.update(
        buildId,
        {
          status: "completed",
          endTime,
          duration: endTime - startTime,
          output: result.steps,
          logs,
        },
        pipelineId,
      );
    }

    return { result, buildId };
  } catch (error) {
    const endTime = Date.now();
    const isCanceled = error instanceof Error && error.name === "AbortError";

    if (!shouldDisableHistory) {
      await buildHistoryStorage.update(
        buildId,
        {
          status: isCanceled ? "cancelled" : "failed",
          endTime,
          duration: endTime - startTime,
          error: {
            message: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : undefined,
            timestamp: endTime,
          },
          logs,
        },
        pipelineId,
      );
    }

    throw error;
  } finally {
    // Apply retention policy regardless of outcome
    if (!shouldDisableHistory) {
      // Don't await, let it run in the background
      buildHistoryStorage.applyRetentionPolicy();
    }
    
    if (shouldCleanup) {
      try {
        await rm(sandboxPath, { recursive: true, force: true });
      } catch (e) {
        console.warn(`Failed to cleanup sandbox at ${sandboxPath}:`, e);
      }
    }
  }
};
