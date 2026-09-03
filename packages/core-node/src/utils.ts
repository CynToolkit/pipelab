import { nanoid } from "nanoid";
import {
  usePlugins,
  RendererPluginDefinition,
  processGraph,
  useLogger,
  BuildHistoryEntry,
  Variable,
  transformUrl,
} from "@pipelab/shared";
import { mkdir, rm, cp, stat } from "node:fs/promises";
import { join } from "node:path";
import { PipelabContext } from "./context";
import { handleActionExecute } from "./handler-func";
import { BuildHistoryStorage } from "./handlers/build-history";

import { getFolderSize } from "./utils/fs-extras";
import { setupSettingsConfigFile } from "./config";

export const getFinalPlugins = () => {
  const { plugins } = usePlugins();
  // console.log('plugins.value', plugins.value)

  const finalPlugins: RendererPluginDefinition[] = [];

  for (const plugin of plugins.value) {
    const finalNodes = [];

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


export const executeGraphWithHistory = async ({
  graph,
  variables,
  projectName,
  projectPath,
  pipelineId,
  onNodeEnter,
  onNodeExit,
  onLog,
  onArtifact,
  onArtifactsFinalized,
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
  onArtifact?: (name: string, path: string, node?: any) => void;
  onArtifactsFinalized?: (artifacts: import("@pipelab/shared").Artifact[]) => void;
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
    cachePath,
    startTime,
    status: "running",
    logs: [],
    steps: [],
    metadata: {
      os: process.platform,
      arch: process.arch,
      nodeVersion: process.version,
    },
    totalSteps: graph.length,
    completedSteps: 0,
    failedSteps: 0,
    cancelledSteps: 0,
    createdAt: now,
    updatedAt: now,
  };
  const executionSteps = initialEntry.steps;
  const shouldDisableHistory = process.env.PIPELAB_DISABLE_HISTORY === "true";

  if (!shouldDisableHistory) {
    await buildHistoryStorage.save(initialEntry);
  }

  const logs: any[] = [];
  const sandboxPath = await ctx.createTempFolder("pipeline-sandbox-");
  const { logger } = useLogger();
  let completedSteps = 0;
  let failedSteps = 0;
  let cancelledSteps = 0;
  const collectedArtifacts: import("@pipelab/shared").Artifact[] = [];

  // Ensure all plugins used in the graph are downloaded and registered
  const { registerPlugins, plugins: registeredPlugins } = usePlugins();
  // JIT loading is intentionally removed here so plugins must be loaded at app startup.
  // Fail-fast if any required plugin is not loaded
  const pluginIds = new Set(
    graph.map((node: any) => node.origin?.pluginId).filter(Boolean),
  ) as Set<string>;

  const missingPlugins: string[] = [];
  for (const pluginId of pluginIds) {
    const isRegistered = registeredPlugins.value.some((p) => p.id === pluginId);
    if (!isRegistered) {
      missingPlugins.push(pluginId);
    }
  }

  if (missingPlugins.length > 0) {
    const errorMsg = `Fail-fast: The following required plugins are not loaded: ${missingPlugins.join(", ")}. Please ensure they are installed and enabled in settings.`;
    logger().error(`[Runner] ${errorMsg}`);
    throw new Error(errorMsg);
  }

  logger().info(`[Sandbox] Execution sandbox created at: ${sandboxPath}`);
  const settingsFile = await setupSettingsConfigFile(ctx);
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
                  id: nanoid(),
                  level: "info" as const,
                  message: data.data.message,
                  timestamp: data.data.time,
                };
                logs.push(logEntry);
                const step = executionSteps.find(s => s.id === node.uid);
                if (step) {
                  step.logs.push(logEntry);
                }
                onLog?.(data, node);
              }
            },
            abortSignal,
            sandboxPath,
            cachePath,
            ctx,
            (name, path) => {
              collectedArtifacts.push({
                id: nanoid(),
                name,
                path,
                size: 0,
                type: "folder", // we'll determine type and size later
              });
              onArtifact?.(name, path, node);
            },
          );
        }
        throw new Error(`Execution of node type ${node.type} not implemented in utils.ts`);
      },
      onNodeEnter: (node) => {
        executionSteps.push({
          id: node.uid,
          name: node.origin?.nodeId || node.uid,
          status: "running",
          startTime: Date.now(),
          logs: [],
        });
        onNodeEnter?.(node);
      },
      onNodeExit: async (node) => {
        completedSteps++;
        const step = executionSteps.find(s => s.id === node.uid);
        if (step) {
          step.status = "completed";
          step.endTime = Date.now();
          step.duration = step.endTime - step.startTime;
        }
        if (!shouldDisableHistory) {
          // Update progress in the background
          buildHistoryStorage.update(buildId, { completedSteps, steps: executionSteps }, pipelineId).catch((err) => {
            logger().error(`Failed to update progress for build ${buildId}:`, err);
          });
        }
        onNodeExit?.(node);
      },
      abortSignal,
    });

    const endTime = Date.now();
    if (!shouldDisableHistory) {
      // Process artifacts
      if (collectedArtifacts.length > 0) {
        const artifactsDir = ctx.getArtifactsPath(pipelineId, buildId);
        await mkdir(artifactsDir, { recursive: true });
        for (const artifact of collectedArtifacts) {
          try {
            const destPath = join(artifactsDir, artifact.name);
            const originalNoAsar = process.noAsar;
            process.noAsar = true;
            try {
              await cp(artifact.path, destPath, { recursive: true });
            } finally {
              process.noAsar = originalNoAsar;
            }
            
            // update size and type
            try {
              const s = await stat(destPath);
              artifact.type = s.isDirectory() ? "folder" : "file";
              artifact.size = s.isDirectory() ? await getFolderSize(destPath) : s.size;
              artifact.path = destPath; // update path to persistent location
            } catch (e) {
              logger().warn(`Failed to get size for artifact ${artifact.name}:`, e);
            }
          } catch (e) {
            logger().error(`Failed to copy artifact ${artifact.name}:`, e);
          }
        }
      }
      
      onArtifactsFinalized?.(collectedArtifacts);

      await buildHistoryStorage.update(
        buildId,
        {
          status: "completed",
          endTime,
          duration: endTime - startTime,
          output: result.steps,
          logs,
          steps: executionSteps,
          completedSteps,
          artifacts: collectedArtifacts,
        },
        pipelineId,
      );
    }

    return { result, buildId };
  } catch (error) {
    const endTime = Date.now();
    const isCanceled = error instanceof Error && error.name === "AbortError";

    if (!shouldDisableHistory) {
      // Process artifacts even on failure
      if (collectedArtifacts.length > 0) {
        const artifactsDir = ctx.getArtifactsPath(pipelineId, buildId);
        await mkdir(artifactsDir, { recursive: true });
        for (const artifact of collectedArtifacts) {
          try {
            const destPath = join(artifactsDir, artifact.name);
            const originalNoAsar = process.noAsar;
            process.noAsar = true;
            try {
              await cp(artifact.path, destPath, { recursive: true });
            } finally {
              process.noAsar = originalNoAsar;
            }
            
            // update size and type
            try {
              const s = await stat(destPath);
              artifact.type = s.isDirectory() ? "folder" : "file";
              artifact.size = s.isDirectory() ? await getFolderSize(destPath) : s.size;
              artifact.path = destPath; // update path to persistent location
            } catch (e) {
              logger().warn(`Failed to get size for artifact ${artifact.name}:`, e);
            }
          } catch (e) {
            logger().error(`Failed to copy artifact ${artifact.name}:`, e);
          }
        }
      }
      
      onArtifactsFinalized?.(collectedArtifacts);

        for (const step of executionSteps) {
          if (step.status === "running") {
            step.status = isCanceled ? "cancelled" : "failed";
            step.endTime = endTime;
            step.duration = endTime - step.startTime;
            step.error = {
              message: error instanceof Error ? error.message : String(error),
              timestamp: endTime,
            };
          }
        }

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
            steps: executionSteps,
            completedSteps,
            failedSteps: isCanceled ? 0 : 1,
            cancelledSteps: isCanceled ? 1 : 0,
            artifacts: collectedArtifacts,
          },
          pipelineId,
      );
    }

    throw error;
  } finally {
    if (shouldCleanup) {
      try {
        await rm(sandboxPath, { recursive: true, force: true });
      } catch (e) {
        console.warn(`Failed to cleanup sandbox at ${sandboxPath}:`, e);
      }
      try {
        await rm(cachePath, { recursive: true, force: true });
      } catch (e) {
        console.warn(`Failed to cleanup cache at ${cachePath}:`, e);
      }
    }
  }
};
