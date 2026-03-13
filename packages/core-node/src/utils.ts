import { nanoid } from "nanoid";
import { usePlugins } from "@pipelab/shared/plugins";
import { RendererPluginDefinition } from "@pipelab/plugin-core/pipelab";
import { downloadFile, Hooks } from "@pipelab/plugin-core/utils";
import { access, chmod, mkdir, mkdtemp, realpath, rm, unlink, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { getSystemContext } from "./context";
import { constants, createReadStream } from "node:fs";
import { throttle } from "es-toolkit";
import { processGraph } from "@pipelab/shared/graph";
import { handleActionExecute } from "./handler-func";
import { useLogger } from "@pipelab/shared/logger";
import { buildHistoryStorage } from "./handlers/build-history";
import type { BuildHistoryEntry } from "@pipelab/shared/build-history";
import type { Variable } from "@pipelab/core-app";

export { ensure, generateTempFolder } from "./fs-utils";
export { extractTarGz, extractZip, zipFolder } from "./archive-utils";

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
 * @param version The version of Node.js to install (e.g., '20.11.1').
 * @returns A Promise that resolves to the path of the installed Node.js executable.
 */
export const ensureNodeJS = async (version: string) => {
  const { assetsPath } = await import("./paths");
  const { extractTarGz, extractZip } = await import("./archive-utils");
  const _assetsPath = await assetsPath();
  const nodeDir = join(_assetsPath, "node", version);
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
  const tempDir = await generateTempFolder();
  const archivePath = join(tempDir, fileName);

  // 3. Download the Node.js archive
  console.log(`Downloading Node.js from ${downloadUrl}...`);
  const hooks: Hooks = {
    onProgress: (progress) => {
      console.log(`Download progress: ${progress}%`);
    },
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
  const { readdir } = await import("node:fs/promises");
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
  const { cp } = await import("node:fs/promises");
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
}) => {
  const buildId = nanoid();
  const startTime = Date.now();

  // Save initial build history entry
  const initialEntry: BuildHistoryEntry = {
    id: buildId,
    projectName,
    projectPath,
    pipelineId,
    startTime,
    status: "running",
    logs: [],
  };
  await buildHistoryStorage.save(initialEntry);

  const logs: any[] = [];

  try {
    const result = await processGraph(
      graph,
      variables,
      {
        onNodeEnter: (node) => {
          onNodeEnter?.(node);
        },
        onNodeExit: (node) => {
          onNodeExit?.(node);
        },
        onLog: (data, node) => {
          const logEntry = {
            type: data.type,
            message: data.data.message,
            timestamp: data.data.time,
            nodeUid: node?.uid,
          };
          logs.push(logEntry);
          onLog?.(data, node);
        },
      },
      abortSignal,
      mainWindow,
    );

    const endTime = Date.now();
    await buildHistoryStorage.update(buildId, {
      status: "success",
      endTime,
      duration: endTime - startTime,
      result,
      logs,
    });

    return { result, buildId };
  } catch (error) {
    const endTime = Date.now();
    const isCanceled = error instanceof Error && error.name === "AbortError";

    await buildHistoryStorage.update(buildId, {
      status: isCanceled ? "canceled" : "error",
      endTime,
      duration: endTime - startTime,
      error: error instanceof Error ? error.message : String(error),
      logs,
    });

    throw error;
  }
};
