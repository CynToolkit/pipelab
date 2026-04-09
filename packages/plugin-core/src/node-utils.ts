import { join } from "node:path";

export type OutputRuntimes = "construct" | "godot";

const fileExists = async (path: string): Promise<boolean> => {
  try {
    const { access } = await import("fs/promises");
    await access(path);
    return true;
  } catch {
    return false;
  }
};

/**
 * Detects the runtime of an app folder by checking for specific files.
 * This function depends on Node.js APIs and should only be used in Node environments.
 */
export const detectRuntime = async (
  appFolder: string | undefined,
): Promise<OutputRuntimes | undefined> => {
  if (!appFolder) {
    return undefined;
  }

  const indexExist = await fileExists(join(appFolder, "index.html"));
  const swExist = await fileExists(join(appFolder, "sw.js"));
  const offlineJSON = await fileExists(join(appFolder, "offline.json"));
  const dataJSON = await fileExists(join(appFolder, "data.json"));
  const scriptsFolder = await fileExists(join(appFolder, "scripts"));
  const workermainJs = await fileExists(join(appFolder, "workermain.js"));

  if (!indexExist) {
    throw new Error("The input folder does not contain an index.html file");
  }

  let detectedRuntime: OutputRuntimes | undefined = undefined;

  if (swExist || dataJSON || workermainJs || scriptsFolder) {
    detectedRuntime = "construct";
  }

  console.log("Detected runtime", detectedRuntime);

  if (detectedRuntime === "construct" && offlineJSON && swExist) {
    throw new Error(
      "Construct runtime detected, please disable offline capabilties when using HTML5 export. Offline is already supported by default.",
    );
  }

  return detectedRuntime;
};
