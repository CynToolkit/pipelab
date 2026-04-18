import { join } from "node:path";
import { access, mkdir, chmod, rm } from "node:fs/promises";
import { constants } from "node:fs";
import { downloadFile, extractZip, generateTempFolder } from "@pipelab/plugin-core";

/**
 * Installs itch.io butler CLI if not already present.
 * @param thirdpartyDir The directory where third-party tools are stored.
 * @param version The version of butler to install.
 * @returns A Promise that resolves to the path of the butler executable.
 */
export const ensureButler = async (thirdpartyDir: string, version = "LATEST") => {
  const butlerDir = join(thirdpartyDir, "butler", version);
  const isWindows = process.platform === "win32";
  const executableName = isWindows ? "butler.exe" : "butler";
  const finalButlerPath = join(butlerDir, executableName);

  try {
    await access(finalButlerPath, constants.X_OK);
    return finalButlerPath;
  } catch (e) {
    console.log(`Butler not found at ${finalButlerPath}, installing...`);
  }

  const localOs = process.platform;
  const localArch = process.arch;

  let butlerName = "";
  if (localOs === "darwin") {
    butlerName += "darwin";
  } else if (localOs === "linux") {
    butlerName += "linux";
  } else if (localOs === "win32") {
    butlerName += "windows";
  }

  butlerName += "-";

  if (localArch === "x64" || localArch === "arm64") {
    butlerName += "amd64";
  } else {
    throw new Error(`Unsupported architecture for butler: ${localArch}`);
  }

  const downloadUrl = `https://broth.itch.zone/butler/${butlerName}/${version}/archive/default`;
  const tempDir = await generateTempFolder(join(thirdpartyDir, ".tmp"));
  const archivePath = join(tempDir, "butler.zip");

  console.log(`Downloading butler from ${downloadUrl}...`);
  await downloadFile(downloadUrl, archivePath);

  console.log(`Extracting butler to ${butlerDir}...`);
  await mkdir(butlerDir, { recursive: true });
  await extractZip(archivePath, butlerDir);

  if (!isWindows) {
    await chmod(finalButlerPath, 0o755);
  }

  await rm(tempDir, { recursive: true, force: true });
  return finalButlerPath;
};
