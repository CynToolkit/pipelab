import { join } from "node:path";
import { mkdir, access } from "node:fs/promises";
import { constants } from "node:fs";

/**
 * Installs NVPatch if not already present.
 * @param thirdpartyDir The directory where third-party tools are stored.
 * @returns A Promise that resolves to the path of the nvpatch executable.
 */
export const ensureNVPatch = async (thirdpartyDir: string) => {
  const nvpatchDir = join(thirdpartyDir, "nvpatch");
  const isWindows = process.platform === "win32";
  const executableName = isWindows ? "nvpatch.exe" : "nvpatch";
  const finalPath = join(nvpatchDir, executableName);

  try {
    await access(finalPath, constants.X_OK);
    return finalPath;
  } catch (e) {
    console.log(`NVPatch not found at ${finalPath}, installing...`);
  }

  const { execa } = await import("execa");
  await mkdir(nvpatchDir, { recursive: true });

  console.log(`Installing nvpatch via dotnet tool to ${nvpatchDir}...`);
  // This assumes 'dotnet' is available in the system PATH.
  await execa("dotnet", ["tool", "install", "--tool-path", nvpatchDir, "Topten.nvpatch"]);

  return finalPath;
};
