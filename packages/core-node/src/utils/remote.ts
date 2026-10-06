import { dirname, join } from "node:path";
import { mkdir, readdir, chmod, rm, cp, rename } from "node:fs/promises";
import { existsSync, statSync } from "node:fs";
import { PipelabContext } from "../context";
import { fetchPackage } from "@pipelab/plugin-core";
import { sendStartupProgress } from "../server";
import { downloadFile, extractZip, extractTarGz } from "./fs-extras";
import { DEFAULT_NODE_VERSION, DEFAULT_PNPM_VERSION } from "@pipelab/constants";

export { fetchPackage, runPnpm, isOnline, type FetchOptions } from "@pipelab/plugin-core";

function isNodeJSComplete(nodePath: string): boolean {
  try {
    return existsSync(nodePath) && statSync(nodePath).size > 0;
  } catch {
    return false;
  }
}

/**
 * In-memory lock to prevent concurrent operations on the same resource (e.g., downloading Node.js).
 */
const activeOperations = new Map<string, Promise<string>>();

async function withLock(key: string, fn: () => Promise<string>): Promise<string> {
  const existing = activeOperations.get(key);
  if (existing) {
    console.log(`[Lock] Waiting for concurrent operation on: ${key}`);
    return existing;
  }

  const promise = (async () => {
    try {
      return await fn();
    } finally {
      activeOperations.delete(key);
    }
  })();

  activeOperations.set(key, promise);
  return promise;
}

/**
 * Installs a specific version of Node.js if not already present.
 */
export async function ensureNodeJS(context: PipelabContext, version = DEFAULT_NODE_VERSION) {
  const checkStart = Date.now();
  const isWindows = process.platform === "win32";
  const nodeDir = context.getThirdPartyPath("node", version);
  const finalNodePath = join(nodeDir, isWindows ? "node.exe" : "bin/node");

  if (isNodeJSComplete(finalNodePath)) {
    console.debug(
      `[Environment] Node.js check took ${Date.now() - checkStart}ms (found at ${finalNodePath})`,
    );
    return finalNodePath;
  }

  const lockKey = `node:${version}`;
  return withLock(lockKey, async () => {
    if (isNodeJSComplete(finalNodePath)) return finalNodePath;

    const arch = process.arch === "x64" ? "x64" : process.arch === "arm64" ? "arm64" : "x86";
    const platform = isWindows ? "win" : process.platform === "darwin" ? "osx" : "linux";
    const extension = isWindows ? "zip" : "tar.gz";
    const downloadPlatform = platform === "osx" ? "darwin" : platform;

    const fileName = `node-v${version}-${downloadPlatform}-${arch}.${extension}`;
    const downloadUrl = `https://nodejs.org/dist/v${version}/${fileName}`;
    const tempDir = await context.createTempFolder("node-download-");
    const archivePath = join(tempDir, fileName);

    sendStartupProgress(`Downloading Node.js v${version}...`);
    console.log(`Downloading Node.js from ${downloadUrl}...`);
    const dlStart = Date.now();
    await downloadFile(downloadUrl, archivePath);
    console.debug(`[Environment] Node.js download took ${Date.now() - dlStart}ms`);

    sendStartupProgress(`Extracting Node.js v${version}...`);
    console.log(`Extracting Node.js to ${tempDir}...`);
    const extStart = Date.now();
    const extractTempDir = join(tempDir, "extracted");
    await mkdir(extractTempDir, { recursive: true });

    if (extension === "zip") {
      await extractZip(archivePath, extractTempDir);
    } else {
      await extractTarGz(archivePath, extractTempDir);
    }

    const extractedEntries = await readdir(extractTempDir);
    const nodeSubDir = extractedEntries.find((entry) => entry.startsWith(`node-v${version}`));
    if (!nodeSubDir) throw new Error(`Could not find extracted Node.js directory`);

    const sourceDir = join(extractTempDir, nodeSubDir);
    const parentDir = dirname(nodeDir);
    await mkdir(parentDir, { recursive: true });

    const tempNodeDir = join(
      parentDir,
      `.tmp-node-${version}-${Math.random().toString(36).slice(2)}`,
    );
    await mkdir(tempNodeDir, { recursive: true });

    try {
      await cp(sourceDir, tempNodeDir, { recursive: true });
      if (!isWindows) {
        const tempNodePath = join(tempNodeDir, "bin/node");
        await chmod(tempNodePath, 0o755).catch(() => {});
      }

      if (existsSync(nodeDir)) {
        await rm(nodeDir, { recursive: true, force: true }).catch(() => {});
      }

      try {
        await rename(tempNodeDir, nodeDir);
      } catch (err) {
        if (isNodeJSComplete(finalNodePath)) {
          console.debug(`[Fetcher] Node.js directory already exists and is valid.`);
        } else {
          throw err;
        }
      }
      console.debug(`[Environment] Node.js extraction took ${Date.now() - extStart}ms`);
    } finally {
      await rm(tempNodeDir, { recursive: true, force: true }).catch(() => {});
      await rm(tempDir, { recursive: true, force: true }).catch(() => {});
    }

    console.debug(`[Environment] Node.js set up complete in ${Date.now() - checkStart}ms`);
    return finalNodePath;
  });
}

/**
 * Installs the PNPM package from npm if not already present.
 */
export async function ensurePNPM(context: PipelabContext, version = DEFAULT_PNPM_VERSION) {
  const checkStart = Date.now();
  const pnpmDir = context.getPackagesPath("pnpm", version);
  const pnpmPath = join(pnpmDir, "bin", "pnpm.cjs");

  if (existsSync(pnpmPath)) {
    console.debug(
      `[Environment] PNPM check took ${Date.now() - checkStart}ms (found at ${pnpmPath})`,
    );
    return pnpmPath;
  }

  const lockKey = `pnpm:${version}`;
  return withLock(lockKey, async () => {
    if (existsSync(pnpmPath)) return pnpmPath;
    sendStartupProgress(`Checking PNPM v${version}...`);
    const { packageDir } = await fetchPackage("pnpm", version, {
      context,
    });
    console.debug(`[Environment] PNPM set up complete in ${Date.now() - checkStart}ms`);
    return join(packageDir, "bin", "pnpm.cjs");
  });
}
