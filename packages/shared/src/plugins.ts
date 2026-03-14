import { shallowRef } from "vue";
import { createNodeDefinition } from "@pipelab/plugin-core";
const isDev = process.env.NODE_ENV === "development";

const builtInPlugins = async () => {
  const base = [
    (await import("@pipelab/plugin-construct")).default,
    (await import("@pipelab/plugin-filesystem")).default,
    (await import("@pipelab/plugin-system")).default,
    (await import("@pipelab/plugin-steam")).default,
    (await import("@pipelab/plugin-itch")).default,
    (await import("@pipelab/plugin-electron")).default,
    (await import("@pipelab/plugin-discord")).default,
    (await import("@pipelab/plugin-poki")).default,
    (await import("@pipelab/plugin-nvpatch")).default,
    (await import("@pipelab/plugin-tauri")).default,
  ];

  if (isDev) {
    base.push((await import("@pipelab/plugin-netlify")).default);
  }

  return (await Promise.all([...base])).flat();
};

type Plugin = ReturnType<typeof createNodeDefinition>;

const plugins = shallowRef<Plugin[]>([]);

export const usePlugins = () => {
  const load = () => {};

  const registerBuiltIn = async () => {
    const builtIns = (await builtInPlugins()) as Plugin[];
    plugins.value.push(...builtIns);
  };

  return {
    load,
    registerBuiltIn,
    plugins,
  };
};

export type OutputRuntimes = "construct" | "godot";

export const detectRuntime = async (
  appFolder: string | undefined,
): Promise<OutputRuntimes | undefined> => {
  const { fileExists } = await import("@pipelab/plugin-core");
  const { join } = await import("node:path");

  let detectedRuntime: OutputRuntimes | undefined = undefined;
  if (appFolder) {
    const indexExist = await fileExists(join(appFolder, "index.html"));
    const swExist = await fileExists(join(appFolder, "sw.js"));
    const offlineJSON = await fileExists(join(appFolder, "offline.json"));
    const dataJSON = await fileExists(join(appFolder, "data.json"));
    const scriptsFolder = await fileExists(join(appFolder, "scripts"));
    const workermainJs = await fileExists(join(appFolder, "workermain.js"));

    if (!indexExist) {
      throw new Error("The input folder does not contain an index.html file");
    }

    if (swExist || dataJSON || workermainJs || scriptsFolder) {
      detectedRuntime = "construct";
    }

    console.log("Detected runtime", detectedRuntime);

    if (detectedRuntime === "construct" && offlineJSON && swExist) {
      throw new Error(
        "Construct runtime detected, please disable offline capabilties when using HTML5 export. Offline is already supported by default.",
      );
    }
  }
  return detectedRuntime;
};
