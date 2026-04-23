import { join, dirname } from "node:path";
import { access, chmod, mkdir, rm, readdir, cp } from "node:fs/promises";
import { constants } from "node:fs";
import { userDataPath } from "../context";
import {
  downloadFile,
  generateTempFolder,
  extractZip,
  extractTarGz,
  ensureNPMPackage,
  Hooks,
} from "@pipelab/plugin-core";

/**
 * Installs a specific version of Node.js if not already present.
 */
export const ensureNodeJS = async (version: string) => {
  const nodeDir = join(userDataPath, "thirdparty", "node", version);
  const isWindows = process.platform === "win32";
  const executableName = isWindows ? "node.exe" : "bin/node";
  const finalNodePath = join(nodeDir, executableName);

  try {
    await access(finalNodePath, constants.X_OK);
    return finalNodePath;
  } catch (e) {}

  const arch = process.arch === "x64" ? "x64" : process.arch === "arm64" ? "arm64" : "x86";
  const platform = isWindows ? "win" : process.platform === "darwin" ? "osx" : "linux";
  const extension = isWindows ? "zip" : "tar.gz";
  const downloadPlatform = platform === "osx" ? "darwin" : platform;

  const fileName = `node-v${version}-${downloadPlatform}-${arch}.${extension}`;
  const downloadUrl = `https://nodejs.org/dist/v${version}/${fileName}`;
  const tempDir = await generateTempFolder(join(userDataPath, "thirdparty", ".tmp"));
  const archivePath = join(tempDir, fileName);

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

  console.log(`Extracting Node.js to ${tempDir}...`);
  const extractTempDir = join(tempDir, "extracted");
  await mkdir(extractTempDir, { recursive: true });

  if (extension === "zip") {
    await extractZip(archivePath, extractTempDir);
  } else {
    await extractTarGz(archivePath, extractTempDir);
  }

  const extractedEntries = await readdir(extractTempDir);
  const nodeSubDir = extractedEntries.find((entry) => entry.startsWith(`node-v${version}`));

  if (!nodeSubDir) {
    throw new Error(`Could not find extracted Node.js directory in ${extractTempDir}`);
  }

  const sourceDir = join(extractTempDir, nodeSubDir);
  await mkdir(dirname(nodeDir), { recursive: true });
  await rm(nodeDir, { recursive: true, force: true });
  await cp(sourceDir, nodeDir, { recursive: true });
  await rm(tempDir, { recursive: true, force: true });

  if (!isWindows) {
    await chmod(finalNodePath, 0o755).catch(() => {});
  }

  await access(finalNodePath, constants.X_OK);
  return finalNodePath;
};

/**
 * Installs the PNPM package from npm as a tarball if not already present.
 */
export const ensurePNPM = async (version = "10.12.0") => {
  const packagePath = await ensureNPMPackage(join(userDataPath, "thirdparty"), "pnpm", version);
  return join(packagePath, "bin", "pnpm.cjs");
};
