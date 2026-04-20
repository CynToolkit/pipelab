import { nanoid } from "nanoid";
import { usePlugins } from "@pipelab/shared";
import { RendererPluginDefinition } from "@pipelab/plugin-core";
import { downloadFile, Hooks } from "@pipelab/plugin-core";
import { access, chmod, mkdir, rm, writeFile, readdir, cp } from "node:fs/promises";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { userDataPath, assetsPath, isDev, projectRoot } from "./context";
import { constants, existsSync } from "node:fs";
import { processGraph } from "@pipelab/shared";
import { handleActionExecute } from "./handler-func";
import { useLogger } from "@pipelab/shared";
import { buildHistoryStorage } from "./handlers/build-history";
import type { BuildHistoryEntry } from "@pipelab/shared";
import type { Variable } from "@pipelab/shared";

import {
  ensure,
  generateTempFolder,
  extractTarGz,
  extractZip,
  zipFolder,
  ensureNPMPackage,
} from "@pipelab/plugin-core";
import { fetchPipelabAsset, fetchPipelabPlugin } from "./utils/remote";
import { setupConfigFile } from "./config";
import { AppConfig } from "@pipelab/shared";

export const getFinalPlugins = () => {
  const { plugins } = usePlugins();
  // console.log('plugins.value', plugins.value)

  const finalPlugins: RendererPluginDefinition[] = [];

  for (const plugin of plugins.value) {
    const finalNodes = [];
    for (const node of plugin.nodes) {
      finalNodes.push({
        ...node,
      });
    }

    finalPlugins.push({
      ...plugin,
      nodes: finalNodes,
    });
  }

  return finalPlugins;
};

/**
 * Installs a specific version of Node.js if not already present.
 * @param version The version of Node.js to install (e.g., '24.14.1').
 * @returns A Promise that resolves to the path of the installed Node.js executable.
 */
export const ensureNodeJS = async (version: string) => {
  const nodeDir = join(userDataPath, "thirdparty", "node", version);
  const isWindows = process.platform === "win32";
  const executableName = isWindows ? "node.exe" : "bin/node";
  const finalNodePath = join(nodeDir, executableName);

  // 1. Check if Node.js is already installed
  try {
    await access(finalNodePath, constants.X_OK); // Check if file exists and is executable
    console.log(`Node.js ${version} already installed at ${finalNodePath}`);
    return finalNodePath;
  } catch (e) {
    // Not installed or not executable, proceed with installation
    console.log(`Node.js ${version} not found at ${finalNodePath}, installing...`);
  }

  // 2. Determine architecture and platform for the download URL
  const arch = process.arch === "x64" ? "x64" : process.arch === "arm64" ? "arm64" : "x86";
  const platform = isWindows ? "win" : process.platform === "darwin" ? "osx" : "linux";
  const extension = isWindows ? "zip" : "tar.gz";

  // Adjust platform name for macOS in Node.js download URLs
  const downloadPlatform = platform === "osx" ? "darwin" : platform;

  const fileName = `node-v${version}-${downloadPlatform}-${arch}.${extension}`;
  const downloadUrl = `https://nodejs.org/dist/v${version}/${fileName}`;
  const tempDir = await generateTempFolder(join(userDataPath, "thirdparty", ".tmp"));
  const archivePath = join(tempDir, fileName);

  // 3. Download the Node.js archive
  console.log(`Downloading Node.js from ${downloadUrl}...`);
  const hooks: Hooks = {
    onProgress: (() => {
      let lastProgress = -1;
      return (progress) => {
        const p = Math.floor(progress.progress / 25) * 25;
        if (p > lastProgress) {
          lastProgress = p;
          console.log(`Download progress: ${p}%`);
        }
      };
    })(),
  };
  await downloadFile(downloadUrl, archivePath, hooks);

  // 4. Extract the archive to a temporary location
  console.log(`Extracting Node.js to ${tempDir}...`);
  const extractTempDir = join(tempDir, "extracted");
  await mkdir(extractTempDir, { recursive: true });

  if (extension === "zip") {
    await extractZip(archivePath, extractTempDir);
  } else {
    await extractTarGz(archivePath, extractTempDir);
  }

  // 5. Locate the extracted directory (it's usually node-vX.Y.Z-platform-arch)
  const extractedEntries = await readdir(extractTempDir);
  const nodeSubDir = extractedEntries.find((entry) => entry.startsWith(`node-v${version}`));

  if (!nodeSubDir) {
    throw new Error(`Could not find extracted Node.js directory in ${extractTempDir}`);
  }

  const sourceDir = join(extractTempDir, nodeSubDir);

  // 6. Move the extracted files to the final destination
  console.log(`Moving Node.js to ${nodeDir}...`);
  await mkdir(dirname(nodeDir), { recursive: true });
  await rm(nodeDir, { recursive: true, force: true }); // Clean up existing directory if any
  // Use rename if on the same device, but copy + rm is safer across different devices/partitions
  await cp(sourceDir, nodeDir, { recursive: true });

  // 7. Clean up temporary files
  await rm(tempDir, { recursive: true, force: true });

  // 8. On non-Windows platforms, ensure the node binary is executable
  if (!isWindows) {
    try {
      await chmod(finalNodePath, 0o755);
    } catch (e) {
      console.warn(`Warning: Failed to set permissions on ${finalNodePath}:`, e);
    }
  }
  // 9. Final check: Verify the executable exists and is accessible after extraction
  try {
    await access(finalNodePath, constants.X_OK); // Check existence and executability
    console.log(`Node.js ${version} successfully installed and verified at ${finalNodePath}`);
    return finalNodePath; // Success, return the path
  } catch (e: any) {
    // This should ideally not happen if extraction was reported as successful and chmod ran
    throw new Error(
      `Node.js executable not found or not executable after extraction at ${finalNodePath}. Extraction might have completed with errors or the directory structure is unexpected.`,
    );
  }
};

/**
 * Installs the PNPM package from npm as a tarball if not already present.
 * @returns A Promise that resolves to the path of the pnpm.cjs executable.
 */
export const ensurePNPM = async (version = "10.12.0") => {
  const packagePath = await ensureNPMPackage(join(userDataPath, "thirdparty"), "pnpm", version);
  return join(packagePath, "bin", "pnpm.cjs");
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
  abortSignal,
  mainWindow,
  cachePath,
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
}) => {
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

        let pluginDefinition;
        if (isDev && projectRoot) {
          try {
            let pluginPath = join(
              projectRoot,
              "plugins",
              `plugin-${pluginId}`,
              "src",
              "index.ts",
            );
            if (!existsSync(pluginPath)) {
              pluginPath = join(
                projectRoot,
                "plugins",
                `plugin-${pluginId}`,
                "dist",
                "index.mjs",
              );
            }
            const pluginModule = await import(pathToFileURL(pluginPath).href);
            pluginDefinition = pluginModule.default;
          } catch (e) {
            logger().warn(
              `[Runner] Could not load "${packageName}" from plugins folder in dev, falling back to download...`,
            );
          }
        }

        if (!pluginDefinition) {
          const pluginDir = await fetchPipelabPlugin(packageName);
          const pluginPath = join(pluginDir, "dist", "index.mjs");
          const pluginModule = await import(pathToFileURL(pluginPath).href);
          pluginDefinition = pluginModule.default;
        }

        registerPlugins([pluginDefinition]);
        logger().info(`[Runner] Plugin "${pluginId}" loaded and registered successfully`);
      } catch (e) {
        logger().error(`[Runner] Failed to load or register plugin "${pluginId}":`, e);
      }
    }
  }

  logger().info(`[Sandbox] Execution sandbox created at: ${sandboxPath}`);
  const settingsFile = await setupConfigFile<AppConfig>("settings");
  const config = await settingsFile.getConfig();
  const shouldCleanup = config?.clearTemporaryFoldersOnPipelineEnd ?? true;

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
    if (shouldCleanup) {
      try {
        await rm(sandboxPath, { recursive: true, force: true });
      } catch (e) {
        console.warn(`Failed to cleanup sandbox at ${sandboxPath}:`, e);
      }
    }
  }
};
