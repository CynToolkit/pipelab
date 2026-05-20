import { ensureNodeJS, ensurePNPM, fetchPipelabPlugin } from "./utils/remote";
import { pathToFileURL } from "node:url";
import { readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { PipelabContext } from "./context";
import { sendStartupProgress } from "./server";

const DEFAULT_PLUGIN_IDS = [
  "construct",
  "filesystem",
  "system",
  "steam",
  "itch",
  "electron",
  "discord",
  "poki",
  "nvpatch",
  "tauri",
  "minify",
  "netlify",
];

export const loadPipelabPlugin = async (id: string, options: { context: PipelabContext }) => {
  try {
    const packageName = `@pipelab/plugin-${id}`;
    const { packageDir, entryPoint } = await fetchPipelabPlugin(packageName, options.context.releaseTag, {
      context: options.context,
      installDeps: false,
    });

    console.log(`[Plugins] [${id}] Attempting to import from: ${entryPoint}`);
    if (!existsSync(entryPoint)) {
      console.error(`[Plugins] [${id}] CRITICAL: Plugin entry point not found at ${entryPoint}`);
      try {
        const files = await readdir(packageDir, { recursive: true });
        console.log(`[Plugins] [${id}] Directory contents:`, files);
      } catch (e) {}
    }

    const pluginModule = await import(pathToFileURL(entryPoint).href);
    console.log(`[Plugins] [${id}] Successfully loaded from: ${packageDir}`);
    return pluginModule.default;
  } catch (e: any) {
    console.error(`[Plugins] [${id}] CRITICAL: Failed to load:`, e);
    if (e.code === "ERR_MODULE_NOT_FOUND") {
      console.error(
        `[Plugins] [${id}] This usually means a dependency is missing in the plugin's node_modules.`,
      );
    }
    return null;
  }
};

export const builtInPlugins = async (options: { context: PipelabContext }) => {
  console.log("[Plugins] Starting background plugin loading...");

  // Pre-ensure Node.js and PNPM once in parallel so plugins don't have to wait for them
  sendStartupProgress("Preparing environment...");
  await Promise.all([ensureNodeJS(options.context), ensurePNPM(options.context)]);

  const { usePlugins } = await import("@pipelab/shared");
  const { registerPlugins } = usePlugins();
  const { webSocketServer } = await import("./index");

  // Load plugins asynchronously in the background
  (async () => {
    for (const id of DEFAULT_PLUGIN_IDS) {
      sendStartupProgress(`Loading plugin: ${id}`);
      const plugin = await loadPipelabPlugin(id, options);
      if (plugin) {
        registerPlugins([plugin]);
        webSocketServer.broadcast("plugin:loaded", { plugin });
      }
    }
    console.log("[Plugins] All default plugins loaded.");
    sendStartupProgress("All plugins loaded.");
    setTimeout(() => {
      webSocketServer.broadcast("startup:progress", { type: "ready" });
    }, 2000);
  })();

  return [];
};
